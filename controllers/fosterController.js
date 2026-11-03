const mongoose = require("mongoose");

const FosterAssignment = require("../models/FosterAssignment");
const FosterApplication = require("../models/FosterApplication");
const Animal = require("../models/Animal");
const LedgerEntry = require("../models/LedgerEntry");
const User = require("../models/User");
const Notification = require("../models/Notifications");
const { sendApplicationUpdateEmail, sendFosterUpdateEmail } = require("../services/emailService");

// email must have a function that returns a promise(promise??), and it must throw an error if the email fails to send
async function sendEmailSafely(sendFn, ...args) {
    try {
        await sendFn(...args);
    } catch (error) {
        console.error("Foster email error:", error.message);
    }
}

async function createLedgerEntrySafely(data) {
    try {
        await LedgerEntry.create(data);
    } catch (error) {
        console.error(
            "Foster ledger error:",
            error
        );
    }
}

exports.createApplication = async (req, res) => {
    const applicantEmail = String(req.user?.email || "").trim().toLowerCase();
    const applicantName = String(req.body.applicantName || "").trim();

    if (!applicantEmail) {
        const e = new Error("Auth applicant email is missing");
        e.statusCode = 401;
        throw e;
    }

    if (!applicantName) {
        const e = new Error("Applicant name is required.");
        e.statusCode = 400;
        throw e;
    }

    const existingApplication = await FosterApplication.findOne({ applicantEmail, status: "pending" });

    if (existingApplication) {
        const e = new Error("You already have a pending foster application.");
        e.statusCode = 409;
        throw e;
    }

    const capacity = Number(req.body.capacity || 1);

    if (Number.isNaN(capacity) || capacity < 1) {
        const e = new Error("Invalid foster capacity");
        e.statusCode = 400;
        throw e;
    }

    const application = await FosterApplication.create({
        applicantName,
        applicantEmail,

        phoneNumber: String(
            req.body.phoneNumber || ""
        ).trim(),

        address: String(
            req.body.address || ""
        ).trim(),

        housingType:
            req.body.housingType ||
            "House",

        hasPets:
            Boolean(req.body.hasPets),

        hasChildren:
            Boolean(req.body.hasChildren),

        petFriendly:
            Boolean(req.body.petFriendly),

        fosterExperience: String(
            req.body.fosterExperience || ""
        ).trim(),

        preferredAnimalType:
            req.body.preferredAnimalType ||
            "Both",

        preferredSize:
            req.body.preferredSize ||
            "Any",

        capacity,

        fosterDuration: String(
            req.body.fosterDuration || "1 Month"
        ).trim(),

        emergencyName: String(
            req.body.emergencyName || ""
        ).trim(),

        emergencyRelationship: String(
            req.body.emergencyRelationship || ""
        ).trim(),

        emergencyPhone: String(
            req.body.emergencyPhone || ""
        ).trim(),

        notes: String(
            req.body.notes || ""
        ).trim(),

        agreementAccepted:
            Boolean(req.body.agreementAccepted),

        status: "pending",
    });

    await createLedgerEntrySafely({
        type: "foster",
        action: "foster_application_submitted",
        actorName: application.applicantName,
        actorEmail: application.applicantEmail,
        targetType: "FosterApplication",
        targetId: application._id.toString(),
        description:
            `${application.applicantName} submitted a foster caregiver application.`,
        status: "pending",
        metadata: {
            applicantEmail:
                application.applicantEmail,

            capacity:
                application.capacity,

            preferredAnimalType:
                application.preferredAnimalType,
        },
    });

    return res.status(201).json({
        success: true,
        message: "Foster application submitted.",
        application,
    });
};

exports.getAllApplications = async (req, res) => {
    const applications = await FosterApplication.find().sort({ createdAt: -1 });
    return res.status(200).json({
        success: true,
        applications,
    });
};

exports.getMyApplications = async (req, res) => {
    const applicantEmail = String(req.user?.email || "").trim().toLowerCase();

    if (!applicantEmail) {
        const e = new Error("Auth user email is missing.");
        e.statusCode = 401;
        throw e;
    }

    const application = await FosterApplication.findOne({ applicantEmail }).sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        application,
    });
};

exports.reviewApplication = async (req, res) => {
    const allowedStatuses = [
        "pending",
        "approved",
        "rejected",
    ];

    const status = String(
        req.body.status || ""
    )
        .trim()
        .toLowerCase();

    if (!allowedStatuses.includes(status)) {
        const error = new Error(
            "Invalid foster application status."
        );

        error.statusCode = 400;
        throw error;
    }


    // A reason is required to reject; the applicant sees it
    if (
        status === "rejected" &&
        !String(req.body.reviewNotes || "").trim()
    ) {
        const error = new Error("A rejection reason is required.");
        error.statusCode = 400;
        throw error;
    }

    const adminId = req.user?.id;
    const adminEmail = String(
        req.user?.email || ""
    )
        .trim()
        .toLowerCase();

    if (!adminId || !adminEmail) {
        const error = new Error(
            "Authenticated administrator information is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const admin = await User.findById(
        adminId
    ).select("name username email");

    if (!admin) {
        const error = new Error(
            "Administrator account was not found."
        );

        error.statusCode = 401;
        throw error;
    }

    const adminName = String(
        admin.name ||
        admin.username ||
        "Admin User"
    ).trim();

    const application =
        await FosterApplication.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    status,

                    reviewedByName:
                        adminName,

                    reviewedByEmail:
                        adminEmail,

                    reviewNotes:
                        String(
                            req.body.reviewNotes ||
                            ""
                        ).trim(),

                    reviewedAt:
                        status === "pending"
                            ? null
                            : new Date(),

                    rejectionReason:
                        status === "rejected"
                            ? String(req.body.reviewNotes || "").trim()
                            : "",
                },
            },
            {
                returnDocument: "after",
                runValidators: true,
            }
        );

    if (!application) {
        const error = new Error(
            "Foster application not found."
        );

        error.statusCode = 404;
        throw error;
    }

    await createLedgerEntrySafely({
        type: "foster",
        action: "foster_application_reviewed",

        actorName: adminName,
        actorEmail: adminEmail,

        targetType: "FosterApplication",
        targetId:
            application._id.toString(),

        description:
            `${application.applicantName}'s foster application was ${application.status}.`,

        status:
            application.status,

        metadata: {
            applicantEmail:
                application.applicantEmail,

            reviewNotes:
                application.reviewNotes,
        },
    });

    // adopter to foster role upgrade if approved
    if (application.status === "approved") {
        await User.updateOne(
            { email: application.applicantEmail, role: "adopter" },
            { $set: { role: "foster" } }
        );
    }

    if (application.status === "rejected") {
        const stillApproved = await FosterApplication.exists({
            applicantEmail: application.applicantEmail,
            status: "approved",
        });

        const activeAssignments = await FosterAssignment.countDocuments({
            fosterEmail: application.applicantEmail,
            status: "active",
        });

        if (!stillApproved && activeAssignments === 0) {
            await User.updateOne(
                { email: application.applicantEmail, role: "foster" },
                { $set: { role: "adopter" } }
            );
        }
    }

    if (
        ["approved", "rejected"].includes(
            application.status
        )
    ) {
        await sendEmailSafely(
            sendApplicationUpdateEmail,
            application.applicantEmail,
            application.status,
            "foster"
        )

        await createFosterNotification(
            application.applicantEmail,
            application.status === "approved"
                ? "Application Approved"
                : "Application Rejected",
            application.status === "approved"
                ? "Congratulations! Your foster application has been approved. Please log out and log in again to open your Foster Dashboard."
                : `Unfortunately, your foster application was not approved. Reason: ${application.rejectionReason}`,
            "application_update"
        );
    }

    return res.status(200).json({
        success: true,
        message:
            `Foster application ${application.status}.`,
        application,
    });
};

