const mongoose = require("mongoose");

const AdoptionApplication = require("../models/AdoptionApplication");
const Animal = require("../models/Animal");
const FosterAssignment = require("../models/FosterAssignment");
const LedgerEntry = require("../models/LedgerEntry");
const User = require("../models/User");
const Notification = require("../models/Notifications");

const {
    sendApplicationUpdateEmail,
    sendInterviewScheduleEmail,
    sendDocumentRequestEmail,
} = require("../services/emailService");

async function createLedgerEntrySafely(data) {
    try {
        await LedgerEntry.create(data);
    } catch (error) {
        console.error("Adoption ledger error:", error);
    }
}

exports.submitApplication = async (req, res) => {
    const animalId = String(req.body.animalId || "").trim();

    if (!mongoose.isValidObjectId(animalId)) {
        const error = new Error("Invalid Animal ID.");
        error.statusCode = 400;
        throw error;
    }

    const applicantUserId = req.user?.id;
    const email = String(req.user?.email || "").trim().toLowerCase();

    if (!applicantUserId || !email) {
        const error = new Error("Authenticated applicant information is missing.");
        error.statusCode = 401;
        throw error;
    }

    const fullName = String(req.body.fullName || "").trim();

    if (!fullName) {
        const error = new Error("Full name is required.");
        error.statusCode = 400;
        throw error;
    }

    const existingPendingApplication = await AdoptionApplication.findOne({
        email,
        status: { $in: ["pending", "interview_scheduled", "interview_completed"] },
    });

    if (existingPendingApplication) {
        const error = new Error(
            "You already have an active adoption application."
        );
        error.statusCode = 409;
        throw error;
    }

    const animal = await Animal.findOne({
        _id: animalId,
        availabilityStatus: "available",
        adoptionStatus: "available",
    }).lean();

    if (!animal) {
        const animalExists = await Animal.exists({ _id: animalId });

        const error = new Error(
            animalExists
                ? "This animal is no longer available for adoption."
                : "Animal not found."
        );

        error.statusCode = animalExists ? 409 : 404;
        throw error;
    }

    const documents = Array.isArray(req.body.documents)
        ? req.body.documents.map((document) => ({
            documentName: String(document?.documentName || "").trim(),
            documentUrl: String(document?.documentUrl || ""),
            publicId: String(document?.publicId || ""),
            status: "pending",
        }))
        : [];

    // Is the applicant the pet's current foster?
    const fosterAssignment = await FosterAssignment.findOne({
        fosterEmail: email,
        animalId: animal._id,
        status: "active",
    }).select("_id");

    const application = await AdoptionApplication.create({
        applicantUserId,
        fullName,
        email,
        phone: String(req.body.phone || "").trim(),
        address: String(req.body.address || "").trim(),
        animalId: animal._id,
        petName: animal.name,
        petBreed: animal.breed || "",
        petImage: animal.image || "",
        homeType: String(req.body.homeType || "").trim(),
        hasChildren: String(req.body.hasChildren || "").trim(),
        hasOtherPets: String(req.body.hasOtherPets || "").trim(),
        reason: String(req.body.reason || "").trim(),
        experience: String(req.body.experience || "").trim(),
        documents,
        documentsVerified: false,
        isFosterAdoption: Boolean(fosterAssignment),
        fosterAssignmentId: fosterAssignment?._id || null,
        role: "adopter",
        status: "pending",
    });

    await createLedgerEntrySafely({
        type: "adoption",
        action: "application_submitted",
        actorName: application.fullName,
        actorEmail: application.email,
        targetType: "AdoptionApplication",
        targetId: application._id.toString(),
        description:
            `${application.fullName} submitted an adoption application for ${application.petName}` +
            (application.isFosterAdoption ? " (their current foster pet)." : "."),
        status: "pending",
        metadata: {
            animalId: application.animalId.toString(),
            petName: application.petName,
            petBreed: application.petBreed,
            applicantEmail: application.email,
        },
    });

    await Notification.create({
        user: application.applicantUserId,
        title: "Adoption Application Submitted",
        message:
            `Your adoption application for ${application.petName} has been submitted and is pending review.`,
        type: "application_update",
    });

    await sendApplicationUpdateEmail(
        application.email,
        "pending",
        "adoption"
    );

    return res.status(201).json({
        success: true,
        message: "Adoption application submitted.",
        application,
    });
};

exports.getAllApplications = async (req, res) => {
    const applications = await AdoptionApplication.find()
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        applications,
    });
};

