const GISLocation = require("../models/GISLocation");
const LostFoundReport = require("../models/LostFoundReport");
const LedgerEntry = require("../models/LedgerEntry");
const LostFoundMatch = require("../models/LostFoundMatch");
const User = require("../models/User");
const Animal = require("../models/Animal");
const Notification = require("../models/Notifications");
const {
    sendLostFoundClaimEmail,
    sendLostFoundReunitedEmail,
    sendLostFoundMatchEmail,
    sendLostFoundStaffAlertEmail,
} = require("../services/emailService");
const { generateMatches } = require("../services/lostFoundMatchingService");
const stripLegacyContact = require("../utils/stripLegacyContact");

// In-app notification for one user, found by email. Never throws.
async function notifyUserInApp(email, title, message) {
    try {
        const recipient = await User.findOne({ email: String(email || "").trim().toLowerCase() }).select("_id");

        if (recipient) {
            await Notification.create({ user: recipient._id, title, message, type: "lost_found_update" });
        }
    } catch (error) {
        console.error(`Lost & Found in-app notification failed for ${email}:`, error);
    }
}

// In-app notification + email to every admin and staff account. Never throws.
async function notifyShelterStaff(title, message) {
    try {
        const shelterStaff = await User.find({ role: { $in: ["admin", "staff"] } }).select("_id email");

        if (shelterStaff.length) {
            await Notification.insertMany(
                shelterStaff.map((user) => ({ user: user._id, title, message, type: "lost_found_update" }))
            );
        }

        await Promise.allSettled(
            shelterStaff.map((user) => sendLostFoundStaffAlertEmail(user.email, title, message))
        );
    } catch (error) {
        console.error(`Shelter staff notification failed (${title}):`, error);
    }
}

function getActorName(req) {
    return String(req.user?.name || req.user?.username || "User").trim();
}

function getActorEmail(req) {
    return String(req.user?.email || "").trim().toLowerCase();
}

function preventStaffAdmin(req) {
    const role = String(req.user?.role || "")
        .trim()
        .toLowerCase();

    if (role === "admin" || role === "staff") {
        const error = new Error(
            "Staff and Admin accounts cannot submit Lost & Found reports or claims."
        );

        error.statusCode = 403;
        throw error;
    }
}

async function notifyLostFoundMatchOwners(reportA, reportB, isConfirmedByStaff = false) {
    const reports = [
        { owner: reportA, other: reportB },
        { owner: reportB, other: reportA },
    ];

    for (const { owner, other } of reports) {
        // Shelter-listed animals: staff already see claims, skip match alerts to them
        if (owner.linkedAnimal) continue;

        const email = String(owner.reporterEmail || "")
            .trim()
            .toLowerCase();

        if (!email) continue;

        const petName =
            owner.petName || other.petName || "your reported pet";

        // In-app notification
        try {
            const user = await User.findOne({ email }).select("_id email");

            if (user) {
                await Notification.create({
                    user: user._id,
                    title: isConfirmedByStaff
                        ? "Lost & Found Match Confirmed"
                        : "Possible Lost & Found Match",
                    message: isConfirmedByStaff
                        ? `Shelter staff confirmed a matching ${other.reportType} report for ${petName}. Open Lost & Found to check it.`
                        : `RescueBase found a possible matching ${other.reportType} report for ${petName}. Open Lost & Found to check it.`,
                    type: "lost_found_update",
                });
            } else {
                console.warn(
                    `Lost & Found notification skipped: no user found for ${email}`
                );
            }
        } catch (error) {
            console.error(
                `Lost & Found in-app notification failed for ${email}:`,
                error
            );
        }

        // Email notification
        try {
            await sendLostFoundMatchEmail(
                email,
                petName,
                other.reportType,
                other.location
            );
        } catch (error) {
            console.error(
                `Lost & Found match email failed for ${email}:`,
                error
            );
        }
    }
}

async function notifyNewMatches(report, matchingResult) {
    for (const matchedReport of matchingResult.newlyMatchedReports || []) {
        await notifyLostFoundMatchOwners(report, matchedReport);
    }
}

// When a claim is approved, the owner's lost report that was matched to it is reunited too.
async function closeOwnersMatchedLostReports(foundReport, ownerEmail) {
    const pairedMatches = await LostFoundMatch.find({
        $or: [{ reportA: foundReport._id }, { reportB: foundReport._id }],
    }).select("reportA reportB");

    const pairedReportIds = pairedMatches.map((match) =>
        String(match.reportA) === String(foundReport._id) ? match.reportB : match.reportA
    );

    await LostFoundReport.updateMany(
        {
            _id: { $in: pairedReportIds },
            reportType: "lost",
            reporterEmail: ownerEmail,
            status: { $in: ["open", "matched"] },
        },
        { $set: { status: "reunited", reunitedAt: new Date() } }
    );
}