// Applicant edits their own pending/approved application in place.
// Status stays the same; the admin sees which fields changed.
const EDITABLE_APPLICATION_FIELDS = {
    applicantName: "Full name",
    phoneNumber: "Phone",
    address: "Address",
    housingType: "Home type",
    hasChildren: "Children",
    hasPets: "Other pets",
    petFriendly: "Pet-friendly home",
    preferredAnimalType: "Preferred animal",
    preferredSize: "Preferred size",
    capacity: "Capacity",
    fosterDuration: "Duration",
    fosterExperience: "Experience",
    emergencyName: "Emergency contact",
    emergencyRelationship: "Relationship",
    emergencyPhone: "Emergency phone",
    notes: "Notes",
};

exports.updateMyApplication = async (req, res) => {
    const applicantEmail = String(req.user?.email || "").trim().toLowerCase();

    if (!applicantEmail) {
        const e = new Error("Auth applicant email is missing.");
        e.statusCode = 401;
        throw e;
    }

    const application = await FosterApplication.findOne({
        applicantEmail,
        status: { $in: ["pending", "approved"] },
    }).sort({ createdAt: -1 });

    if (!application) {
        const e = new Error("You have no active foster application to update.");
        e.statusCode = 404;
        throw e;
    }

    const changed = [];

    for (const [field, label] of Object.entries(EDITABLE_APPLICATION_FIELDS)) {
        if (req.body[field] === undefined) continue;

        let value = req.body[field];

        if (["hasChildren", "hasPets", "petFriendly"].includes(field)) value = Boolean(value);
        else if (field === "capacity") value = Number(value);
        else value = String(value).trim();

        if (String(application[field]) !== String(value)) {
            application[field] = value;
            changed.push(label);
        }
    }

    if (!application.applicantName) {
        const e = new Error("Applicant name is required.");
        e.statusCode = 400;
        throw e;
    }

    if (Number.isNaN(application.capacity) || application.capacity < 1) {
        const e = new Error("Invalid foster capacity.");
        e.statusCode = 400;
        throw e;
    }

    if (changed.length === 0) {
        return res.status(200).json({
            success: true,
            message: "No changes to save.",
            application,
        });
    }

    // Can't lower capacity below the animals already in their care
    const activeAssignments = await FosterAssignment.countDocuments({
        fosterEmail: applicantEmail,
        status: "active",
    });

    if (application.capacity < activeAssignments) {
        const e = new Error(
            `You have ${activeAssignments} animal(s) in your care, so capacity can't be lower than that.`
        );
        e.statusCode = 400;
        throw e;
    }

    application.editedFields = changed;
    application.lastEditedAt = new Date();
    await application.save();

    await createLedgerEntrySafely({
        type: "foster",
        action: "foster_application_updated",
        actorName: application.applicantName,
        actorEmail: application.applicantEmail,
        targetType: "FosterApplication",
        targetId: application._id.toString(),
        description: `${application.applicantName} updated their foster application (${changed.join(", ")}).`,
        status: application.status,
        metadata: { editedFields: changed },
    });

    return res.status(200).json({
        success: true,
        message: "Changes saved. The shelter has been notified.",
        application,
    });
};

// Applicant revokes their own foster application.
// Pending  -> cancelled.
// Approved -> they stop being a foster (only if no animals are in their care).
exports.withdrawMyApplication = async (req, res) => {
    const applicantEmail = String(req.user?.email || "").trim().toLowerCase();

    if (!applicantEmail) {
        const e = new Error("Auth applicant email is missing.");
        e.statusCode = 401;
        throw e;
    }

    const application = await FosterApplication.findOne({
        applicantEmail,
        status: { $in: ["pending", "approved"] },
    }).sort({ createdAt: -1 });

    if (!application) {
        const e = new Error("You have no pending or approved foster application to revoke.");
        e.statusCode = 404;
        throw e;
    }

    const wasApproved = application.status === "approved";

    if (wasApproved) {
        const activeAssignments = await FosterAssignment.countDocuments({
            fosterEmail: applicantEmail,
            status: "active",
        });

        if (activeAssignments > 0) {
            const e = new Error(
                `You still have ${activeAssignments} animal(s) in your care. Please contact the shelter to return them before revoking.`
            );
            e.statusCode = 400;
            throw e;
        }
    }

    application.status = "withdrawn";
    application.withdrawnAt = new Date();
    application.withdrawnReason = String(req.body.reason || "").trim();
    await application.save();

    // Go back to adopter only if no other approved application keeps the foster role
    let roleChanged = false;

    if (wasApproved) {
        const stillApproved = await FosterApplication.exists({
            applicantEmail,
            status: "approved",
        });

        if (!stillApproved) {
            const result = await User.updateOne(
                { email: applicantEmail, role: "foster" },
                { $set: { role: "adopter" } }
            );
            roleChanged = result.modifiedCount > 0;
        }
    }

    await createLedgerEntrySafely({
        type: "foster",
        action: "foster_application_withdrawn",
        actorName: application.applicantName,
        actorEmail: applicantEmail,
        targetType: "FosterApplication",
        targetId: application._id.toString(),
        description: `${application.applicantName} revoked their ${wasApproved ? "approved" : "pending"} foster application.`,
        status: "withdrawn",
        metadata: {
            reason: application.withdrawnReason,
            roleChanged,
        },
    });

    return res.status(200).json({
        success: true,
        message: wasApproved
            ? "You are no longer a foster. Please log in again."
            : "Your foster application was cancelled.",
        application,
        roleChanged,
    });
};