exports.getLatestUserApplication = async (req, res) => {
    const email = String(req.user?.email || "").trim().toLowerCase();

    if (!email) {
        const error = new Error("Authenticated user email is missing");
        error.statusCode = 401;
        throw error;
    }

    const application = await AdoptionApplication.findOne({ email })
        .populate(
            "animalId",
            "name type breed age gender size image availabilityStatus adoptionStatus"
        )
        .sort({
            createdAt: -1,
        });

    return res.status(200).json({
        success: true,
        application,
    });
};



exports.updateApplicationStatus = async (req, res) => {
    const applicationId = String(req.params.id || "").trim();
    const status = String(req.body.status || "").trim().toLowerCase();
    const reviewNotes = String(req.body.reviewNotes || "").trim();

    const allowedStatuses = [
        "interview_scheduled",
        "interview_completed",
        "approved",
        "rejected",
    ];

    if (!mongoose.isValidObjectId(applicationId)) {
        const error = new Error("Invalid Application ID.");
        error.statusCode = 400;
        throw error;
    }

    if (!allowedStatuses.includes(status)) {
        const error = new Error(
            `Invalid application status: "${status || "(empty)"}".`
        );
        error.statusCode = 400;
        throw error;
    }

    if (status === "rejected" && !reviewNotes) {
        const error = new Error("A rejection reason is required.");
        error.statusCode = 400;
        throw error;
    }

    let interviewDate = null;

    if (status === "interview_scheduled") {
        if (!req.body.interviewSchedule) {
            const error = new Error("An interview date and time are required.");
            error.statusCode = 400;
            throw error;
        }

        interviewDate = new Date(req.body.interviewSchedule);

        if (
            Number.isNaN(interviewDate.getTime()) ||
            interviewDate <= new Date()
        ) {
            const error = new Error(
                "Interview date and time must be a valid future date."
            );
            error.statusCode = 400;
            throw error;
        }
    }

    const adminId = req.user?.id;
    const adminEmail = String(req.user?.email || "").trim().toLowerCase();

    if (!adminId || !adminEmail) {
        const error = new Error("Authenticated staff information is missing.");
        error.statusCode = 401;
        throw error;
    }

    const adminUser = await User.findById(adminId)
        .select("name username email role");

    if (!adminUser) {
        const error = new Error("Staff account was not found.");
        error.statusCode = 401;
        throw error;
    }

    const adminName = String(
        adminUser.name || adminUser.username || "Staff User"
    ).trim();

    const application = await AdoptionApplication.findById(applicationId);

    if (!application) {
        const error = new Error("Application not found.");
        error.statusCode = 404;
        throw error;
    }

    // Rejecting is always allowed, even if the animal record is missing or was deleted,
    // so an application can never get stuck
    if (!application.animalId && status !== "rejected") {
        const error = new Error("Application is not connected to an animal.");
        error.statusCode = 400;
        throw error;
    }


    const allowedTransitions = {
        pending: ["interview_scheduled", "rejected"],
        interview_scheduled: [
            "interview_scheduled", // Allow rescheduling
            "interview_completed",
            "rejected",
        ],
        interview_completed: ["approved", "rejected"],
    };

    if (!allowedTransitions[application.status]?.includes(status)) {
        const error = new Error(
            `Cannot change application from ${application.status} to ${status}.`
        );
        error.statusCode = 409;
        throw error;
    }

    const animalExists = application.animalId
        ? await Animal.exists({ _id: application.animalId })
        : null;

    if (!animalExists && status !== "rejected") {
        const error = new Error("Animal record not found.");
        error.statusCode = 404;
        throw error;
    }

    const previousStatus = application.status;
    const previousReview = {
        reviewedByName: application.reviewedByName,
        reviewedByEmail: application.reviewedByEmail,
        reviewNotes: application.reviewNotes,
        rejectionReason: application.rejectionReason,
        reviewedAt: application.reviewedAt,
        interviewSchedule: application.interviewSchedule,
    };

    let adoptedAnimal = null;

    if (status === "approved") {
        adoptedAnimal = await Animal.findOneAndUpdate(
            {
                _id: application.animalId,
                availabilityStatus: "available",
                adoptionStatus: "available",
            },
            {
                $set: {
                    adoptionStatus: "adopted",
                    availabilityStatus: "unavailable",
                },
            },
            {
                returnDocument: "after",
                runValidators: true,
            }
        );

        if (!adoptedAnimal) {
            const error = new Error(
                "This pet is no longer available for adoption."
            );
            error.statusCode = 409;
            throw error;
        }
    }

    application.status = status;
    application.reviewedByName = adminName;
    application.reviewedByEmail = adminEmail;
    application.reviewNotes = reviewNotes;

    if (status === "interview_scheduled") {
        application.interviewSchedule = interviewDate;
    }

    if (status === "rejected") {
        application.rejectionReason = reviewNotes;
        application.reviewedAt = new Date();
    }

    if (status === "approved") {
        application.reviewedAt = new Date();
        application.rejectionReason = "";
    }

    try {
        await application.save();
    } catch (saveError) {
        if (adoptedAnimal) {
            try {
                await Animal.updateOne(
                    {
                        _id: application.animalId,
                        adoptionStatus: "adopted",
                        availabilityStatus: "unavailable",
                    },
                    {
                        $set: {
                            adoptionStatus: "available",
                            availabilityStatus: "available",
                        },
                    }
                );
            } catch (rollbackError) {
                console.error(
                    "CRITICAL: Failed to restore animal availability:",
                    rollbackError
                );
            }
        }

        throw saveError;
    }

    if (status === "approved") {
        const activeStatuses = [
            "pending",
            "interview_scheduled",
            "interview_completed",
        ];

        const otherApplications = await AdoptionApplication.find({
            _id: { $ne: application._id },
            animalId: application.animalId,
            status: { $in: activeStatuses },
        });

        await AdoptionApplication.updateMany(
            {
                _id: { $ne: application._id },
                animalId: application.animalId,
                status: { $in: activeStatuses },
            },
            {
                $set: {
                    status: "rejected",
                    reviewedByName: adminName,
                    reviewedByEmail: adminEmail,
                    reviewNotes:
                        "Another adoption application was approved.",
                    rejectionReason:
                        "Another adoption application was approved.",
                    reviewedAt: new Date(),
                },
            }
        );

        for (const other of otherApplications) {
            try {
                await Notification.create({
                    user: other.applicantUserId,
                    title: "Adoption Application Update",
                    message:
                        `Your application for ${other.petName} was closed ` +
                        "because another application was approved.",
                    type: "application_update",
                });

                await sendApplicationUpdateEmail(
                    other.email,
                    "rejected",
                    "adoption"
                );
            } catch (notificationError) {
                console.error(
                    "Failed to notify another applicant:",
                    notificationError
                );
            }
        }
    }

    // The pet was in foster care: end that foster assignment
    if (status === "approved") {
        try {
            const activeFoster = await FosterAssignment.findOne({
                animalId: application.animalId,
                status: "active",
            });

            if (activeFoster) {
                const byFoster = activeFoster.fosterEmail === application.email;

                await FosterAssignment.updateOne(
                    { _id: activeFoster._id, status: "active" },
                    {
                        $set: {
                            status: "completed",
                            endDate: new Date(),
                            endReason: byFoster ? "adopted_by_foster" : "adopted",
                        },
                    }
                );

                await Animal.updateOne(
                    { _id: application.animalId },
                    { $set: { fosterStatus: "completed" } }
                );

                if (!byFoster) {
                    const foster = await User.findOne({ email: activeFoster.fosterEmail }).select("_id");

                    if (foster) {
                        await Notification.create({
                            user: foster._id,
                            title: "Your foster pet was adopted",
                            message:
                                `${activeFoster.petName} has been adopted. The shelter will contact you ` +
                                "to arrange the handover. Thank you for fostering!",
                            type: "foster_update",
                        });
                    }
                }
            }
        } catch (fosterError) {
            console.error("Failed to close the foster assignment:", fosterError);
        }
    }

    let notificationMessage;

    switch (status) {
        case "interview_scheduled":
            notificationMessage =
                `Your interview for ${application.petName} is scheduled for ` +
                `${application.interviewSchedule.toLocaleString()}.`;
            break;

        case "interview_completed":
            notificationMessage =
                `Your interview for ${application.petName} has been completed. ` +
                "The final decision is pending.";
            break;

        case "approved":
            notificationMessage =
                `Your adoption application for ${application.petName} ` +
                "has been approved.";
            break;

        case "rejected":
            notificationMessage =
                `Your adoption application for ${application.petName} ` +
                `was rejected. Reason: ${reviewNotes}`;
            break;
    }

    try {
        await Notification.create({
            user: application.applicantUserId,
            title: "Adoption Application Update",
            message: notificationMessage,
            type: "application_update",
        });

        if (status === "interview_scheduled") {
            await sendInterviewScheduleEmail(
                application.email,
                application.interviewSchedule.toLocaleDateString(),
                application.interviewSchedule.toLocaleTimeString()
            );
        } else if (status === "approved" || status === "rejected") {
            await sendApplicationUpdateEmail(
                application.email,
                status,
                "adoption"
            );
        }
    } catch (notificationError) {
        console.error(
            "Failed to notify adoption applicant:",
            notificationError
        );
    }

    await createLedgerEntrySafely({
        type: "adoption",
        action: `application_${status}`,
        actorName: adminName,
        actorEmail: adminEmail,
        targetType: "AdoptionApplication",
        targetId: application._id.toString(),
        description:
            `${adminName} changed the application for ` +
            `${application.petName} to ${status}.`,
        status,
        metadata: {
            animalId: application.animalId ? application.animalId.toString() : "",
            petName: application.petName,
            applicantEmail: application.email,
            interviewSchedule: application.interviewSchedule,
        },
    });

    await application.populate(
        "animalId",
        "name type breed age gender size image availabilityStatus adoptionStatus"
    );

    return res.status(200).json({
        success: true,
        message: `Application updated to ${status}.`,
        application,
        animal: application.animalId,
    });
};