// Shelter animals linked to a found report follow its claim status.
async function updateLinkedAnimal(report, animalChanges) {
    if (!report.linkedAnimal) return;

    await Animal.findByIdAndUpdate(report.linkedAnimal, animalChanges);
}

// Called by animalController when an intake is saved by staff or approved.
// Only intakes ticked "List on Lost & Found" become found reports owners can match and claim.
exports.listShelterIntakeAsFoundReport = async (animal, approvingUser) => {
    try {
        if (!animal.listOnLostFound) return;

        const isAlreadyListed = await LostFoundReport.exists({ linkedAnimal: animal._id });
        if (isAlreadyListed) return;

        const animalColour = String(animal.color || "").toLowerCase();
        const reportColours = LostFoundReport.schema.path("colour").enumValues.filter(Boolean);
        const coloursInAnimalText = reportColours.filter((colour) =>
            animalColour.includes(colour.toLowerCase())
        );
        const reportColour = !animalColour
            ? ""
            : coloursInAnimalText.length > 1
                ? "Mixed"
                : coloursInAnimalText[0] || "Other";

        const hasCoordinates =
            Number.isFinite(animal.latitude) && Number.isFinite(animal.longitude);

        const report = await LostFoundReport.create({
            reporterName: approvingUser?.name || approvingUser?.username || "RescueBase Shelter",
            reporterEmail: approvingUser?.email,
            reportType: "found",
            petName: animal.name || "",
            species: animal.type,
            breed: animal.breed || "",
            colour: reportColour,
            size: animal.size === "Unknown" ? "" : animal.size || "",
            sex: animal.gender || "",
            description:
                animal.description ||
                animal.intakeNotes ||
                `Admitted to the shelter as a ${String(animal.intakeType).toLowerCase()} animal.`,
            location: animal.sourceLocation || animal.location || "RescueBase Shelter",
            coordinates: hasCoordinates
                ? { latitude: animal.latitude, longitude: animal.longitude }
                : { latitude: null, longitude: null },
            eventDate: animal.intakeDate || new Date(),
            photoUrl: animal.image || "",
            linkedAnimal: animal._id,
        });

        const matchingResult = await generateMatches(report._id);
        await notifyNewMatches(report, matchingResult);
        console.log(
            `[LostFound] Shelter intake ${animal._id} listed as found report ${report._id} (${matchingResult.matchesCreated} suggestions)`
        );
    } catch (error) {
        console.error(
            `[LostFound] Shelter intake ${animal._id} could not be listed as a found report:`,
            error
        );
    }
};

