const User = require("../models/User");

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