exports.withdrawApplication = async (req, res) => {
    const applicationId = String(req.params.id || "").trim();
    const email = String(req.user?.email || "").trim().toLowerCase();

    if (!mongoose.isValidObjectId(applicationId)) {
        const error = new Error("Invalid Application ID.");
        error.statusCode = 400;
        throw error;
    }

    // Only the adopter who owns the application can withdraw it
    const application = await AdoptionApplication.findOne({
        _id: applicationId,
        email,
    });

    if (!application) {
        const error = new Error("Application not found.");
        error.statusCode = 404;
        throw error;
    }

    const withdrawableStatuses = [
        "pending",
        "interview_scheduled",
        "interview_completed",
    ];

    if (!withdrawableStatuses.includes(application.status)) {
        const error = new Error(
            `This application is already ${application.status} and can no longer be withdrawn.`
        );
        error.statusCode = 409;
        throw error;
    }

    const previousStatus = application.status;

    application.status = "withdrawn";
    application.withdrawnFromStatus = previousStatus;
    application.withdrawnAt = new Date();
    application.withdrawalReason = String(req.body?.reason || "")
        .trim()
        .slice(0, 300);

    await application.save();

    await createLedgerEntrySafely({
        type: "adoption",
        action: "application_withdrawn",
        actorName: application.fullName,
        actorEmail: application.email,
        targetType: "AdoptionApplication",
        targetId: application._id.toString(),
        description:
            `${application.fullName} withdrew their adoption application for ${application.petName}.`,
        status: "withdrawn",
        metadata: {
            animalId: application.animalId.toString(),
            petName: application.petName,
            previousStatus,
            reason: application.withdrawalReason,
        },
    });

    return res.status(200).json({
        success: true,
        message: "Your application has been withdrawn.",
        application,
    });
};

