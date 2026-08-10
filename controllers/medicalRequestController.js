const MedicalRequest = require("../models/MedicalRequest");
const User = require("../models/User");

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

    return res.status(200).json({
        success: true,
        request,
    });
};