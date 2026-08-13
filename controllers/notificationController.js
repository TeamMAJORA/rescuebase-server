const mongoose = require("mongoose");

const Notification = require("../models/Notifications");
const User = require("../models/User");

exports.createNotification = async (req, res) => {
    const email = String(
        req.body.email || ""
    )
        .trim()
        .toLowerCase();

    const title = String(
        req.body.title || ""
    ).trim();

    const message = String(
        req.body.message || ""
    ).trim();

    const type = String(
        req.body.type || "general"
    )
        .trim()
        .toLowerCase();

    if (!email) {
        const error = new Error(
            "Notification recipient email is required."
        );

        error.statusCode = 400;
        throw error;
    }

    if (!title) {
        const error = new Error(
            "Notification title is required."
        );

        error.statusCode = 400;
        throw error;
    }

    if (!message) {
        const error = new Error(
            "Notification message is required."
        );

        error.statusCode = 400;
        throw error;
    }

    const recipient = await User.findOne({
        email,
    }).select("id email role");

    if (!recipient) {
        const error = new Error(
            "Notification recipient was not found."
        );

        error.statusCode = 404;
        throw error;
    }

    const notification =
        await Notification.create({
            user: recipient.id,
            title,
            message,
            type,
        });

    return res.status(201).json({
        success: true,
        notification,
    });
};

exports.getNotifications = async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
        const error = new Error(
            "Authenticated user is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const notifications =
        await Notification.find({
            user: userId,
        }).sort({
            createdAt: -1,
        });

    return res.status(200).json({
        success: true,
        notifications,
    });
};

exports.getUnreadCount = async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
        const error = new Error(
            "Authenticated user is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const count =
        await Notification.countDocuments({
            user: userId,
            read: false,
        });

    return res.status(200).json({
        success: true,
        count,
    });
};

exports.markAsRead = async (req, res) => {
    const notificationId = String(
        req.params.id || ""
    ).trim();

    if (
        !mongoose.isValidObjectId(
            notificationId
        )
    ) {
        const error = new Error(
            "Invalid notification ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const userId = req.user?.id;

    if (!userId) {
        const error = new Error(
            "Authenticated user is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const notification =
        await Notification.findOneAndUpdate(
            {
                id: notificationId,
                user: userId,
            },
            {
                $set: {
                    read: true,
                    readAt: new Date(),
                },
            },
            {
                new: true,
            }
        );

    if (!notification) {
        const error = new Error(
            "Notification not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        notification,
    });
};

exports.markAllAsRead = async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
        const error = new Error(
            "Authenticated user is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    await Notification.updateMany(
        {
            user: userId,
            read: false,
        },
        {
            $set: {
                read: true,
                readAt: new Date(),
            },
        }
    );

    return res.status(200).json({
        success: true,
        message:
            "All notifications marked as read.",
    });
};