exports.createReport = async (req, res) => {
    preventStaffAdmin(req);

    const allowedColours = [
        "Black",
        "White",
        "Brown",
        "Tan",
        "Gray",
        "Grey",
        "Cream",
        "Golden",
        "Orange",
        "Red",
        "Mixed",
        "Other",
    ];

    const allowedSizes = [
        "Small",
        "Medium",
        "Large",
        "Extra Large",
    ];

    const allowedSexes = [
        "Male",
        "Female",
        "Unknown",
    ];

    const reportType = String(req.body.reportType || "").trim().toLowerCase();
    const species = String(req.body.species || "").trim();
    const description = String(req.body.description || "").trim();
    const location = String(req.body.location || "").trim();
    const size = String(req.body.size || "").trim();
    const sex = String(req.body.sex || "").trim();
    const colour = String(
        req.body.colour || req.body.color || ""
    ).trim();

    if (!["lost", "found"].includes(reportType)) {
        const e = new Error("Report type must be either lost or found.");
        e.statusCode = 400;
        throw e;
    }

    if (!species) {
        const e = new Error("Pet species is required.");
        e.statusCode = 400;
        throw e;
    }

    if (!description) {
        const e = new Error("Description is required.");
        e.statusCode = 400;
        throw e;
    }

    if (!location) {
        const e = new Error("Location is required.");
        e.statusCode = 400;
        throw e;
    }

    if (colour && !allowedColours.includes(colour)) {
        const error = new Error("Invalid pet colour.");
        error.statusCode = 400;
        throw error;
    }

    if (size && !allowedSizes.includes(size)) {
        const error = new Error("Invalid pet size.");
        error.statusCode = 400;
        throw error;
    }

    if (sex && !allowedSexes.includes(sex)) {
        const error = new Error("Invalid pet sex.");
        error.statusCode = 400;
        throw error;
    }

    if (reportType === "found" && !String(req.body.photoUrl || "").trim()) {
        const error = new Error("A photo is required for found pet reports so the owner can recognize the pet.");
        error.statusCode = 400;
        throw error;
    }

    const reporterName = getActorName(req);
    const reporterEmail = getActorEmail(req);

    if (!reporterEmail) {
        const e = new Error("Authenticated user email is missing.");
        e.statusCode = 401;
        throw e;
    }

    const reporterContactNumber = String(req.body.contactNumber || "").trim();

    if (!/^9\d{9}$/.test(reporterContactNumber)) {
        const e = new Error("Please enter a valid mobile number: 10 digits starting with 9.");
        e.statusCode = 400;
        throw e;
    }

    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);

    const hasValidCoordinates =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180 &&
        (latitude !== 0 || longitude !== 0);

    const coordinates = hasValidCoordinates
        ? { latitude, longitude }
        : { latitude: null, longitude: null };

    const eventDateValue =
        req.body.eventDate ||
        req.body.dateLost ||
        req.body.dateFound ||
        null;

    const report = await LostFoundReport.create({
        reporterName,
        reporterEmail,
        reporterContactNumber,
        reportType,
        petName: String(req.body.petName || "").trim(),
        species,
        breed: String(req.body.breed || "").trim(),
        description,
        location,
        dateReported: req.body.dateReported || new Date(),
        photoUrl: String(req.body.photoUrl || "").trim(),
        colour,
        size,
        sex,
        coordinates,
        eventDate: eventDateValue,
        status: "open",
        matchStatus: "none",
        claimStatus: "none",
    });

    if (
        Number.isFinite(latitude) && Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
        (latitude !== 0 || longitude !== 0)
    ) {
        try {
            const speciesKey = species.toLowerCase();

            await GISLocation.create({
                petName: report.petName || "Unknown",
                reportType,
                species: ["dog", "cat", "other"].includes(speciesKey) ? speciesKey : "unknown",
                locationName: location,
                latitude,
                longitude,
                status: "open",
                description: String(req.body.mapNote || description).slice(0, 500),
                createdBy: req.user?.id || req.user?._id || null,
                createdByName: reporterName || "",
                createdByEmail: reporterEmail || "",
            });
        } catch (gisError) {
            console.error("Lost & found map pin failed:", gisError.message);
        }
    }

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_report_submitted",
        actorName: reporterName,
        actorEmail: reporterEmail,
        targetType: "LostFoundReport",
        targetId: report._id.toString(),
        description:
            `${reporterName} submitted a ${report.reportType} pet report.`,
        status: report.status,
        metadata: {
            reportType: report.reportType,
            petName: report.petName,
            species: report.species,
            location: report.location,
        },
    });

    let matchingResult = {
        success: false,
        matchesCreated: 0,
    };

    try {
        matchingResult = await generateMatches(report._id);
        await notifyNewMatches(report, matchingResult);

        console.log(
            `[LostFound] Generated ${matchingResult.matchesCreated} suggestions for report ${report._id}`
        );
    } catch (matchingError) {
        console.error(
            "[LostFound] Automatic matching failed:",
            matchingError
        );
    }

    return res.status(201).json({
        success: true,
        message:
            `${report.reportType === "lost" ? "Lost" : "Found"} pet report submitted successfully.`,
        report: reportForViewer(report, req),
        matching: matchingResult,
    });
};

// Contact details and claim proof are for shelter staff. The reporter sees their
// own contact, the claimant their own claim, and the finder the live claim on
// their found report so they can check with the claimant before staff decide.
const STAFF_ONLY_REPORT_FIELDS = [
    "reporterEmail",
    "reporterContactNumber",
    "claimedByName",
    "claimedByEmail",
    "claimNotes",
    "claimContactNumber",
    "claimProofPhotoUrl",
    "reviewedByName",
    "reviewedByEmail",
];
const REPORTER_FIELDS = ["reporterEmail", "reporterContactNumber"];
const CLAIMANT_FIELDS = ["claimedByName", "claimedByEmail", "claimNotes", "claimContactNumber", "claimProofPhotoUrl"];
const CLAIM_STATUSES_SHOWN_TO_FINDER = ["pending", "approved"];

