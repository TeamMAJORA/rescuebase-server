const bcrypt = require("bcrypt");
const User = require("../models/User");
const cleanUser = require("../utils/cleanUser");

exports.getAllUsers = async (req, res) => {
    const users = await User.find()
        .select(
            "-password -emailOtp -emailOtpExpires -emailOtpAttempts"
        )
        .sort({
            createdAt: -1,
        });

    return res.status(200).json({
        success: true,
        users,
    });
};


exports.updateUser = async (req, res) => {
    const allowedFields = [
        "name",
        "username",
        "role",
        "status",
        "verified",
        "profileImage",
    ];

    const allowedUpdates = {};

    allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
            allowedUpdates[field] =
                req.body[field];
        }
    });

    if (
        Object.keys(allowedUpdates).length === 0
    ) {
        const error = new Error(
            "No valid fields provided for this update."
        );

        error.statusCode = 400;
        throw error;
    }

    const user =
        await User.findByIdAndUpdate(
            req.params.id,
            {
                $set: allowedUpdates,
            },
            {
                new: true,
                runValidators: true,
            }
        ).select(
            "-password -emailOtp -emailOtpExpires -emailOtpAttempts"
        );

    if (!user) {
        const error = new Error(
            "User not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        message:
            "User updated successfully.",
        user,
    });
};

exports.adminCreateUser = async (req, res) => {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const role = String(req.body.role || "adopter").trim();

    const allowedRoles = [
        "admin",
        "adopter",
        "foster",
        "volunteer",
        "staff",
    ];

    if (!username || !email || !password) {
        const error = new Error(
            "Username, email, and password are required."
        );
        error.statusCode = 400;
        throw error;
    }

    if (password.length < 6) {
        const error = new Error(
            "Password must be at least 6 characters."
        );
        error.statusCode = 400;
        throw error;
    }

    if (!allowedRoles.includes(role)) {
        const error = new Error("Invalid user role.");
        error.statusCode = 400;
        throw error;
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
        const error = new Error(
            "An account with this email already exists."
        );
        error.statusCode = 409;
        throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
        username,
        name: username,
        email,
        password: hashedPassword,
        provider: "local",
        role,
        status: "active",
        verified: true,
    });

    return res.status(201).json({
        success: true,
        message: "User created successfully.",
        user: cleanUser(user),
    });
};

exports.deactivateUser = async (req, res) => {
    const { id } = req.params;

    if (req.user?.id === id || req.user?._id?.toString() === id) {
        const error = new Error(
            "You cannot deactivate your own account."
        );
        error.statusCode = 400;
        throw error;
    }

    const user = await User.findById(id);

    if (!user) {
        const error = new Error("User not found.");
        error.statusCode = 404;
        throw error;
    }

    if (user.status === "disabled") {
        const error = new Error("This user is already deactivated.");
        error.statusCode = 400;
        throw error;
    }

    user.status = "disabled";
    await user.save();

    return res.status(200).json({
        success: true,
        message: "User deactivated successfully.",
    });
};

exports.submitRoleApplication = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;
        const { targetRole, reason } = req.body;

        if (!["volunteer", "staff"].includes(targetRole)) {
            return res.status(400).json({
                success: false,
                message: "Invalid application role.",
            });
        }

        if (!reason || !reason.trim()) {
            return res.status(400).json({
                success: false,
                message: "Application reason is required.",
            });
        }

        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        if (user.role !== "adopter") {
            return res.status(403).json({
                success: false,
                message: "Only adopters can submit role applications.",
            });
        }

        if (user.roleApplication?.status === "pending") {
            return res.status(400).json({
                success: false,
                message: "You already have a pending application.",
            });
        }

        user.roleApplication = {
            targetRole,
            status: "pending",
            reason: reason.trim(),
            rejectionReason: "",
            submittedAt: new Date(),
            reviewedAt: null,
            reviewedBy: null,
        };

        await user.save();

        return res.status(201).json({
            success: true,
            message: "Role application submitted successfully.",
            application: user.roleApplication,
        });
    } catch (error) {
        console.error("Submit role application error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to submit role application.",
        });
    }
};

exports.getMyRoleApplication = async (req, res) => {
    try {
        const userId = req.user.id || req.user._id;

        const user = await User.findById(userId).select(
            "role roleApplication"
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        return res.json({
            success: true,
            application: user.roleApplication || null,
        });
    } catch (error) {
        console.error("Get role application error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to load role application.",
        });
    }
};

exports.reviewRoleApplication = async (req, res) => {
    try {
        const { id } = req.params;
        const { decision, rejectionReason = "" } = req.body;

        if (!["approved", "rejected"].includes(decision)) {
            return res.status(400).json({
                success: false,
                message: "Invalid review decision.",
            });
        }

        const user = await User.findById(id);

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        if (user.roleApplication?.status !== "pending") {
            return res.status(400).json({
                success: false,
                message: "This application is not pending.",
            });
        }

        const applicationRole = user.roleApplication.targetRole;

        if (decision === "approved") {
            user.role = applicationRole;
            user.roleApplication.status = "approved";
            user.roleApplication.rejectionReason = "";
        } else {
            user.roleApplication.status = "rejected";
            user.roleApplication.rejectionReason =
                String(rejectionReason).trim();
        }

        user.roleApplication.reviewedAt = new Date();
        user.roleApplication.reviewedBy =
            req.user.id || req.user._id;

        await user.save();

        return res.json({
            success: true,
            message: `Application ${decision} successfully.`,
            application: user.roleApplication,
            role: user.role,
        });
    } catch (error) {
        console.error("Review role application error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to review role application.",
        });
    }
};