const MedicalRequest = require("../models/MedicalRequest");
const User = require("../models/User");
const Notification = require("../models/Notifications");

const {
    sendMedicalRequestEmail,
} = require("../services/emailService");

exports.createMedicalRequest = async (req, res) => {
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

    const assignmentId = String(
        req.body.assignmentId || ""
    ).trim();

    const petId = String(
        req.body.petId || ""
    ).trim();

    const petName = String(
        req.body.petName || ""
    ).trim();

    const issueType = String(
        req.body.issueType || ""
    ).trim();

    const priority = String(
        req.body.priority || ""
    ).trim();

    const description = String(
        req.body.description || ""
    ).trim();

    if (!assignmentId || !petId || !petName) {
        const error = new Error(
            "Assignment, pet ID, and pet name are required."
        );

        error.statusCode = 400;
        throw error;
    }

    if (!issueType || !priority || !description) {
        const error = new Error(
            "Issue type, priority, and description are required."
        );

        error.statusCode = 400;
        throw error;
    }

    const request =
        await MedicalRequest.create({
            assignmentId,
            petId,
            petName,
            fosterEmail,
            issueType,
            priority,
            description,

            photoUrl: String(
                req.body.photoUrl || ""
            ).trim(),
        });

    await Notification.create({
        user: req.user.id,
        title: "Medical Request Submitted",
        message:
            `Your medical request for ${petName} has been sumitted for review.`,
        type: "medical_update",
    });

    await sendMedicalRequestEmail(
        fosterEmail,
        petName,
        "submitted",
        "You medical reqest has been submitted to the RescueBase admin team."
    );

    return res.status(201).json({
        success: true,
        request,
    });
};


exports.getAllMedicalRequests = async (
    req,
    res
) => {
    const requests =
        await MedicalRequest.find()
            .sort({
                createdAt: -1,
            });

    return res.status(200).json({
        success: true,
        requests,
    });
};


exports.getMyMedicalRequests = async (
    req,
    res
) => {
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

    const requests =
        await MedicalRequest.find({
            fosterEmail,
        }).sort({
            createdAt: -1,
        });

    return res.status(200).json({
        success: true,
        requests,
    });
};


exports.resolveMedicalRequest = async (
    req,
    res
) => {
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

    const request =
        await MedicalRequest.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    status: "Resolved",

                    adminResponse:
                        String(
                            req.body.adminResponse ||
                            ""
                        ).trim(),

                    resolvedAt:
                        new Date(),
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

    if (!request) {
        const error = new Error(
            "Medical request not found."
        );

        error.statusCode = 404;
        throw error;
    }

    const foster = await User.findOne({
        email: request.fosterEmail,
    }).select("_id email");

    if (foster) {
        await Notification.create({
            user: foster._id,
            title: "Medical Request Resolved",
            message:
                `You medical request for ${request.petName} has been resolved.`,
            type: "medical_update",
        });
    }

    await sendMedicalRequestEmail(
        request.fosterEmail,
        request.petName,
        "resolved",
        request.adminResponse ||
        "Your medical request has been reviewed and resolved by the RescueBase administration team."
    );

    return res.status(200).json({
        success: true,
        request,
    });
};