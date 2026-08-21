const mongoose = require("mongoose");

const FosterAssignment = require("../models/FosterAssignment");
const FosterApplication = require("../models/FosterApplication");
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

        availableSpace: String(
            req.body.availableSpace || ""
        ).trim(),

        availableTime: String(
            req.body.availableTime || ""
        ).trim(),

        fosterExperience: String(
            req.body.fosterExperience || ""
        ).trim(),

        preferredAnimalType:
            req.body.preferredAnimalType ||
            "Both",

        capacity,

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

    const assignment =
        await FosterAssignment.create({
            petName: String(
                req.body.petName || ""
            ).trim(),

            petBreed: String(
                req.body.petBreed || ""
            ).trim(),

            petImage: String(
                req.body.petImage || ""
            ).trim(),

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
        await FosterAssignment.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    status: "completed",
                    endDate: new Date(),
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

    if (!assignment) {
        const error = new Error(
            "Foster assignment not found."
        );

        error.statusCode = 404;
        throw error;
    }

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