const mongoose = require("mongoose");

const Feedback = require("../models/Feedback");
const User = require("../models/User");

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

    return res, status(200).json({
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
        message: "Feedback restored successfullu.",
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