function reportForViewer(report, req) {
    const plain = typeof report.toObject === "function" ? report.toObject() : { ...report };
    const viewerEmail = getActorEmail(req);

    plain.isMine = Boolean(viewerEmail) && plain.reporterEmail === viewerEmail;
    plain.isMyClaim = Boolean(viewerEmail) && plain.claimedByEmail === viewerEmail;

    if (["admin", "staff"].includes(req.user?.role)) return plain;

    for (const field of STAFF_ONLY_REPORT_FIELDS) {
        if (plain.isMine && REPORTER_FIELDS.includes(field)) continue;
        if (plain.isMyClaim && CLAIMANT_FIELDS.includes(field)) continue;
        if (
            plain.isMine &&
            CLAIMANT_FIELDS.includes(field) &&
            CLAIM_STATUSES_SHOWN_TO_FINDER.includes(plain.claimStatus)
        ) continue;
        delete plain[field];
    }

    if (!plain.isMine) plain.description = stripLegacyContact(plain.description);

    return plain;
}

exports.getAllReports = async (req, res) => {
    const reports = await LostFoundReport.find().sort({ createdAt: -1 });

    return res.json({
        success: true,
        reports: reports.map((report) => reportForViewer(report, req)),
    });
};

exports.getMyReports = async (req, res) => {
    const email = getActorEmail(req);

    if (!email) {
        const error = new Error(
            "Authenticated user email is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const reports = await LostFoundReport.find({
        reporterEmail: email,
    }).sort({
        createdAt: -1,
    });

    return res.json({
        success: true,
        reports: reports.map((report) => reportForViewer(report, req)),
    });
};

exports.getReportById = async (req, res) => {
    const report = await LostFoundReport.findById(
        req.params.id
    );

    if (!report) {
        const error = new Error(
            "Lost and found report not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.json({
        success: true,
        report: reportForViewer(report, req),
    });
};

exports.deleteReport = async (req, res) => {
    const { reportId } = req.params;

    const report = await LostFoundReport.findById(reportId);

    if (!report) {
        const e = new Error("Lost and found report not found.");
        e.statusCode = 404;
        throw e;
    }

    await LostFoundReport.findByIdAndDelete(reportId);

    return res.status(200).json({
        success: true,
        message: "Lost and found report deleted successfully.",
    });
};

