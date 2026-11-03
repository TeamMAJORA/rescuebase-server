const mongoose = require("mongoose");
const archiver = require("archiver");

const Report = require("../models/Reports");
const User = require("../models/User");
const Animal = require("../models/Animal");
const MedicalRequest = require("../models/MedicalRequest");
const AdoptionApplication = require("../models/AdoptionApplication");
const FosterAssignment = require("../models/FosterAssignment");
const LostFoundReport = require("../models/LostFoundReport");
const MedicalRecord = require("../models/MedicalRecord");
const VaccinationRecord = require("../models/VaccinationRecord");

// Animal id -> name, for records that only store the animal id
async function animalNameMap(ids) {
    const unique = [...new Set(ids.filter(Boolean).map(String))];
    if (unique.length === 0) return {};

    const animals = await Animal.find({ _id: { $in: unique } }).select("name").lean();
    return Object.fromEntries(animals.map((animal) => [String(animal._id), animal.name]));
}

// ==================================================
// HELPERS
// ==================================================

function createError(message, statusCode = 400) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

function sanitizeFilename(value) {
    return (
        String(value || "rescuebase_report")
            .trim()
            .replace(/[^a-z0-9_-]+/gi, "_")
            .replace(/^_+|_+$/g, "") || "rescuebase_report"
    );
}

function csvValue(value) {
    if (value === null || value === undefined) {
        return '""';
    }

    if (value instanceof Date) {
        value = value.toISOString();
    } else if (typeof value === "object") {
        value = JSON.stringify(value);
    }

    let text = String(value);

    // Protect spreadsheet users from CSV formula injection.
    if (/^[\t\r\n ]*[=+\-@]/.test(text)) {
        text = `'${text}`;
    }

    return `"${text.replace(/"/g, '""')}"`;
}

function toCSV(rows, columns) {
    const header = columns
        .map((column) => csvValue(column.label))
        .join(",");

    const lines = rows.map((row) =>
        columns
            .map((column) => {
                let value;

                try {
                    value =
                        typeof column.value === "function"
                            ? column.value(row)
                            : row?.[column.value];
                } catch {
                    value = "";
                }

                return csvValue(value);
            })
            .join(",")
    );

    // BOM helps Excel recognize UTF-8.
    return "\uFEFF" + [header, ...lines].join("\r\n");
}

function dateFilter(field, fromDate, toDate) {
    if (!fromDate && !toDate) {
        return {};
    }

    const range = {};

    if (fromDate) range.$gte = fromDate;
    if (toDate) range.$lte = toDate;

    return { [field]: range };
}

function parseDateRange(body = {}) {
    const range = String(body.dateRange || "all")
        .trim()
        .toLowerCase();

    const now = new Date();

    if (range === "all") {
        return {
            fromDate: null,
            toDate: null,
            dateRange: range,
        };
    }

    if (range === "current-year") {
        return {
            fromDate: new Date(now.getFullYear(), 0, 1),
            toDate: new Date(
                now.getFullYear(),
                11,
                31,
                23,
                59,
                59,
                999
            ),
            dateRange: range,
        };
    }

    if (range === "current-month") {
        return {
            fromDate: new Date(
                now.getFullYear(),
                now.getMonth(),
                1
            ),
            toDate: new Date(
                now.getFullYear(),
                now.getMonth() + 1,
                0,
                23,
                59,
                59,
                999
            ),
            dateRange: range,
        };
    }

    if (range !== "custom") {
        throw createError(
            'Invalid dateRange. Use "all", "current-year", "current-month", or "custom".'
        );
    }

    const {
        fromDate: fromValue,
        toDate: toValue,
    } = body;

    if (!fromValue || !toValue) {
        throw createError(
            "Both fromDate and toDate are required for a custom date range."
        );
    }

    // "YYYY-MM-DD" from a date picker means that day in local time
    // (new Date("2026-10-16") would be 8 AM in Manila and miss the early hours)
    const toLocalDate = (value) => {
        const match = typeof value === "string" && value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        return match
            ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
            : new Date(value);
    };

    const fromDate = toLocalDate(fromValue);
    const toDate = toLocalDate(toValue);

    if (
        Number.isNaN(fromDate.getTime()) ||
        Number.isNaN(toDate.getTime())
    ) {
        throw createError("Invalid report date range.");
    }

    if (fromDate > toDate) {
        throw createError(
            "fromDate must be earlier than or equal to toDate."
        );
    }

    // Include the whole ending day for YYYY-MM-DD values.
    if (
        typeof toValue === "string" &&
        /^\d{4}-\d{2}-\d{2}$/.test(toValue)
    ) {
        toDate.setHours(23, 59, 59, 999);
    }

    return {
        fromDate,
        toDate,
        dateRange: range,
    };
}