exports.getUserApplicationHistory = async (req, res) => {
    const email = String(req.user?.email || "").trim().toLowerCase();

    if (!email) {
        const error = new Error("Authenticated user email is missing");
        error.statusCode = 401;
        throw error;
    }

    const applications = await AdoptionApplication.find({ email })
        .select(
            "petName petBreed petImage status createdAt updatedAt reviewedAt " +
            "withdrawnAt interviewSchedule rejectionReason withdrawalReason animalId"
        )
        .populate("animalId", "name breed image")
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

    return res.status(200).json({
        success: true,
        applications,
    });
};

// Applications that can still change documents
const DOCUMENT_OPEN_STATUSES = [
    "pending",
    "interview_scheduled",
    "interview_completed",
];

// Admin/staff: ask the applicant to upload their documents again
exports.requestDocumentResubmission = async (req, res) => {
    const applicationId = String(req.params.id || "").trim();
    const reason = String(req.body?.reason || "").trim().slice(0, 500);

    if (!mongoose.isValidObjectId(applicationId)) {
        const error = new Error("Invalid Application ID.");
        error.statusCode = 400;
        throw error;
    }

    if (!reason) {
        const error = new Error("Tell the applicant what needs to be fixed.");
        error.statusCode = 400;
        throw error;
    }

    const application = await AdoptionApplication.findById(applicationId);

    if (!application) {
        const error = new Error("Application not found.");
        error.statusCode = 404;
        throw error;
    }

    if (!DOCUMENT_OPEN_STATUSES.includes(application.status)) {
        const error = new Error(
            `This application is already ${application.status}, so documents can no longer be requested.`
        );
        error.statusCode = 409;
        throw error;
    }

    const staff = await User.findById(req.user?.id).select("name username");
    const staffName = String(staff?.name || staff?.username || "Staff").trim();

    application.documents.forEach((document) => {
        document.status = "rejected";
    });
    application.documentsVerified = false;
    application.documentRequest = {
        status: "requested",
        reason,
        requestedAt: new Date(),
        requestedBy: staffName,
        resubmittedAt: null,
    };

    await application.save();

    await createLedgerEntrySafely({
        type: "adoption",
        action: "documents_resubmission_requested",
        actorName: staffName,
        actorEmail: String(req.user?.email || "").toLowerCase(),
        targetType: "AdoptionApplication",
        targetId: application._id.toString(),
        description: `${staffName} asked ${application.fullName} to resubmit their documents for ${application.petName}.`,
        status: application.status,
        metadata: { reason },
    });

    if (application.applicantUserId) {
        await Notification.create({
            user: application.applicantUserId,
            title: "Please resubmit your documents",
            message: `The shelter needs a new copy of your ID for ${application.petName}. Reason: ${reason}`,
            type: "application_update",
        });
    }

    try {
        await sendDocumentRequestEmail(application.email, application.petName, reason);
    } catch (error) {
        console.error("Document request email error:", error);
    }

    return res.status(200).json({
        success: true,
        message: "Resubmission request sent to the applicant.",
        application,
    });
};