exports.claimReport = async (req, res) => {
    preventStaffAdmin(req);

    const report = await LostFoundReport.findById(
        req.params.id
    );

    if (!report) {
        const error = new Error(
            "Lost and found report not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (String(report.reportType || "").toLowerCase() === "lost") {
        const error = new Error(
            "Claims cannot be submitted on Lost reports. Only Found reports can be claimed."
        );

        error.statusCode = 400;
        throw error;
    }

    const claimantName = getActorName(req);
    const claimantEmail = getActorEmail(req);

    if (!claimantEmail) {
        const error = new Error(
            "Authenticated user email is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    // A reporter cannot claim their own report.
    if (
        report.reporterEmail === claimantEmail
    ) {
        const error = new Error(
            "You cannot claim your own lost and found report."
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        report.status === "reunited" ||
        report.status === "rejected"
    ) {
        const error = new Error(
            "This report is no longer available for claims."
        );

        error.statusCode = 400;
        throw error;
    }

    if (report.claimStatus === "approved") {
        const error = new Error(
            "This report already has an approved claim."
        );

        error.statusCode = 400;
        throw error;
    }

    if (report.claimStatus === "pending") {
        const error = new Error(
            "This report already has a pending claim."
        );

        error.statusCode = 400;
        throw error;
    }

    if (report.linkedAnimal) {
        const linkedAnimal = await Animal.findById(report.linkedAnimal).select("adoptionStatus availabilityStatus");

        if (!linkedAnimal || ["adopted", "returned_to_owner"].includes(linkedAnimal.adoptionStatus)) {
            const error = new Error(
                "This shelter animal is no longer available for claims."
            );

            error.statusCode = 400;
            throw error;
        }
        report.linkedAnimalAvailabilityBeforeClaim = linkedAnimal.availabilityStatus;
    }

    const MINIMUM_CLAIM_PROOF_LENGTH = 20;
    const claimNotes = String(req.body.claimNotes || "").trim();
    const claimContactNumber = String(req.body.claimContactNumber || "").trim();

    if (claimNotes.length < MINIMUM_CLAIM_PROOF_LENGTH) {
        const error = new Error(
            `Please describe your proof of ownership in at least ${MINIMUM_CLAIM_PROOF_LENGTH} characters.`
        );
        error.statusCode = 400;
        throw error;
    }

    if (!/^9\d{9}$/.test(claimContactNumber)) {
        const error = new Error("Please enter a valid mobile number: 10 digits starting with 9.");
        error.statusCode = 400;
        throw error;
    }

    report.claimStatus = "pending";
    report.claimedByName = claimantName;
    report.claimedByEmail = claimantEmail;
    report.claimNotes = claimNotes;
    report.claimContactNumber = claimContactNumber;
    report.claimProofPhotoUrl = String(req.body.claimProofPhotoUrl || "").trim();
    report.claimedAt = new Date();

    report.status = "claimed";

    await report.save();
    await updateLinkedAnimal(report, { availabilityStatus: "unavailable" });
    await notifyShelterStaff(
        "New Ownership Claim",
        `${claimantName} claimed ${report.petName || `a ${String(report.species).toLowerCase()}`} ` +
            `(${report.linkedAnimal ? "shelter animal" : "found report"})` +
            `${report.claimProofPhotoUrl ? " with a proof photo" : ""}. Review it in Lost & Found.`
    );

    // A user's found report: the finder has the pet, so they verify too.
    if (!report.linkedAnimal) {
        await notifyUserInApp(
            report.reporterEmail,
            "Someone Claimed the Pet You Found",
            `${claimantName} says ${report.petName || `the ${String(report.species).toLowerCase()}`} you found is theirs. ` +
                "Check their proof and mobile number in Lost & Found and contact them to confirm. Shelter staff make the final decision."
        );
    }

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_claim_submitted",

        actorName: claimantName,
        actorEmail: claimantEmail,

        targetType: "LostFoundReport",
        targetId: report._id.toString(),

        description:
            `${claimantName} submitted a claim for ${report.petName || report.species}.`,

        status: report.status,

        metadata: {
            petName: report.petName,
            species: report.species,
            reporterEmail: report.reporterEmail,
            claimNotes: report.claimNotes,
        },
    });

    return res.json({
        success: true,
        message:
            "Claim submitted for verification.",
        report: reportForViewer(report, req),
    });
};


exports.reviewClaim = async (req, res) => {
    const allowedStatuses = [
        "approved",
        "rejected",
    ];

    const requested = String(
        req.body.claimStatus || ""
    ).trim().toLowerCase();

    if (!allowedStatuses.includes(requested)) {
        const error = new Error("Invalid claim status.");
        error.statusCode = 400;
        throw error;
    }

    const report = await LostFoundReport.findById(
        req.params.id
    );

    if (!report) {
        const error = new Error("Lost and found report not found.");
        error.statusCode = 404;
        throw error;
    }

    if (report.claimStatus !== "pending") {
        const error = new Error(
            "This report does not have a pending claim."
        );
        error.statusCode = 400;
        throw error;
    }

    const reviewerName = getActorName(req);
    const reviewerEmail = getActorEmail(req);
    const claimantEmailForMail = report.claimedByEmail;

    report.claimStatus = requested;

    report.reviewedByName = reviewerName;
    report.reviewedByEmail = reviewerEmail;
    report.reviewedAt = new Date();

    report.claimNotes = String(
        req.body.reviewNotes ||
        report.claimNotes ||
        ""
    ).trim();

    if (requested === "approved") {
        // Approval now completes the entire reunion process.
        report.status = "reunited";
        report.reunitedAt = new Date();
    } else {
        // Rejected claims reopen the report so it can be matched and claimed again.
        report.status = "open";

        report.claimedByName = "";
        report.claimedByEmail = "";
        report.claimContactNumber = "";
        report.claimProofPhotoUrl = "";
    }

    await report.save();

    if (requested === "approved") {
        await closeOwnersMatchedLostReports(report, claimantEmailForMail);
    }

    await updateLinkedAnimal(
        report,
        requested === "approved"
            ? { availabilityStatus: "unavailable", adoptionStatus: "returned_to_owner" }
            : { availabilityStatus: report.linkedAnimalAvailabilityBeforeClaim || "unavailable" }
    );
    
    const claimedPetName = report.petName || `the ${String(report.species).toLowerCase()}`;

    const handoverBy = report.linkedAnimal ? "The shelter" : "The finder";

    await notifyUserInApp(
        claimantEmailForMail,
        requested === "approved" ? "Claim Approved" : "Claim Not Approved",
        requested === "approved"
            ? `Your claim for ${claimedPetName} was approved. ${handoverBy} will contact you to arrange the handover.`
            : `Your claim for ${claimedPetName} was not approved. You can still check other reports.`
    );

    if (!report.linkedAnimal) {
        await notifyUserInApp(
            report.reporterEmail,
            requested === "approved" ? "Claim Approved" : "Claim Not Approved",
            requested === "approved"
                ? `Staff approved the claim for ${claimedPetName}. Please contact the owner to hand the pet over.`
                : `Staff rejected the claim for ${claimedPetName}. Your found report is open again.`
        );
    }


    await LedgerEntry.create({
        type: "lost_found",
        action: requested === "approved"
            ? "lost_found_case_reunited"
            : "lost_found_claim_reviewed",

        actorName: reviewerName,
        actorEmail: reviewerEmail,

        targetType: "LostFoundReport",
        targetId: report._id.toString(),

        description:
            requested === "approved"
                ? `${report.petName || report.species} was approved and marked as reunited.`
                : `${report.petName || report.species} claim was rejected.`,

        status: report.status,

        metadata: {
            claimStatus: requested,
            claimedByEmail: claimantEmailForMail,
            reviewNotes: report.claimNotes,
            reunitedAt: report.reunitedAt,
        },
    });

    // Emails are best-effort: the decision is already saved.
    const petNameForEmail = report.petName || report.species;
    const decisionEmails =
        requested === "approved"
            ? [
                sendLostFoundReunitedEmail(report.reporterEmail, petNameForEmail),
                sendLostFoundReunitedEmail(claimantEmailForMail, petNameForEmail),
            ]
            : [sendLostFoundClaimEmail(claimantEmailForMail, petNameForEmail, requested)];

    for (const emailResult of await Promise.allSettled(decisionEmails)) {
        if (emailResult.status === "rejected") {
            console.error("Lost & Found decision email failed:", emailResult.reason);
        }
    }

    return res.json({
        success: true,
        message:
            requested === "approved"
                ? "Claim approved. Lost and found case marked as reunited."
                : "Lost and found claim rejected.",
        report,
    });
};

// Admin/staff: mark a case with an approved claim as reunited
// the cases will be automatically marked as reunited if the claim is approvved
exports.markReportReunited = async (req, res) => {
    const reportId = String(req.params.id || "");

    if (!/^[0-9a-fA-F]{24}$/.test(reportId)) {
        const error = new Error("Invalid report id.");
        error.statusCode = 400;
        throw error;
    }

    const report = await LostFoundReport.findById(reportId);

    if (!report) {
        const error = new Error("Lost and found report not found.");
        error.statusCode = 404;
        throw error;
    }

    if (report.status === "reunited") {
        const error = new Error("This case is already marked as reunited.");
        error.statusCode = 400;
        throw error;
    }

    if (report.claimStatus !== "approved") {
        const error = new Error("Only cases with an approved claim can be marked as reunited.");
        error.statusCode = 400;
        throw error;
    }

    const reviewerName = getActorName(req);
    const reviewerEmail = getActorEmail(req);

    report.status = "reunited";
    report.reunitedAt = new Date();
    await report.save();

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_case_reunited",
        actorName: reviewerName,
        actorEmail: reviewerEmail,
        targetType: "LostFoundReport",
        targetId: report._id.toString(),
        description: `${report.petName || report.species} was marked as reunited.`,
        status: report.status,
        metadata: {
            claimStatus: report.claimStatus,
            claimedByEmail: report.claimedByEmail,
            reunitedAt: report.reunitedAt,
        },
    });

    await sendLostFoundReunitedEmail(
        report.reporterEmail,
        report.petName || report.species
    );

    return res.json({
        success: true,
        message: "Case marked as reunited.",
        report,
    });
};