function selectedDatasets(body = {}) {
    const reportType = String(body.reportType || "all")
        .trim()
        .toLowerCase();

    const supportedTypes = [
        "all",
        "animals",
        "medical",
        "adoption",
        "foster",
        "lost-found",
        "vaccinations",
    ];

    if (!supportedTypes.includes(reportType)) {
        throw createError(
            "Invalid reportType. Use all, animals, medical, adoption, foster, or lost-found."
        );
    }

    // Dogs/cats split only applies when the animal list is included
    const species =
        reportType === "all" && body.includeAnimals === false
            ? "all"
            : String(body.species || "all").trim().toLowerCase();

    if (!["all", "dog", "cat"].includes(species)) {
        throw createError("Invalid species. Use all, dog, or cat.");
    }

    if (
        reportType === "all" &&
        [
            body.includeAnimals,
            body.includeMedical,
            body.includeVaccinations,
            body.includeAdoptions,
            body.includeFoster,
            body.includeLostFound,
        ].every((value) => value === false)
    ) {
        throw createError("Pick at least one dataset to include.");
    }

    return {
        reportType,
        species,

        includeAnimals:
            reportType === "animals" ||
            (reportType === "all" &&
                body.includeAnimals !== false),

        includeMedicalRecords:
            reportType === "medical" ||
            (reportType === "all" &&
                body.includeMedical !== false),

        includeAdoptionApplications:
            reportType === "adoption" ||
            (reportType === "all" &&
                body.includeAdoptions !== false),

        includeFosterAssignments:
            reportType === "foster" ||
            (reportType === "all" &&
                body.includeFoster !== false),

        includeLostFoundReports:
            reportType === "lost-found" ||
            (reportType === "all" &&
                body.includeLostFound !== false),

        includeVaccinations:
            reportType === "vaccinations" ||
            (reportType === "all" &&
                body.includeVaccinations !== false),
    };
}

function buildDateMetadata(fromDate, toDate) {
    if (!fromDate && !toDate) {
        return "All dates";
    }

    return [
        fromDate ? fromDate.toISOString() : "Beginning",
        toDate ? toDate.toISOString() : "Present",
    ].join(" to ");
}

function getUserId(req) {
    return (
        req.user?.id ||
        req.user?._id ||
        req.user?.userId ||
        null
    );
}

async function getAuthenticatedUser(req) {
    const userId = getUserId(req);

    if (!userId || !mongoose.isValidObjectId(userId)) {
        throw createError(
            "Authenticated user is missing or invalid.",
            401
        );
    }

    const user = await User.findById(userId).select(
        "_id name username email role"
    );

    if (!user) {
        throw createError(
            "Authenticated user account was not found.",
            401
        );
    }

    return user;
}

// ==================================================
// CREATE SAVED REPORT
// POST /api/reports
// ==================================================