// Adopter/foster: upload new documents after staff asked for them
exports.resubmitDocuments = async (req, res) => {
    const applicationId = String(req.params.id || "").trim();
    const email = String(req.user?.email || "").trim().toLowerCase();

    if (!mongoose.isValidObjectId(applicationId)) {
        const error = new Error("Invalid Application ID.");
        error.statusCode = 400;
        throw error;
    }

    // Only the owner of the application can resubmit
    const application = await AdoptionApplication.findOne({ _id: applicationId, email });

    if (!application) {
        const error = new Error("Application not found.");
        error.statusCode = 404;
        throw error;
    }

    if (application.documentRequest?.status !== "requested") {
        const error = new Error("The shelter has not asked for new documents.");
        error.statusCode = 409;
        throw error;
    }

    if (!DOCUMENT_OPEN_STATUSES.includes(application.status)) {
        const error = new Error(`This application is already ${application.status}.`);
        error.statusCode = 409;
        throw error;
    }

    const documents = (Array.isArray(req.body?.documents) ? req.body.documents : [])
        .map((document) => ({
            documentName: String(document?.documentName || "").trim(),
            documentUrl: String(document?.documentUrl || ""),
            publicId: String(document?.publicId || ""),
            status: "pending",
        }))
        .filter((document) => document.documentUrl);

    if (!documents.length) {
        const error = new Error("Please upload your ID.");
        error.statusCode = 400;
        throw error;
    }

    application.documents = documents;
    application.documentsVerified = false;
    application.documentRequest.status = "resubmitted";
    application.documentRequest.resubmittedAt = new Date();

    await application.save();

    await createLedgerEntrySafely({
        type: "adoption",
        action: "documents_resubmitted",
        actorName: application.fullName,
        actorEmail: application.email,
        targetType: "AdoptionApplication",
        targetId: application._id.toString(),
        description: `${application.fullName} resubmitted their documents for ${application.petName}.`,
        status: application.status,
        metadata: { petName: application.petName },
    });

    // Let admins and staff know new documents are waiting
    try {
        const reviewers = await User.find({ role: { $in: ["admin", "staff"] } }).select("_id");

        if (reviewers.length) {
            await Notification.insertMany(
                reviewers.map((reviewer) => ({
                    user: reviewer._id,
                    title: "Documents resubmitted",
                    message: `${application.fullName} uploaded new documents for ${application.petName}.`,
                    type: "application_update",
                }))
            );
        }
    } catch (error) {
        console.error("Notify reviewers error:", error);
    }

    return res.status(200).json({
        success: true,
        message: "Your new documents were sent to the shelter.",
        application,
    });
};