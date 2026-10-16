const mongoose = require("mongoose");

const FosterAssignment = require("../models/FosterAssignment");
const FosterApplication = require("../models/FosterApplication");
const Animal = require("../models/Animal");
const LedgerEntry = require("../models/LedgerEntry");
const User = require("../models/User");
const { sendApplicationUpdateEmail, sendFosterUpdateEmail } = require("../services/emailService");

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
                new: true,
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
        await sendApplicationUpdateEmail(
            application.applicantEmail,
            application.status,
            "foster"
        )
    }

    return res.status(200).json({
        success: true,
        message:
            `Foster application ${application.status}.`,
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

    await sendFosterUpdateEmail(
        assignment.fosterEmail,
        "New Foster Assignment.",
        `You have been assigned to foster ${assignment.petName}. Please log in to RescueBase to view the care instructions and assignment details.`
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

    const assignment =
        await FosterAssignment.findOne({
            fosterEmail: email,
            status: "active",
        }).sort({
            createdAt: -1,
        });

    return res.status(200).json({
        success: true,
        assignment,
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

    const updatedAnimal =
        await Animal.findByIdAndUpdate(
            animal._id,
            {
                $set: animalUpdates,
            },
            {
                new: true,
                runValidators: true,
            }
        );

    evaluation.status = "accepted";
    evaluation.reviewedAt = new Date();

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

    await sendFosterUpdateEmail(
        assignment.fosterEmail,
        "Foster Assignment Completed",
        `Your foster assignment for ${assignment.petName} has been completed after the behavioral evaluation was reviewed and accepted.`
    );

    return res.status(200).json({
        success: true,
        message:
            "Behavioral evaluation accepted and foster assignment completed.",
        assignment,
        animal: updatedAnimal,
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
                new: true,
                runValidators: true,
            }
        );

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

    await sendFosterUpdateEmail(
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

    return res.status(200).json({
        success: true,
        message: "Foster assignment deleted.",
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
            status: "completed",
        }).sort({
            endDate: -1,
        });

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