exports.createReport = async (req, res) => {
    const user = await getAuthenticatedUser(req);

    const title = String(req.body?.title || "").trim();
    const type = String(req.body?.type || "").trim().toLowerCase();
    const period = String(req.body?.period || "").trim();
    const summary = String(req.body?.summary || "").trim();
    const status = String(req.body?.status || "draft")
        .trim()
        .toLowerCase();

    if (!title) throw createError("Report title is required.");
    if (!type) throw createError("Report type is required.");
    if (!period) throw createError("Report period is required.");
    if (!summary) throw createError("Report summary is required.");

    const allowedTypes = [
        "adoption",
        "foster",
        "lost-found",
        "gis",
        "feedback",
        "analytics",
    ];

    if (!allowedTypes.includes(type)) {
        throw createError("Invalid report type.");
    }

    if (!["draft", "finalized"].includes(status)) {
        throw createError("Invalid report status.");
    }

    const report = await Report.create({
        title,
        type,
        period,
        summary,
        status,
        createdBy: user._id,
        createdByName: user.name || user.username || "User",
        createdByEmail: user.email || "",
        finalizedAt: status === "finalized" ? new Date() : null,
    });

    return res.status(201).json({
        success: true,
        message: "Report created successfully.",
        report,
    });
};

// ==================================================
// GENERATE CSV ZIP EXPORT
// POST /api/reports/generate
// ==================================================