exports.createAssignment = async (req, res) => {
    const fosterEmail = String(
        req.body.fosterEmail || ""
    )
        .trim()
        .toLowerCase();

    if (!fosterEmail) {
        const error = new Error(
            "Foster email is required."
        );

        error.statusCode = 400;
        throw error;
    }

    const approvedApplication =
        await FosterApplication.findOne({
            applicantEmail: fosterEmail,
            status: "approved",
        }).sort({
            reviewedAt: -1,
            createdAt: -1,
        });

    if (!approvedApplication) {
        const error = new Error(
            "This foster caregiver is not approved yet."
        );

        error.statusCode = 400;
        throw error;
    }

    const activeAssignmentsCount =
        await FosterAssignment.countDocuments({
            fosterEmail,
            status: "active",
        });

    if (
        activeAssignmentsCount >=
        approvedApplication.capacity
    ) {
        const error = new Error(
            "This foster caregiver has already reached their foster capacity."
        );

        error.statusCode = 400;
        throw error;
    }

    // Link the assignment to a registered animal
    const animalId = String(req.body.animalId || "").trim();

    if (!mongoose.Types.ObjectId.isValid(animalId)) {
        const error = new Error("Please select a registered pet.");
        error.statusCode = 400;
        throw error;
    }

        const animal = await Animal.findById(animalId);

    if (!animal) {
        const error = new Error("Selected pet was not found.");
        error.statusCode = 404;
        throw error;
    }

    if (animal.adoptionStatus === "adopted" || animal.fosterStatus === "in_foster") {
        const error = new Error(`${animal.name} is already adopted or in foster care.`);
        error.statusCode = 400;
        throw error;
    }

    const assignment =
        await FosterAssignment.create({
            animalId: animal._id,
            petName: animal.name,
            petBreed: animal.breed || "",
            petImage: animal.image || "",

            fosterName:
                String(
                    req.body.fosterName || ""
                ).trim() ||
                approvedApplication.applicantName,

            fosterEmail,

            fosterApplicationId:
                approvedApplication._id,

            shelterName:
                String(
                    req.body.shelterName || ""
                ).trim() ||
                "RescueBase Shelter",

            careInstructions:
                String(
                    req.body.careInstructions || ""
                ).trim() ||
                "Provide food, water, shelter, and weekly updates.",

            status: "active",
        });
    
    await Animal.findByIdAndUpdate(animal._id, { fosterStatus: "in_foster" });

    await Animal.findByIdAndUpdate(animal._id, { $set: { fosterStatus: "in_foster" } });

    const adminId = req.user?.id;
    const adminEmail = String(
        req.user?.email || ""
    )
        .trim()
        .toLowerCase();

    if (!adminId || !adminEmail) {
        const error = new Error(
            "Authenticated administrator information is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const admin = await User.findById(
        adminId
    ).select("name username email");

    if (!admin) {
        const error = new Error(
            "Administrator account was not found."
        );

        error.statusCode = 401;
        throw error;
    }

    const adminName = String(
        admin.name ||
        admin.username ||
        "Admin User"
    ).trim();

    await createLedgerEntrySafely({
        type: "foster",
        action: "foster_assignment_created",

        actorName: adminName,
        actorEmail: adminEmail,

        targetType: "FosterAssignment",
        targetId:
            assignment._id.toString(),

        description:
            `${assignment.fosterName} was assigned to foster ${assignment.petName}.`,

        status: "active",

        metadata: {
            petName:
                assignment.petName,

            fosterEmail:
                assignment.fosterEmail,

            fosterApplicationId:
                approvedApplication._id.toString(),

            fosterCapacity:
                approvedApplication.capacity,
        },
    });

    await sendEmailSafely(
        sendFosterUpdateEmail,
        assignment.fosterEmail,
        "New Foster Assignment.",
        `You have been assigned to foster ${assignment.petName}. Please log in to RescueBase to view the care instructions and assignment details.`
    );

    await createFosterNotification(
        assignment.fosterEmail,
        "New Foster Assignment",
        `You have been assigned to foster ${assignment.petName}. Please log in to RescueBase to review your assignment.`
    );

    return res.status(201).json({
        success: true,
        message:
            "Foster assignment created.",
        assignment,
    });
};

exports.getAllAssignments = async (req, res) => {
    const assignments =
        await FosterAssignment.find()
            .sort({
                createdAt: -1,
            });

    return res.status(200).json({
        success: true,
        assignments,
    });
};

exports.getMyActiveAssignment = async (req, res) => {
    const email = String(
        req.user?.email || ""
    )
        .trim()
        .toLowerCase();

    if (!email) {
        const error = new Error(
            "Authenticated foster email is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const assignments =
        await FosterAssignment.find({
            fosterEmail: email,
            status: "active",
        })
            .sort({ createdAt: -1 })
            .populate("animalId", "type age gender size");

    return res.status(200).json({
        success: true,
        assignment: assignments[0] || null,
        assignments,
    });
};

exports.submitAssignmentUpdate = async (req, res) => {
    const assignmentId = String(
        req.params.id || ""
    ).trim();

    const email = String(
        req.user?.email || ""
    )
        .trim()
        .toLowerCase();

    if (!email) {
        const error = new Error(
            "Authenticated foster email is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const note = String(
        req.body.note || ""
    ).trim();

    if (!note) {
        const error = new Error(
            "Update note is required."
        );

        error.statusCode = 400;
        throw error;
    }

    const MAX_WEIGHT_KG = 150;
    const weightValue = Number(req.body.weight);

    if (
        req.body.weight !== "" &&
        req.body.weight !== undefined &&
        req.body.weight !== null &&
        (Number.isNaN(weightValue) || weightValue < 0 || weightValue > MAX_WEIGHT_KG)
    ) {
        const error = new Error(
            `Weight must be between 0 and ${MAX_WEIGHT_KG} kg.`
        );

        error.statusCode = 400;
        throw error;
    }

    const assignment =
        await FosterAssignment.findOne({
            _id: assignmentId,
            fosterEmail: email,
            status: "active",
        });

    if (!assignment) {
        const error = new Error(
            "Active foster assignment not found."
        );

        error.statusCode = 404;
        throw error;
    }

    assignment.updates.push({
        note,

        photoUrl: String(
            req.body.photoUrl || ""
        ).trim(),

        // Weekly care report details (optional)
        healthStatus: String(req.body.healthStatus || "").trim(),
        appetite: String(req.body.appetite || "").trim(),
        behavior: String(req.body.behavior || "").trim(),
        weight:
            req.body.weight === "" ||
            req.body.weight === undefined ||
            Number.isNaN(Number(req.body.weight))
                ? null
                : Number(req.body.weight),
        medication: Boolean(req.body.medication),
        exercise: Boolean(req.body.exercise),

        submittedBy:
            String(
                req.user?.email || ""
            ).trim(),

        submittedByEmail:
            email,
    });

    await assignment.save();

    const fosterName =
        String(
            req.user?.name ||
            req.user?.username ||
            assignment.fosterName ||
            "Foster User"
        ).trim();

    await createLedgerEntrySafely({
        type: "foster",
        action: "weekly_update_submitted",

        actorName: fosterName,
        actorEmail: email,

        targetType: "FosterAssignment",
        targetId:
            assignment._id.toString(),

        description:
            `${assignment.fosterName} submitted a weekly foster update for ${assignment.petName}.`,

        status:
            assignment.status,

        metadata: {
            petName:
                assignment.petName,

            photoUrl:
                req.body.photoUrl || "",
        },
    });

    return res.status(200).json({
        success: true,
        message:
            "Weekly update submitted.",
        assignment,
    });
};

exports.submitBehaviorEvaluation = async (req, res) => {
    const assignmentId = String(req.params.id || "").trim();
    const email = String(req.user?.email || "").trim().toLowerCase();

    if (!email) {
        const error = new Error("Auth foster email is missing");
        error.statusCode = 401;
        throw error;
    }

    const assignment = await FosterAssignment.findOne({
        _id: assignmentId,
        fosterEmail: email,
        status: "active",
    });

    if (!assignment) {
        const err = new Error("Active foster assignment not found.");
        err.statusCode = 404;
        throw err;
    }

    const currentStatus = assignment.behaviorEvaluation?.status;

    if (currentStatus === "pending" || currentStatus === "accepted") {
        const err = new Error(
            currentStatus === "pending"
                ? "Your evaluation is already waiting for staff review."
                : "This evaluation was already accepted."
        );
        err.statusCode = 400;
        throw err;
    }

    const factors = [
        "energyLevel",
        "friendliness",
        "humanSociability",
        "animalSociability",
        "trainability",
        "anxietyLevel",
        "aggressionLevel",
        "activityLevel",
    ];

    const evaluation = {};

    for (const factor of factors) {
        const value = Number(req.body[factor]);

        if (!Number.isInteger(value) || value < 1 || value > 5) {
            const err = new Error(`${factor} must be a value from 1 to 5`);
            err.statusCode = 400;
            throw err;
        }

        evaluation[factor] = value;
    }

    evaluation.notes = String(req.body.notes || "").trim();

    evaluation.submittedBy = String(req.user?.name || req.user?.username || assignment.fosterName || "Foster User").trim();
    evaluation.submittedByEmail = email;
    evaluation.status = "pending";
    evaluation.submittedAt = new Date();
    evaluation.reviewedAt = null;
    evaluation.reviewNotes = "";

    assignment.behaviorEvaluation = evaluation;

    await assignment.save();

    await createLedgerEntrySafely({
        type: "foster",
        action: "foster_behavior_evaluation_submitted",

        actorName:
            evaluation.submittedBy,

        actorEmail:
            email,

        targetType: "FosterAssignment",

        targetId:
            assignment._id.toString(),

        description:
            `${assignment.fosterName} submitted a behavioral evaluation for ${assignment.petName}.`,

        status: "pending",

        metadata: {
            petName:
                assignment.petName,

            fosterEmail:
                assignment.fosterEmail,
        },
    });

    return res.status(200).json({
        success: true,
        message: "Behavioral evaluation submitted for review.",
        assignment,
    });
};

exports.acceptBehaviorEvaluation = async (req, res) => {
    const adminId = req.user?.id;

    const adminEmail = String(
        req.user?.email || ""
    )
        .trim()
        .toLowerCase();

    if (!adminId || !adminEmail) {
        const error = new Error(
            "Authenticated administrator information is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const admin = await User.findById(
        adminId
    ).select("name username email");

    if (!admin) {
        const error = new Error(
            "Administrator account was not found."
        );

        error.statusCode = 401;
        throw error;
    }

    const adminName = String(
        admin.name ||
        admin.username ||
        "Admin User"
    ).trim();

    const assignment =
        await FosterAssignment.findById(
            req.params.id
        );

    if (!assignment) {
        const error = new Error(
            "Foster assignment not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (assignment.status !== "active") {
        const error = new Error(
            "Only active foster assignments can be reviewed."
        );

        error.statusCode = 400;
        throw error;
    }

    const evaluation =
        assignment.behaviorEvaluation;

    if (
        !evaluation ||
        evaluation.status !== "pending"
    ) {
        const error = new Error(
            "There is no pending behavioral evaluation to accept."
        );

        error.statusCode = 400;
        throw error;
    }

    const animal = assignment.animalId
        ? await Animal.findById(assignment.animalId)
        : await Animal.findOne({ name: assignment.petName });

    if (!animal) {
        const error = new Error(
            `Animal "${assignment.petName}" was not found.`
        );

        error.statusCode = 404;
        throw error;
    }

    const behavioralFields = [
        "energyLevel",
        "friendliness",
        "humanSociability",
        "animalSociability",
        "trainability",
        "anxietyLevel",
        "aggressionLevel",
        "activityLevel",
    ];

    const animalUpdates = {};

    for (const field of behavioralFields) {
        animalUpdates[field] =
            evaluation[field];
    }

    animalUpdates.fosterStatus = "completed";
    animalUpdates.behaviorAssessedBy = evaluation.submittedBy || assignment.fosterName;
    animalUpdates.behaviorAssessedAt = new Date();

    const updatedAnimal =
        await Animal.findByIdAndUpdate(
            animal._id,
            {
                $set: animalUpdates,
            },
            {
                returnDocument: "after",
                runValidators: true,
            }
        );

    evaluation.status = "accepted";
    evaluation.reviewedAt = new Date();
    evaluation.reviewNotes = "";

    if (!assignment.animalId) assignment.animalId = animal._id;

    assignment.status = "completed";
    assignment.endDate = new Date();
    if (assignment.animalId) {
        await Animal.findByIdAndUpdate(assignment.animalId, { fosterStatus: "completed" });
    }

    await assignment.save();

    await createLedgerEntrySafely({
        type: "foster",
        action: "foster_behavior_evaluation_accepted",

        actorName:
            adminName,

        actorEmail:
            adminEmail,

        targetType:
            "FosterAssignment",

        targetId:
            assignment._id.toString(),

        description:
            `${adminName} accepted the behavioral evaluation for ${assignment.petName} and completed the foster assignment.`,

        status:
            "completed",

        metadata: {
            petName:
                assignment.petName,

            fosterEmail:
                assignment.fosterEmail,

            animalId:
                updatedAnimal._id.toString(),
        },
    });

    await sendEmailSafely(
        sendFosterUpdateEmail,
        assignment.fosterEmail,
        "Foster Assignment Completed",
        `Your foster assignment for ${assignment.petName} has been completed after the behavioral evaluation was reviewed and accepted.`
    );

    await createFosterNotification(
        assignment.fosterEmail,
        "Behavioral Evaluation Accepted",
        `Your behavioral evaluation for ${assignment.petName} has been reviewed and accepted. Your foster assignment has been completed.`
    );

    return res.status(200).json({
        success: true,
        message:
            "Behavioral evaluation accepted and foster assignment completed.",
        assignment,
        animal: updatedAnimal,
    });
};
//this allows staff to send the evaluation back to the foster for revision, with a reason why
exports.returnBehaviorEvaluation = async (req, res) => {
    const reason = String(req.body.reason || "").trim();

    if (!reason) {
        const error = new Error("Tell the foster what to fix before sending it back.");
        error.statusCode = 400;
        throw error;
    }

    const assignment = await FosterAssignment.findById(req.params.id);

    if (!assignment) {
        const error = new Error("Foster assignment not found.");
        error.statusCode = 404;
        throw error;
    }

    if (assignment.status !== "active") {
        const error = new Error("Only active foster assignments can be reviewed.");
        error.statusCode = 400;
        throw error;
    }

    if (assignment.behaviorEvaluation?.status !== "pending") {
        const error = new Error("There is no pending behavioral evaluation to send back.");
        error.statusCode = 400;
        throw error;
    }

    const reviewer = await User.findById(req.user?.id).select("name username");
    const reviewerName = String(reviewer?.name || reviewer?.username || "Staff").trim();

    // Foster keeps their scores and can edit and resubmit them
    assignment.behaviorEvaluation.status = "revision";
    assignment.behaviorEvaluation.reviewNotes = reason;
    assignment.behaviorEvaluation.reviewedAt = new Date();

    await assignment.save();

    await createLedgerEntrySafely({
        type: "foster",
        action: "foster_behavior_evaluation_returned",
        actorName: reviewerName,
        actorEmail: String(req.user?.email || "").trim().toLowerCase(),
        targetType: "FosterAssignment",
        targetId: assignment._id.toString(),
        description: `${reviewerName} sent ${assignment.petName}'s behavioral evaluation back for revision.`,
        status: "revision",
        metadata: {
            petName: assignment.petName,
            fosterEmail: assignment.fosterEmail,
            reason,
        },
    });

    await sendEmailSafely(
        sendFosterUpdateEmail,
        assignment.fosterEmail,
        "Behavior Evaluation Needs Changes",
        `Your behavioral evaluation for ${assignment.petName} was sent back for revision. Reason: ${reason}`
    );

    await createFosterNotification(
        assignment.fosterEmail,
        "Behavior Evaluation Needs Changes",
        `Your behavioral evaluation for ${assignment.petName} was sent back. Reason: ${reason}`
    );

    return res.status(200).json({
        success: true,
        message: "Behavioral evaluation sent back for revision.",
        assignment,
    });
};

exports.completeAssignment = async (req, res) => {
    const adminId = req.user?.id;

    const adminEmail = String(
        req.user?.email || ""
    )
        .trim()
        .toLowerCase();

    if (!adminId || !adminEmail) {
        const error = new Error(
            "Authenticated administrator information is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const admin = await User.findById(
        adminId
    ).select("name username email");

    if (!admin) {
        const error = new Error(
            "Administrator account was not found."
        );

        error.statusCode = 401;
        throw error;
    }

    const adminName = String(
        admin.name ||
        admin.username ||
        "Admin User"
    ).trim();

    const assignment =
        await FosterAssignment.findById(
            req.params.id
        );

    if (!assignment) {
        const error = new Error(
            "Foster assignment not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (assignment.status !== "active") {
        const error = new Error(
            "Only active foster assignments can be completed."
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        !assignment.behaviorEvaluation ||
        assignment.behaviorEvaluation.status !== "accepted"
    ) {
        const error = new Error(
            "The behavioral evaluation must be accepted before completing the foster assignment."
        );

        error.statusCode = 400;
        throw error;
    }

    assignment.status = "completed";
    assignment.endDate = new Date();
    if (assignment.animalId) {
        await Animal.findByIdAndUpdate(assignment.animalId, { fosterStatus: "completed" });
    }

    await assignment.save();

    await createLedgerEntrySafely({
        type: "foster",
        action:
            "foster_assignment_completed",

        actorName: adminName,
        actorEmail: adminEmail,

        targetType: "FosterAssignment",
        targetId:
            assignment._id.toString(),

        description:
            `${assignment.fosterName}'s foster assignment for ${assignment.petName} was completed.`,

        status: "completed",

        metadata: {
            petName:
                assignment.petName,

            fosterEmail:
                assignment.fosterEmail,
        },
    });

    return res.status(200).json({
        success: true,
        message:
            "Foster assignment completed.",
        assignment,
    });
};

exports.updateAssignment = async (req, res) => {
    const currentAssignment =
        await FosterAssignment.findById(
            req.params.id
        );

    if (!currentAssignment) {
        const error = new Error(
            "Foster assignment not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (
        currentAssignment.status !== "active"
    ) {
        const error = new Error(
            "Only in-progress foster assignments can be updated."
        );

        error.statusCode = 400;
        throw error;
    }

    const allowedUpdates = {};

    // change animal name, breed, image if animalId is changed
    if (req.body.animalId !== undefined && String(req.body.animalId) !== String(currentAssignment.animalId || "")) {
        const newAnimal = mongoose.Types.ObjectId.isValid(String(req.body.animalId))
            ? await Animal.findById(req.body.animalId)
            : null;

        if (!newAnimal) {
            const error = new Error("The selected animal was not found.");
            error.statusCode = 404;
            throw error;
        }

        const taken = await FosterAssignment.exists({
            _id: { $ne: currentAssignment._id },
            animalId: newAnimal._id,
            status: "active",
        });

        if (taken) {
            const error = new Error(`${newAnimal.name} is already in an active foster assignment.`);
            error.statusCode = 409;
            throw error;
        }

        req.body.petName = newAnimal.name;
        req.body.petBreed = newAnimal.breed || "";
        req.body.petImage = newAnimal.image || "";
        req.body.newAnimalId = newAnimal._id;
    }

    const allowedFields = [
        "petName",
        "petBreed",
        "petImage",
        "fosterName",
        "fosterEmail",
        "careInstructions",
    ];

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            allowedUpdates[field] =
                req.body[field];
        }
    }

    if (
        allowedUpdates.fosterEmail !==
        undefined
    ) {
        allowedUpdates.fosterEmail =
            String(
                allowedUpdates.fosterEmail
            )
                .trim()
                .toLowerCase();
    }

    if (req.body.newAnimalId) {
        allowedUpdates.animalId = req.body.newAnimalId;
    }

    if (
        Object.keys(allowedUpdates).length === 0
    ) {
        const error = new Error(
            "No valid fields provided for update."
        );

        error.statusCode = 400;
        throw error;
    }

    const assignment =
        await FosterAssignment.findByIdAndUpdate(
            req.params.id,
            {
                $set: allowedUpdates,
            },
            {
                returnDocument: "after",
                runValidators: true,
            }
        );

    if (allowedUpdates.animalId) {
        if (currentAssignment.animalId) {
            await Animal.findByIdAndUpdate(currentAssignment.animalId, { $set: { fosterStatus: "none" } });
        }
        await Animal.findByIdAndUpdate(allowedUpdates.animalId, { $set: { fosterStatus: "in_foster" } });
    }

    const adminId = req.user?.id;

    const adminEmail = String(
        req.user?.email || ""
    )
        .trim()
        .toLowerCase();

    const admin = await User.findById(
        adminId
    ).select("name username email");

    const adminName = String(
        admin?.name ||
        admin?.username ||
        "Admin User"
    ).trim();

    await createLedgerEntrySafely({
        type: "foster",
        action:
            "foster_assignment_updated",

        actorName: adminName,
        actorEmail: adminEmail,

        targetType: "FosterAssignment",
        targetId:
            assignment._id.toString(),

        description:
            `Foster assignment for ${assignment.petName} was updated.`,

        status:
            assignment.status,

        metadata: {
            petName:
                assignment.petName,

            fosterEmail:
                assignment.fosterEmail,
        },
    });

    await sendEmailSafely(
        sendFosterUpdateEmail,
        assignment.fosterEmail,
        "Foster Assignment Updated",
        `Your foster assignment for ${assignment.petName} has been updated. Please log in to RescueBase to view the latest details.`
    );

    return res.status(200).json({
        success: true,
        message:
            "Foster assignment updated.",
        assignment,
    });
};

exports.deleteAssignment = async (req, res) => {
    const assignment = await FosterAssignment.findById(
        req.params.id
    );

    if (!assignment) {
        const error = new Error(
            "Foster assignment not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (assignment.status !== "active") {
        const error = new Error(
            "Only in-progress foster assignments can be deleted."
        );

        error.statusCode = 400;
        throw error;
    }

    const adminId = req.user?.id;

    const adminEmail = String(
        req.user?.email || ""
    )
        .trim()
        .toLowerCase();

    if (!adminId || !adminEmail) {
        const error = new Error(
            "Authenticated administrator information is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const admin = await User.findById(adminId)
        .select("name username email");

    if (!admin) {
        const error = new Error(
            "Administrator account was not found."
        );

        error.statusCode = 401;
        throw error;
    }

    const adminName = String(
        admin.name ||
        admin.username ||
        "Admin User"
    ).trim();

    await createLedgerEntrySafely({
        type: "foster",
        action: "foster_assignment_deleted",

        actorName: adminName,
        actorEmail: adminEmail,

        targetType: "FosterAssignment",
        targetId: assignment._id.toString(),

        description:
            `In-progress foster assignment for ${assignment.petName} was deleted.`,

        status: "deleted",

        metadata: {
            petName: assignment.petName,
            fosterEmail: assignment.fosterEmail,
        },
    });

    if (assignment.animalId) {
        await Animal.findByIdAndUpdate(assignment.animalId, { fosterStatus: "none" });
    }

    await FosterAssignment.findByIdAndDelete(
        req.params.id
    );

    if (assignment.animalId) {
        await Animal.findByIdAndUpdate(assignment.animalId, { $set: { fosterStatus: "none" } });
    }

    await notifyFoster(
        assignment.fosterEmail,
        "Assignment Cancelled",
        `Your foster assignment for ${assignment.petName} has been cancelled by the shelter.`
    );

    return res.status(200).json({
        success: true,
        message: "Foster assignment deleted.",
    });
};

// ===== Early return: foster requests, admin/staff confirm or decline =====
const RETURN_REASONS = ["Medical", "Behavior", "Personal", "Emergency"];

// Tell every admin/staff account (in-app always, email too)
async function notifyShelterStaff(title, message) {
    try {
        const staff = await User.find({ role: { $in: ["admin", "staff"] } }).select("_id email");

        if (staff.length) {
            await Notification.insertMany(
                staff.map((user) => ({ user: user._id, title, message, type: "foster_update" }))
            );
        }

        await Promise.allSettled(
            staff.map((user) => sendFosterUpdateEmail(user.email, title, message))
        );
    } catch (error) {
        console.error("Return request staff notification error:", error);
    }
}

async function createFosterNotification(email, title, message, type = "foster_update") {
    try {
        const recipient = await User.findOne({ email }).select("_id");

        if (recipient) {
            await Notification.create({ user: recipient._id, title, message, type });
        }
    } catch (error) {
        console.error("Foster in-app notification error:", error);
    }
}

// In-app notification + email
async function notifyFoster(email, title, message) {
    await createFosterNotification(email, title, message);

    try {
        await sendFosterUpdateEmail(email, title, message);
    } catch (error) {
        console.error("Foster email notification error:", error);
    }
}

exports.requestReturn = async (req, res) => {
    const fosterEmail = String(req.user?.email || "").trim().toLowerCase();

    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        const error = new Error("Invalid assignment.");
        error.statusCode = 400;
        throw error;
    }

    const assignment = await FosterAssignment.findOne({
        _id: req.params.id,
        fosterEmail,
        status: "active",
    });

    if (!assignment) {
        const error = new Error("Active foster assignment not found.");
        error.statusCode = 404;
        throw error;
    }

    if (assignment.returnRequest?.status === "pending") {
        const error = new Error("You already asked to return this animal.");
        error.statusCode = 409;
        throw error;
    }

    const reason = String(req.body.reason || "").trim();

    if (!RETURN_REASONS.includes(reason)) {
        const error = new Error("Please choose a reason for the return.");
        error.statusCode = 400;
        throw error;
    }

    let preferredDate = null;

    if (req.body.preferredDate) {
        preferredDate = new Date(req.body.preferredDate);

        if (Number.isNaN(preferredDate.getTime())) {
            const error = new Error("Invalid preferred return date.");
            error.statusCode = 400;
            throw error;
        }
    }

    const urgent = Boolean(req.body.urgent) || reason === "Emergency";

    assignment.returnRequest = {
        status: "pending",
        reason,
        notes: String(req.body.notes || "").trim().slice(0, 1000),
        preferredDate,
        urgent,
        requestedAt: new Date(),
        adminNote: "",
        handledBy: "",
        handledAt: null,
    };

    await assignment.save();

    await createLedgerEntrySafely({
        type: "foster",
        action: "foster_return_requested",
        actorName: assignment.fosterName,
        actorEmail: assignment.fosterEmail,
        targetType: "FosterAssignment",
        targetId: assignment._id.toString(),
        description: `${assignment.fosterName} asked to return ${assignment.petName} (${reason}).`,
        status: "active",
        metadata: { petName: assignment.petName, reason, urgent },
    });

    const when = preferredDate
        ? ` Preferred date: ${preferredDate.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" })}.`
        : "";

    await notifyShelterStaff(
        urgent ? "URGENT: Foster return request" : "Foster return request",
        `${assignment.fosterName} asked to return ${assignment.petName} (${reason}).${when}`
    );

    return res.status(200).json({
        success: true,
        message: "Return request sent. The shelter will contact you to arrange the handover.",
        assignment,
    });
};

exports.handleReturnRequest = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
        const error = new Error("Invalid assignment.");
        error.statusCode = 400;
        throw error;
    }

    const action = String(req.body.action || "").trim().toLowerCase();
    const adminNote = String(req.body.adminNote || "").trim().slice(0, 500);

    if (!["confirm", "decline"].includes(action)) {
        const error = new Error("Action must be confirm or decline.");
        error.statusCode = 400;
        throw error;
    }

    if (action === "decline" && !adminNote) {
        const error = new Error("Add a note so the foster knows why.");
        error.statusCode = 400;
        throw error;
    }

    const admin = await User.findById(req.user?.id).select("name username email");
    const adminName = String(admin?.name || admin?.username || "Shelter staff").trim();
    const now = new Date();

    const set = {
        "returnRequest.status": action === "confirm" ? "confirmed" : "declined",
        "returnRequest.adminNote": adminNote,
        "returnRequest.handledBy": adminName,
        "returnRequest.handledAt": now,
    };

    if (action === "confirm") {
        set.status = "returned";
        set.endDate = now;
        set.endReason = "early_return";
    }

    // One update that only works while the request is still pending and the
    // assignment is still active (so it can't clash with Accept Evaluation)
    const assignment = await FosterAssignment.findOneAndUpdate(
        { _id: req.params.id, status: "active", "returnRequest.status": "pending" },
        { $set: set },
        { returnDocument: "after" }
    );

    if (!assignment) {
        const error = new Error("This request was already handled or the assignment is no longer active.");
        error.statusCode = 409;
        throw error;
    }

    if (action === "confirm" && assignment.animalId) {
        await Animal.findByIdAndUpdate(assignment.animalId, { $set: { fosterStatus: "none" } });
    }

    await createLedgerEntrySafely({
        type: "foster",
        action: action === "confirm" ? "foster_return_confirmed" : "foster_return_declined",
        actorName: adminName,
        actorEmail: String(admin?.email || req.user?.email || "").toLowerCase(),
        targetType: "FosterAssignment",
        targetId: assignment._id.toString(),
        description: action === "confirm"
            ? `${assignment.petName} was returned to the shelter by ${assignment.fosterName}.`
            : `${adminName} declined ${assignment.fosterName}'s return request for ${assignment.petName}.`,
        status: assignment.status,
        metadata: {
            petName: assignment.petName,
            reason: assignment.returnRequest?.reason,
            adminNote,
        },
    });

    await notifyFoster(
        assignment.fosterEmail,
        action === "confirm" ? "Return confirmed" : "Return request declined",
        action === "confirm"
            ? `The shelter confirmed ${assignment.petName} is back. Thank you for fostering!`
            : `Your request to return ${assignment.petName} was declined: ${adminNote}`
    );

    return res.status(200).json({
        success: true,
        message: action === "confirm" ? "Return confirmed." : "Return request declined.",
        assignment,
    });
};

exports.getMyAssignmentHistory = async (req, res) => {
    const fosterEmail = String(
        req.user?.email || ""
    )
        .trim()
        .toLowerCase();

    if (!fosterEmail) {
        const error = new Error(
            "Authenticated foster email is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const assignments =
        await FosterAssignment.find({
            fosterEmail,
            status: { $in: ["completed", "returned"] },
        }).sort({
            endDate: -1,
        }).populate("animalId", "adoptionStatus");

    return res.status(200).json({
        success: true,
        history: assignments,
    });
};

exports.submitMedicalRequest = async (req, res) => {
    const assignmentId = String(req.params.id || "").trim();

    const email = String(req.user?.email || "")
        .trim()
        .toLowerCase();

    const issue = String(req.body.issue || "").trim();

    const urgency = String(req.body.urgency || "Medium").trim();

    const allowedUrgencies = [
        "Low",
        "Medium",
        "High",
        "Emergency",
    ];

    if (!issue) {
        const error = new Error("Medical issue is required.");
        error.statusCode = 400;
        throw error;
    }

    if (!allowedUrgencies.includes(urgency)) {
        const error = new Error("Invalid urgency level.");
        error.statusCode = 400;
        throw error;
    }

    const assignment = await FosterAssignment.findOne({
        _id: assignmentId,
        fosterEmail: email,
        status: "active",
    });

    if (!assignment) {
        const error = new Error(
            "Active foster assignment not found."
        );

        error.statusCode = 404;
        throw error;
    }

    assignment.medicalRequests.push({
        issue,
        urgency,
        issueType: String(req.body.issueType || "").trim(),
        photoUrl: String(req.body.photoUrl || "").trim(),
        status: "pending",
        submittedBy:
            String(
                req.user?.name ||
                req.user?.username ||
                assignment.fosterName ||
                "Foster User"
            ).trim(),
        submittedByEmail: email,
    });

    await assignment.save();

    await createLedgerEntrySafely({
        type: "foster",
        action: "medical_assistance_requested",

        actorName: assignment.fosterName,
        actorEmail: email,

        targetType: "FosterAssignment",
        targetId: assignment._id.toString(),

        description:
            `${assignment.fosterName} requested medical assistance for ${assignment.petName}.`,

        status: "pending",

        metadata: {
            petName: assignment.petName,
            urgency,
            issue,
        },
    });

    return res.status(201).json({
        success: true,
        message: "Medical assistance request submitted.",
        assignment,
    });
};

exports.getMedicalRequests = async (req, res) => {
    const assignments = await FosterAssignment.find({
        "medicalRequests.0": {
            $exists: true,
        },
    }).sort({
        updatedAt: -1,
    });

    const requests = [];

    for (const assignment of assignments) {
        for (const request of assignment.medicalRequests) {
            requests.push({
                ...request.toObject(),

                assignmentId: assignment._id,
                petName: assignment.petName,
                petBreed: assignment.petBreed,
                fosterName: assignment.fosterName,
                fosterEmail: assignment.fosterEmail,
            });
        }
    }

    requests.sort(
        (a, b) =>
            new Date(b.createdAt) -
            new Date(a.createdAt)
    );

    return res.status(200).json({
        success: true,
        requests,
    });
};

exports.updateMedicalRequest = async (req, res) => {
    const assignmentId = String(
        req.params.assignmentId || ""
    ).trim();

    const requestId = String(
        req.params.requestId || ""
    ).trim();

    const status = String(
        req.body.status || ""
    ).trim();

    const allowedStatuses = [
        "pending",
        "in_progress",
        "resolved",
    ];

    if (!allowedStatuses.includes(status)) {
        const error = new Error(
            "Invalid medical request status."
        );

        error.statusCode = 400;
        throw error;
    }

    const assignment =
        await FosterAssignment.findById(assignmentId);

    if (!assignment) {
        const error = new Error(
            "Foster assignment not found."
        );

        error.statusCode = 404;
        throw error;
    }

    const request =
        assignment.medicalRequests.id(requestId);

    if (!request) {
        const error = new Error(
            "Medical assistance request not found."
        );

        error.statusCode = 404;
        throw error;
    }

    request.status = status;

    request.reviewedBy =
        String(
            req.user?.name ||
            req.user?.username ||
            req.user?.email ||
            "Staff User"
        ).trim();

    request.resolutionNotes =
        String(
            req.body.resolutionNotes || ""
        ).trim();

    if (status === "resolved") {
        request.resolvedAt = new Date();
    } else {
        request.resolvedAt = null;
    }

    await assignment.save();

    await createLedgerEntrySafely({
        type: "foster",
        action: "medical_assistance_updated",

        actorName: request.reviewedBy,
        actorEmail: req.user?.email || "",

        targetType: "FosterAssignment",
        targetId: assignment._id.toString(),

        description:
            `Medical assistance request for ${assignment.petName} was updated to ${status}.`,

        status,

        metadata: {
            petName: assignment.petName,
            requestId,
            resolutionNotes: request.resolutionNotes,
        },
    });

    return res.status(200).json({
        success: true,
        message: "Medical assistance request updated.",
        assignment,
    });
};