// Reporter: system suggestions for my own open reports.
exports.getMySuggestedMatches = async (req, res) => {
    const myOpenReportIds = await LostFoundReport.find({
        reporterEmail: getActorEmail(req),
        status: { $in: ["open", "matched"] },
    }).distinct("_id");

    const myReportIdStrings = new Set(myOpenReportIds.map(String));

    const matches = await LostFoundMatch.find({
        status: { $in: ["suggested", "confirmed"] },
        $or: [
            { reportA: { $in: myOpenReportIds } },
            { reportB: { $in: myOpenReportIds } },
        ],
    })
        .sort({ score: -1 })
        .populate("reportA reportB");

    const suggestions = matches
        .filter((match) => match.reportA && match.reportB)
        .map((match) => {
            const myReportIsA = myReportIdStrings.has(String(match.reportA._id));

            return {
                matchId: match._id,
                score: match.score,
                isConfirmedByStaff: match.status === "confirmed",
                myReport: reportForViewer(myReportIsA ? match.reportA : match.reportB, req),
                matchedReport: reportForViewer(myReportIsA ? match.reportB : match.reportA, req),
            };
        })
        .filter(({ matchedReport }) => !["claimed", "reunited", "rejected"].includes(matchedReport.status));

    return res.json({
        success: true,
        suggestions,
    });
};