//Csv reports
async function buildExport({ user, fromDate, toDate, datasets, generatedAt, period }) {
    const {
        reportType,
        includeAnimals,
        includeMedicalRecords,
        includeAdoptionApplications,
        includeFosterAssignments,
        includeLostFoundReports,
        includeVaccinations,
    } = datasets;

    const exportData = {};
    const counts = {};

    // Dogs / cats filter. Records that only store an animal id are kept
    // when that animal is the chosen species.
    const species = ["dog", "cat"].includes(datasets.species) ? datasets.species : "all";
    const speciesType = species === "dog" ? "Dog" : species === "cat" ? "Cat" : null;
    let speciesIds = null;

    if (speciesType) {
        const matching = await Animal.find({ type: speciesType }).select("_id").lean();
        speciesIds = new Set(matching.map((animal) => String(animal._id)));
    }

    const keepAnimal = (id) => !speciesIds || (Boolean(id) && speciesIds.has(String(id)));

    // --------------------------------------------------
    // ANIMALS
    // --------------------------------------------------

    if (includeAnimals) {
        const animals = await Animal.find({
            ...dateFilter("intakeDate", fromDate, toDate),
            ...(speciesType ? { type: speciesType } : {}),
        })
            .sort({ intakeDate: -1 })
            .lean();

        counts["animals"] = animals.length;
        exportData["animals.csv"] = toCSV(animals, [
            { label: "Animal ID", value: "_id" },
            { label: "Name", value: "name" },
            { label: "Type", value: "type" },
            { label: "Breed", value: "breed" },
            { label: "Age", value: "age" },
            { label: "Gender", value: "gender" },
            { label: "Size", value: "size" },
            { label: "Color", value: "color" },
            { label: "Intake Date", value: "intakeDate" },
            { label: "Intake Type", value: "intakeType" },
            { label: "Intake Status", value: "intakeStatus" },
            { label: "Intake Condition", value: "intakeCondition" },
            { label: "Availability Status", value: "availabilityStatus" },
            { label: "Adoption Status", value: "adoptionStatus" },
            { label: "Foster Status", value: "fosterStatus" },
            { label: "Medical Status", value: "medicalStatus" },
            { label: "Location", value: "location" },
            { label: "Source Location", value: "sourceLocation" },
            { label: "Rescued By", value: "rescuedBy" },
            { label: "Created By", value: "createdByName" },
            { label: "Created By Email", value: "createdByEmail" },
            { label: "Latitude", value: "latitude" },
            { label: "Longitude", value: "longitude" },
            { label: "Description", value: "description" },
            { label: "Intake Notes", value: "intakeNotes" },
            { label: "Behavior Notes", value: "behaviorNotes" },
        ]);
    }

    // --------------------------------------------------
    // MEDICAL RECORDS
    // --------------------------------------------------

    if (includeMedicalRecords) {
        const medicalRecords = (await MedicalRequest.find(
            dateFilter("createdAt", fromDate, toDate)
        )
            .sort({ createdAt: -1 })
            .lean()).filter((record) => keepAnimal(record.petId));

        const medicalRows = medicalRecords.map((record) => ({
            source: "MedicalRequest",
            recordId: record._id,
            assignmentId: record.assignmentId,
            petId: record.petId,
            petName: record.petName,
            fosterEmail: record.fosterEmail,
            issueType: record.issueType,
            issue: "",
            priority: record.priority,
            urgency: "",
            description: record.description,
            status: record.status,
            adminResponse: record.adminResponse,
            resolutionNotes: "",
            resolvedAt: record.resolvedAt,
            submittedBy: "",
            submittedByEmail: "",
            reviewedBy: "",
            createdAt: record.createdAt,
            updatedAt: record.updatedAt,
        }));

        // Also include requests embedded in foster assignments.
        const assignments = await FosterAssignment.find({})
            .select("_id petName fosterEmail medicalRequests animalId")
            .lean();

        for (const assignment of assignments) {
            if (!keepAnimal(assignment.animalId)) continue;

            for (const request of assignment.medicalRequests || []) {
                if (!request) continue;

                const requestDate = request.createdAt
                    ? new Date(request.createdAt)
                    : null;

                if (
                    fromDate &&
                    (!requestDate ||
                        Number.isNaN(requestDate.getTime()) ||
                        requestDate < fromDate)
                ) {
                    continue;
                }

                if (
                    toDate &&
                    (!requestDate ||
                        Number.isNaN(requestDate.getTime()) ||
                        requestDate > toDate)
                ) {
                    continue;
                }

                medicalRows.push({
                    source: "FosterAssignment.medicalRequests",
                    recordId: request._id,
                    assignmentId: assignment._id,
                    petId: "",
                    petName: assignment.petName,
                    fosterEmail: assignment.fosterEmail,
                    issueType: "",
                    issue: request.issue,
                    priority: "",
                    urgency: request.urgency,
                    description: "",
                    status: request.status,
                    adminResponse: "",
                    resolutionNotes: request.resolutionNotes,
                    resolvedAt: request.resolvedAt,
                    submittedBy: request.submittedBy,
                    submittedByEmail: request.submittedByEmail,
                    reviewedBy: request.reviewedBy,
                    createdAt: request.createdAt,
                    updatedAt: request.updatedAt,
                });
            }
        }

        // Clinic records from the Medical Records module
        const clinicRecords = (await MedicalRecord.find(
            dateFilter("record_date", fromDate, toDate)
        )
            .sort({ record_date: -1 })
            .lean()).filter((record) => keepAnimal(record.animal_id));

        const clinicNames = await animalNameMap(clinicRecords.map((record) => record.animal_id));

        for (const record of clinicRecords) {
            medicalRows.push({
                source: "MedicalRecord",
                recordId: record._id,
                assignmentId: "",
                petId: record.animal_id,
                petName: clinicNames[String(record.animal_id)] || "",
                fosterEmail: "",
                issueType: record.record_type,
                issue: "",
                priority: "",
                urgency: "",
                description: record.notes,
                status: "",
                adminResponse: "",
                resolutionNotes: "",
                resolvedAt: "",
                submittedBy: record.veterinarian,
                submittedByEmail: "",
                reviewedBy: "",
                createdAt: record.record_date,
                updatedAt: record.updatedAt,
            });
        }

        counts["medical_records"] = medicalRows.length;
        exportData["medical_records.csv"] = toCSV(medicalRows, [
            { label: "Source", value: "source" },
            { label: "Record ID", value: "recordId" },
            { label: "Assignment ID", value: "assignmentId" },
            { label: "Pet ID", value: "petId" },
            { label: "Pet Name", value: "petName" },
            { label: "Foster Email", value: "fosterEmail" },
            { label: "Issue Type", value: "issueType" },
            { label: "Issue", value: "issue" },
            { label: "Priority", value: "priority" },
            { label: "Urgency", value: "urgency" },
            { label: "Description", value: "description" },
            { label: "Status", value: "status" },
            { label: "Admin Response", value: "adminResponse" },
            { label: "Resolution Notes", value: "resolutionNotes" },
            { label: "Resolved At", value: "resolvedAt" },
            { label: "Submitted By", value: "submittedBy" },
            { label: "Submitted By Email", value: "submittedByEmail" },
            { label: "Reviewed By", value: "reviewedBy" },
            { label: "Created At", value: "createdAt" },
            { label: "Updated At", value: "updatedAt" },
        ]);
    }

        // --------------------------------------------------
    // ADOPTION APPLICATIONS
    // --------------------------------------------------

    if (includeAdoptionApplications) {
        const applications = (await AdoptionApplication.find(
            dateFilter("createdAt", fromDate, toDate)
        )
            .sort({ createdAt: -1 })
            .lean()).filter((application) => keepAnimal(application.animalId));

        counts["adoption_applications"] = applications.length;
        exportData["adoption_applications.csv"] = toCSV(applications, [
            { label: "Application ID", value: "_id" },
            { label: "Applicant User ID", value: "applicantUserId" },
            { label: "Applicant Name", value: "fullName" },
            { label: "Email", value: "email" },
            { label: "Phone", value: "phone" },
            { label: "Address", value: "address" },
            { label: "Animal ID", value: "animalId" },
            { label: "Pet Name", value: "petName" },
            { label: "Pet Breed", value: "petBreed" },
            { label: "Home Type", value: "homeType" },
            { label: "Has Children", value: "hasChildren" },
            { label: "Has Other Pets", value: "hasOtherPets" },
            { label: "Reason", value: "reason" },
            { label: "Experience", value: "experience" },
            { label: "Role", value: "role" },
            { label: "Status", value: "status" },
            { label: "Documents Verified", value: "documentsVerified" },
            {
                label: "Document Names",
                value: (row) =>
                    (row.documents || [])
                        .filter(Boolean)
                        .map((doc) => doc.documentName)
                        .filter(Boolean)
                        .join("; "),
            },
            {
                label: "Document Statuses",
                value: (row) =>
                    (row.documents || [])
                        .filter(Boolean)
                        .map((doc) => doc.status)
                        .filter(Boolean)
                        .join("; "),
            },
            { label: "Reviewed By", value: "reviewedByName" },
            { label: "Reviewer Email", value: "reviewedByEmail" },
            { label: "Review Notes", value: "reviewNotes" },
            { label: "Rejection Reason", value: "rejectionReason" },
            { label: "Reviewed At", value: "reviewedAt" },
            { label: "Interview Schedule", value: "interviewSchedule" },
            { label: "Created At", value: "createdAt" },
            { label: "Updated At", value: "updatedAt" },
        ]);
    }

    // --------------------------------------------------
    // FOSTER ASSIGNMENTS
    // --------------------------------------------------

    if (includeFosterAssignments) {
        const assignments = (await FosterAssignment.find(
            dateFilter("createdAt", fromDate, toDate)
        )
            .sort({ createdAt: -1 })
            .lean()).filter((assignment) => keepAnimal(assignment.animalId));

        counts["foster_assignments"] = assignments.length;
        exportData["foster_assignments.csv"] = toCSV(assignments, [
            { label: "Assignment ID", value: "_id" },
            { label: "Pet Name", value: "petName" },
            { label: "Pet Breed", value: "petBreed" },
            { label: "Foster Name", value: "fosterName" },
            { label: "Foster Email", value: "fosterEmail" },
            { label: "Foster Application ID", value: "fosterApplicationId" },
            { label: "Shelter Name", value: "shelterName" },
            { label: "Status", value: "status" },
            { label: "Start Date", value: "startDate" },
            { label: "End Date", value: "endDate" },
            { label: "Care Instructions", value: "careInstructions" },
            {
                label: "Behavior Evaluation Status",
                value: (row) => row.behaviorEvaluation?.status,
            },
            {
                label: "Behavior Evaluation Notes",
                value: (row) => row.behaviorEvaluation?.notes,
            },
            {
                label: "Energy Level",
                value: (row) => row.behaviorEvaluation?.energyLevel,
            },
            {
                label: "Friendliness",
                value: (row) => row.behaviorEvaluation?.friendliness,
            },
            {
                label: "Human Sociability",
                value: (row) => row.behaviorEvaluation?.humanSociability,
            },
            {
                label: "Animal Sociability",
                value: (row) => row.behaviorEvaluation?.animalSociability,
            },
            {
                label: "Trainability",
                value: (row) => row.behaviorEvaluation?.trainability,
            },
            {
                label: "Anxiety Level",
                value: (row) => row.behaviorEvaluation?.anxietyLevel,
            },
            {
                label: "Aggression Level",
                value: (row) => row.behaviorEvaluation?.aggressionLevel,
            },
            {
                label: "Activity Level",
                value: (row) => row.behaviorEvaluation?.activityLevel,
            },
            {
                label: "Update Count",
                value: (row) => (row.updates || []).filter(Boolean).length,
            },
            {
                label: "Medical Request Count",
                value: (row) =>
                    (row.medicalRequests || []).filter(Boolean).length,
            },
            { label: "Created At", value: "createdAt" },
            { label: "Updated At", value: "updatedAt" },
        ]);
    }

    // --------------------------------------------------
    // VACCINATIONS
    // --------------------------------------------------

    if (includeVaccinations) {
        const vaccinations = (await VaccinationRecord.find(
            dateFilter("vaccination_date", fromDate, toDate)
        )
            .sort({ vaccination_date: -1 })
            .lean()).filter((record) => keepAnimal(record.animal_id));

        const names = await animalNameMap(vaccinations.map((record) => record.animal_id));

        const vaccinationRows = vaccinations.map((record) => ({
            ...record,
            animalName: names[String(record.animal_id)] || "",
        }));

        counts["vaccinations"] = vaccinationRows.length;
        exportData["vaccinations.csv"] = toCSV(vaccinationRows, [
            { label: "Record ID", value: "_id" },
            { label: "Animal ID", value: "animal_id" },
            { label: "Animal Name", value: "animalName" },
            { label: "Vaccine", value: "vaccine_name" },
            { label: "Vaccination Date", value: "vaccination_date" },
            { label: "Next Due Date", value: "next_due_date" },
            { label: "Veterinarian", value: "veterinarian" },
            { label: "Status", value: "status" },
            { label: "Notes", value: "notes" },
            { label: "Created At", value: "createdAt" },
        ]);
    }

    // --------------------------------------------------
    // LOST AND FOUND REPORTS
    // --------------------------------------------------

    if (includeLostFoundReports) {
        const lostFoundReports = await LostFoundReport.find({
            ...dateFilter("dateReported", fromDate, toDate),
            ...(speciesType ? { species: new RegExp(`^${species}`, "i") } : {}),
        })
            .sort({ dateReported: -1 })
            .lean();

        counts["lost_found_reports"] = lostFoundReports.length;
        exportData["lost_found_reports.csv"] = toCSV(lostFoundReports,
            [
                { label: "Report ID", value: "_id" },
                { label: "Report Type", value: "reportType" },
                { label: "Reporter Name", value: "reporterName" },
                { label: "Reporter Email", value: "reporterEmail" },
                { label: "Pet Name", value: "petName" },
                { label: "Species", value: "species" },
                { label: "Breed", value: "breed" },
                { label: "Description", value: "description" },
                { label: "Location", value: "location" },
                { label: "Date Reported", value: "dateReported" },
                { label: "Status", value: "status" },
                { label: "Match Status", value: "matchStatus" },
                { label: "Claim Status", value: "claimStatus" },
                { label: "Claimed By", value: "claimedByName" },
                { label: "Claimed By Email", value: "claimedByEmail" },
                { label: "Claim Notes", value: "claimNotes" },
                { label: "Reviewed By", value: "reviewedByName" },
                { label: "Reviewer Email", value: "reviewedByEmail" },
                { label: "Reviewed At", value: "reviewedAt" },
                { label: "Reunited At", value: "reunitedAt" },
                { label: "Created At", value: "createdAt" },
                { label: "Updated At", value: "updatedAt" },
            ]
        );
    }

    // --------------------------------------------------
    // REPORT METADATA
    // --------------------------------------------------

    const metadata = {
        title: "RESCUEBASE Data Export",
        reportType,
        species: speciesType ? `${speciesType}s only` : "Dogs and cats",
        period,
        generatedAt,
        generatedBy: user.email || String(user._id),
        animalsIncluded: includeAnimals,
        medicalIncluded: includeMedicalRecords,
        adoptionsIncluded: includeAdoptionApplications,
        fosterIncluded: includeFosterAssignments,
        lostFoundIncluded: includeLostFoundReports,
        vaccinationsIncluded: Boolean(includeVaccinations),
        fileCount: Object.keys(exportData).length + 1,
    };

    exportData["report_metadata.csv"] = toCSV([metadata], [
        { label: "Title", value: "title" },
        { label: "Report Type", value: "reportType" },
        { label: "Animals", value: "species" },
        { label: "Date Range", value: "period" },
        { label: "Generated At", value: "generatedAt" },
        { label: "Generated By", value: "generatedBy" },
        { label: "Animals Included", value: "animalsIncluded" },
        { label: "Medical Included", value: "medicalIncluded" },
        { label: "Adoptions Included", value: "adoptionsIncluded" },
        { label: "Foster Included", value: "fosterIncluded" },
        { label: "Lost and Found Included", value: "lostFoundIncluded" },
        { label: "Vaccinations Included", value: "vaccinationsIncluded" },
        { label: "Data File Count", value: "fileCount" },
    ]);

    return { exportData, counts };
}

