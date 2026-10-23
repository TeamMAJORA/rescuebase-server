const mongoose = require("mongoose");

const Feedback = require("../models/Feedback");
const User = require("../models/User");
const Notification = require("../models/Notifications");
const { sendFeedbackReplyEmail } = require("../services/emailService");

exports.createFeedback = async (req, res) => {
    const userId = req.user?.id;

    if (!userId) {
        const error = new Error("Auth is required");
        error.statusCode = 401;
        throw error;
    }

    const user = await User.findById(userId).select("_id name username email role");

    if (!user) {
        const e = new Error("USer account was not found");
        e.statusCode = 404;
        throw e;
    }

    const rating = Number(req.body.rating);
    const category = String(req.body.category || "general").trim().toLowerCase();
    const message = String(req.body.message || "").trim();

    if (Number.isNaN(rating) || rating < 1 || rating > 5) {
        const e = new Error("Rating must me 1 and 5");
        e.statusCode = 400;
        throw e;
    }

    if (!message) {
        const e = new Error("Feedback message is required.");
        e.statusCode = 400;
        throw e;
    }

    const validCategories = [
        "general",
        "adoption",
        "foster",
        "volunteer",
        "donation",
        "lost_found",
        "medical",
        "website",
        "other",
    ];

    if (!validCategories.includes(category)) {
        const e = new Error("Invalid feedback category");
        e.statusCode = 400;
        throw e;
    }

    const feedback = await Feedback.create({
        user: user._id,
        userName:
            user.name ||
            user.username ||
            "User",
        userEmail: user.email,
        role: user.role,
        rating,
        category,
        message,
        status: "active",
    });

    return res.status(201).json({
        success: true,
        message: "Feedback submitted successfully.",
        feedback,
    });
};

exports.getAllFeedback = async (req, res) => {
    const status = String(req.query.status || "").trim().toLowerCase();
    const filter = {};

    if (status) {
        if (!["active", "archived"].includes(status)) {
            const e = new Error("Invalid feedback status");
            e.statusCode = 400;
            throw e;
        }

        filter.status = status;
    }

    const feedback = await Feedback.find(filter).sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        feedback,
    });
};

exports.getFeedbackById = async (req, res) => {
    const feedbackId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(feedbackId)) {
        const e = new Error("Invalid feedback ID.");
        e.statusCode = 400;
        throw e;
    }

    const feedback = await Feedback.findById(feedbackId);

    if (!feedback) {
        const e = new Error("Feedback not found")
        e.statusCode = 404;
        throw e;
    }

    return res.status(200).json({
        success: true,
        feedback,
    });
};

// PATCH /api/feedback/:id/reply  (admin, staff)
exports.replyToFeedback = async (req, res) => {
    const feedbackId = String(req.params.id || "").trim();
    const reply = String(req.body?.reply || "").trim();

    if (!mongoose.isValidObjectId(feedbackId)) {
        const e = new Error("Invalid feedback ID.");
        e.statusCode = 400;
        throw e;
    }

    if (!reply) {
        const e = new Error("Write a reply first.");
        e.statusCode = 400;
        throw e;
    }

    if (reply.length > 2000) {
        const e = new Error("Reply is too long (2000 characters max).");
        e.statusCode = 400;
        throw e;
    }

    const feedback = await Feedback.findById(feedbackId);

    if (!feedback) {
        const e = new Error("Feedback not found.");
        e.statusCode = 404;
        throw e;
    }

    const replier = await User.findById(req.user?.id).select("name username").lean();

    feedback.reply = reply;
    feedback.repliedAt = new Date();
    feedback.repliedBy = req.user?.id || null;
    feedback.repliedByName = replier?.name || replier?.username || "RescueBase staff";
    await feedback.save();

    // In-app notification (never blocks the reply)
    let notified = false;
    try {
        await Notification.create({
            user: feedback.user,
            title: "We replied to your feedback",
            message: reply.length > 180 ? `${reply.slice(0, 177)}...` : reply,
            type: "general",
        });
        notified = true;
    } catch (error) {
        console.error("Feedback reply notification failed:", error.message);
    }

    // Email (never blocks the reply)
    let emailed = false;
    if (feedback.userEmail) {
        try {
            await sendFeedbackReplyEmail(feedback.userEmail, feedback.userName, feedback.message, reply);
            emailed = true;
        } catch (error) {
            console.error("Feedback reply email failed:", error.message);
        }
    }

    return res.status(200).json({
        success: true,
        message: emailed
            ? "Reply sent by email and notification."
            : notified
                ? "Reply saved and the user was notified, but the email could not be sent."
                : "Reply saved, but the user could not be notified.",
        emailed,
        notified,
        feedback,
    });
};

exports.archiveFeedback = async (req, res) => {
    const feedbackId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(feedbackId)) {
        const e = new Error("Invalid feedback ID.");
        e.statusCode = 400;
        throw e;
    }

    const feedback = await Feedback.findById(feedbackId);

    if (!feedback) {
        const e = new Error("Feedback not found");
        e.statusCode = 404;
        throw e;
    }

    if (feedback.status === "archived") {
        const e = new Error("Feedback is already archived.");
        e.statusCode = 400;
        throw e;
    }

    feedback.status = "archived";
    feedback.archivedAt = new Date();

    await feedback.save();

    return res.status(200).json({
        success: true,
        message: "Feedback archived successfully.",
        feedback,
    });
};

exports.restoreFeedback = async (req, res) => {
    const feedbackId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(feedbackId)) {
        const e = new Error("Invalid feedback ID.");
        e.statusCode = 400;
        throw e;
    }

    const feedback = await Feedback.findById(feedbackId);

    if (!feedback) {
        const e = new Error("Feedback not found.");
        e.statusCode = 404;
        throw e;
    }

    if (feedback.status === "active") {
        const e = new Error("Feedback is already active");
        e.statusCode = 400;
        throw e;
    }

    feedback.status = "active";
    feedback.archivedAt = null;

    await feedback.save();

    return res.status(200).json({
        success: true,
        message: "Feedback restored successfully.",
        feedback,
    });
};

exports.deleteFeedback = async (req, res) => {
    const feedbackId = String(req.params.id || "").trim();

    if (!mongoose.isValidObjectId(feedbackId)) {
        const e = new Error("Invalid feedback ID.");
        e.statusCode = 400;
        throw e;
    }

    const feedback = await Feedback.findByIdAndDelete(feedbackId);

    if (!feedback) {
        const e = new Error("Feedback not found.");
        e.statusCode = 404;
        throw e;
    }

    return res.status(200).json({
        success : true,
        message : "Feedback deleted successfully."
    });
};
exports.getMyFeedback = async (req, res) => {
    const email = String(req.user?.email || "").trim().toLowerCase();

    if (!email) {
        const error = new Error("Authenticated user email is missing.");
        error.statusCode = 401;
        throw error;
    }

    const feedback = await Feedback.find({ userEmail: email }).sort({ createdAt: -1 });

    return res.json({
        success: true,
        feedback,
    });
};