// Reporter: "Not my pet" removes the suggestion for both reports.
exports.dismissSuggestedMatch = async (req, res) => {
    const match = await LostFoundMatch.findById(req.params.matchId).populate(
        "reportA reportB",
        "reporterEmail"
    );

    if (!match) {
        const error = new Error("Suggested match not found.");
        error.statusCode = 404;
        throw error;
    }

    const reporterEmail = getActorEmail(req);
    const isMySuggestion = [match.reportA, match.reportB].some(
        (report) => report?.reporterEmail === reporterEmail
    );

    if (!isMySuggestion) {
        const error = new Error("You can only dismiss suggestions for your own reports.");
        error.statusCode = 403;
        throw error;
    }

    if (match.status !== "suggested") {
        const error = new Error(`This suggestion has already been ${match.status}.`);
        error.statusCode = 409;
        throw error;
    }

    match.status = "not_a_match";
    match.reviewedBy = req.user.id;
    match.reviewedAt = new Date();
    match.reviewNotes = "Dismissed by the reporter: not their pet.";
    await match.save();

    return res.json({
        success: true,
        message: "Suggestion dismissed.",
    });
};

exports.getPossibleMatches = async (req, res) => {
    const page = Math.max(
        1,
        parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query.limit, 10) || 20)
    );

    const skip = (page - 1) * limit;

    const [matches, total] = await Promise.all([
        LostFoundMatch.find({
            status: "suggested",
        })
            .populate("reportA")
            .populate("reportB")
            .sort({
                score: -1,
                createdAt: -1,
            })
            .skip(skip)
            .limit(limit)
            .lean(),

        LostFoundMatch.countDocuments({
            status: "suggested",
        }),
    ]);

    return res.json({
        success: true,
        matches,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
};


exports.reviewPossibleMatch = async (req, res) => {
    const matchId = req.params.matchId;

    const decision = String(
        req.body.decision || ""
    )
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");

    const allowedDecisions = [
        "confirm",
        "not_a_match",
    ];

    if (!allowedDecisions.includes(decision)) {
        const error = new Error(
            "Decision must be confirm or not_a_match."
        );

        error.statusCode = 400;
        throw error;
    }

    const match = await LostFoundMatch.findById(matchId);

    if (!match) {
        const error = new Error(
            "Possible match not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (match.status !== "suggested") {
        const error = new Error(
            `This match has already been ${match.status}.`
        );

        error.statusCode = 409;
        throw error;
    }

    const reportA = await LostFoundReport.findById(
        match.reportA
    );

    const reportB = await LostFoundReport.findById(
        match.reportB
    );

    if (!reportA || !reportB) {
        const error = new Error(
            "One or both reports associated with this match no longer exist."
        );

        error.statusCode = 404;
        throw error;
    }

    if (decision === "confirm") {
        const validPair =
            reportA.reportType === "lost" &&
            reportB.reportType === "found" ||
            reportA.reportType === "found" &&
            reportB.reportType === "lost";

        if (!validPair) {
            const error = new Error(
                "Only a Lost and Found report pair can be confirmed."
            );

            error.statusCode = 400;
            throw error;
        }

        const unavailableStatuses = [
            "matched",
            "reunited",
            "claimed",
            "rejected",
        ];

        if (
            unavailableStatuses.includes(reportA.status) ||
            unavailableStatuses.includes(reportB.status)
        ) {
            const error = new Error(
                "One or both reports are no longer available for matching."
            );

            error.statusCode = 409;
            throw error;
        }

        const speciesA = String(reportA.species || "")
            .trim()
            .toLowerCase();

        const speciesB = String(reportB.species || "")
            .trim()
            .toLowerCase();

        if (speciesA !== speciesB) {
            const error = new Error(
                "The reports have different animal species."
            );

            error.statusCode = 400;
            throw error;
        }

        const reviewerName = getActorName(req);
        const reviewerEmail = getActorEmail(req);

        const reviewerId =
            req.user?.id ||
            req.user?._id ||
            null;

        reportA.status = "matched";
        reportB.status = "matched";

        reportA.matchStatus = "confirmed";
        reportB.matchStatus = "confirmed";

        await Promise.all([
            reportA.save(),
            reportB.save(),
        ]);

        match.status = "confirmed";
        match.reviewedBy = reviewerId;
        match.reviewedAt = new Date();
        match.reviewNotes = String(
            req.body.reviewNotes || ""
        ).trim();

        await match.save();

        await notifyLostFoundMatchOwners(reportA, reportB, true);

        await LostFoundMatch.updateMany(
            {
                _id: { $ne: match._id },
                status: "suggested",
                $or: [
                    {
                        reportA: {
                            $in: [reportA._id, reportB._id],
                        },
                    },
                    {
                        reportB: {
                            $in: [reportA._id, reportB._id],
                        },
                    },
                ],
            },
            {
                $set: {
                    status: "not_a_match",
                    reviewedAt: new Date(),
                    reviewNotes:
                        "Closed because one of the reports was matched.",
                },
            }
        );

        await LedgerEntry.create({
            type: "lost_found",
            action: "lost_found_match_confirmed",
            actorName: reviewerName,
            actorEmail: reviewerEmail,
            targetType: "LostFoundMatch",
            targetId: match._id.toString(),
            description:
                `${reviewerName} confirmed a Lost & Found report match.`,
            status: "confirmed",
            metadata: {
                matchId: match._id,
                reportA: reportA._id,
                reportB: reportB._id,
                score: match.score,
            },
        });

        return res.json({
            success: true,
            message: "Possible match confirmed successfully.",
            match,
            reports: [
                reportA,
                reportB,
            ],
        });
    }

    match.status = "not_a_match";
    match.reviewedBy =
        req.user?.id ||
        req.user?._id ||
        null;

    match.reviewedAt = new Date();

    match.reviewNotes = String(
        req.body.reviewNotes || ""
    ).trim();

    await match.save();

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_match_rejected",
        actorName: getActorName(req),
        actorEmail: getActorEmail(req),
        targetType: "LostFoundMatch",
        targetId: match._id.toString(),
        description:
            `${getActorName(req)} marked a suggested Lost & Found pair as not a match.`,
        status: "not_a_match",
        metadata: {
            matchId: match._id,
            reportA: reportA._id,
            reportB: reportB._id,
            score: match.score,
        },
    });

    return res.json({
        success: true,
        message: "Candidate pair marked as not a match.",
        match,
    });
};