// Streams the CSV files to the browser as one ZIP
async function sendZip(res, exportData, filename) {
    const archive = archiver("zip", {
        zlib: { level: 9 },
    });

    archive.on("warning", (error) => {
        if (error.code === "ENOENT") {
            console.warn("Report ZIP warning:", error.message);
            return;
        }

        console.error("Report ZIP warning:", error);
        archive.destroy(error);
    });

    archive.on("error", (error) => {
        console.error("Report ZIP generation failed:", error);

        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                message: "Failed to generate report ZIP.",
            });
        } else {
            res.destroy(error);
        }
    });

    res.setHeader("Content-Type", "application/zip");
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`
    );

    archive.pipe(res);

    for (const [fileName, csvContent] of Object.entries(exportData)) {
        archive.append(csvContent, { name: fileName });
    }

    await archive.finalize();
}

// Readable date range for the saved report list
function periodLabel(dateRange, fromDate, toDate) {
    if (dateRange === "all") return "All records";

    if (dateRange === "current-year" && fromDate) {
        return `This year (${fromDate.getFullYear()})`;
    }

    if (dateRange === "current-month" && fromDate) {
        return fromDate.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
    }

    if (dateRange === "custom" && fromDate && toDate) {
        const format = (date) =>
            date.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" });

        return fromDate.toDateString() === toDate.toDateString()
            ? format(fromDate)
            : `${format(fromDate)} to ${format(toDate)}`;
    }

    return buildDateMetadata(fromDate, toDate);
}

exports.generateReport = async (req, res) => {
    const user = await getAuthenticatedUser(req);
    const { fromDate, toDate, dateRange } = parseDateRange(req.body || {});
    const datasets = selectedDatasets(req.body || {});

    const generatedAt = new Date();
    const period = buildDateMetadata(fromDate, toDate);

    const { exportData, counts } = await buildExport({
        user,
        fromDate,
        toDate,
        datasets,
        generatedAt,
        period,
    });

    // Save a record of this report so it shows in "Generated reports".
    // Real data only: the record keeps the settings and row counts,
    // and Download rebuilds the same ZIP from them.
    const title =
        String(req.body?.title || "").trim().slice(0, 160) ||
        "Complete Shelter Report";

    const totalRows = Object.values(counts).reduce((sum, value) => sum + value, 0);

    try {
        const saved = await Report.create({
            title,
            type: datasets.reportType,
            period: periodLabel(dateRange, fromDate, toDate),
            summary: `${Object.keys(counts).length} dataset(s), ${totalRows} record(s).`,
            createdBy: user._id,
            createdByName: user.name || user.username || "User",
            createdByEmail: user.email || "",
            exportFormat: "zip",
            species: datasets.species,
            dateRange,
            fromDate,
            toDate,
            datasets: {
                includeAnimals: datasets.includeAnimals,
                includeMedicalRecords: datasets.includeMedicalRecords,
                includeAdoptionApplications: datasets.includeAdoptionApplications,
                includeFosterAssignments: datasets.includeFosterAssignments,
                includeLostFoundReports: datasets.includeLostFoundReports,
                includeVaccinations: datasets.includeVaccinations,
                species: datasets.species,
            },
            recordCounts: counts,
        });

        res.setHeader("X-Report-Id", String(saved._id));
    } catch (saveError) {
        // The download still works even if the record could not be saved
        console.error("Save generated report error:", saveError.message);
    }

    const filename =
        `${sanitizeFilename(title)}_` +
        `${generatedAt.toISOString().slice(0, 10)}.zip`;

    await sendZip(res, exportData, filename);
};

// ==================================================
// GET ALL SAVED REPORTS
// GET /api/reports
// ==================================================

exports.getAllReports = async (req, res) => {
    const reports = await Report.find()
        .sort({ createdAt: -1 })
        .lean();

    // Filter invalid entries before returning the API response.
    const validReports = reports.filter(
        (report) =>
            report &&
            typeof report === "object" &&
            !Array.isArray(report)
    );

    return res.status(200).json({
        success: true,
        reports: validReports,
    });
};

// ==================================================
// FINALIZE SAVED REPORT
// PATCH /api/reports/:id/finalize
// ==================================================

exports.finalizeReport = async (req, res) => {
    const reportId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(reportId)) {
        throw createError("Invalid report ID.");
    }

    const report = await Report.findById(reportId);

    if (!report) {
        throw createError("Report not found.", 404);
    }

    if (report.status === "finalized") {
        throw createError("This report is already finalized.");
    }

    report.status = "finalized";
    report.finalizedAt = new Date();

    await report.save();

    return res.status(200).json({
        success: true,
        message: "Report finalized successfully.",
        report,
    });
};

// ==================================================
// DOWNLOAD SAVED REPORT AS TEXT
// GET /api/reports/:id/download
// ==================================================

exports.downloadReport = async (req, res) => {
    const reportId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(reportId)) {
        throw createError("Invalid report ID.");
    }

    const report = await Report.findById(reportId).lean();

    if (!report) {
        throw createError("Report not found.", 404);
    }

    // Reports made by Generate keep their settings: rebuild the same ZIP
    if (report.datasets && report.exportFormat === "zip") {
        const user = await getAuthenticatedUser(req);
        const fromDate = report.fromDate ? new Date(report.fromDate) : null;
        const toDate = report.toDate ? new Date(report.toDate) : null;

        const { exportData } = await buildExport({
            user,
            fromDate,
            toDate,
            datasets: { reportType: report.type, ...report.datasets },
            generatedAt: new Date(),
            period: buildDateMetadata(fromDate, toDate),
        });

        return sendZip(
            res,
            exportData,
            `${sanitizeFilename(report.title)}.zip`
        );
    }

    // Older saved reports only have a text summary

    const reportText = `
RESCUEBASE REPORT

Title         : ${report.title || ""}
Type          : ${report.type || ""}
Period        : ${report.period || ""}
Created By    : ${report.createdByName || ""}
Created Email : ${report.createdByEmail || ""}
Created At    : ${report.createdAt || ""}
Status        : ${report.status || "draft"}
Finalized At  : ${report.finalizedAt || "Not finalized"}

Summary:
${report.summary || ""}
`.trim();

    const filename = sanitizeFilename(report.title);

    res.setHeader(
        "Content-Type",
        "text/plain; charset=utf-8"
    );

    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.txt"`
    );

    return res.status(200).send(reportText);
};

// ==================================================
// DELETE SAVED REPORT
// DELETE /api/reports/:id
// ==================================================

exports.deleteReport = async (req, res) => {
    const reportId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(reportId)) {
        throw createError("Invalid report ID.");
    }

    const report = await Report.findByIdAndDelete(reportId);

    if (!report) {
        throw createError("Report not found.", 404);
    }

    return res.status(200).json({
        success: true,
        message: "Report deleted successfully.",
    });
};