exports.cancelClaim = async (req, res) => {
    preventStaffAdmin(req);

    const report = await LostFoundReport.findById(req.params.id);

    if (!report) {
        const error = new Error("Lost and found report not found.");
        error.statusCode = 404;
        throw error;
    }

    const claimantEmail = getActorEmail(req);

    if (!claimantEmail) {
        const error = new Error("Authenticated user email is missing.");
        error.statusCode = 401;
        throw error;
    }

    if (
        String(report.claimedByEmail || "").trim().toLowerCase() !==
        claimantEmail
    ) {
        const error = new Error(
            "You are not authorized to cancel this claim."
        );
        error.statusCode = 403;
        throw error;
    }

    if (report.claimStatus !== "pending") {
        const error = new Error(
            "Only pending claims can be cancelled."
        );
        error.statusCode = 409;
        throw error;
    }

    const claimantName = getActorName(req);

    report.claimStatus = "none";
    report.status =
        report.matchStatus === "confirmed" ? "matched" : "open";

    report.claimedByName = "";
    report.claimedByEmail = "";
    report.claimNotes = "";
    report.claimContactNumber = "";
    report.claimProofPhotoUrl = "";
    report.claimedAt = null;

    await report.save();
    await updateLinkedAnimal(report, {
        availabilityStatus: report.linkedAnimalAvailabilityBeforeClaim || "unavailable",
    });

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_claim_cancelled",
        actorName: claimantName,
        actorEmail: claimantEmail,
        targetType: "LostFoundReport",
        targetId: report._id.toString(),
        description:
            `${claimantName} cancelled their pending claim for ` +
            `${report.petName || report.species}.`,
        status: report.status,
        metadata: {
            petName: report.petName,
            species: report.species,
            reportType: report.reportType,
            reporterEmail: report.reporterEmail,
        },
    });

    return res.json({
        success: true,
        message: "Your pending claim has been cancelled.",
        report: reportForViewer(report, req),
    });
};