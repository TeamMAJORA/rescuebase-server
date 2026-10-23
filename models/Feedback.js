const mongoose = require("mongoose");

const FeedbackSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        userName: {
            type: String,
            required: true,
            trim: true,
        },

        userEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },

        role: {
            type: String,
            required: true,
            enum: [
                "admin",
                "staff",
                "adopter",
                "foster",
                "volunteer",
                "donor",
            ],
        },

        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },

        category: {
            type: String,
            required: true,
            enum: [
                "general",
                "adoption",
                "foster",
                "volunteer",
                "donation",
                "lost_found",
                "medical",
                "website",
                "other",
            ],
            default: "general",
        },

        message: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2000,
        },

        status: {
            type: String,
            enum: [
                "active",
                "archived",
            ],
            default: "active",
        },

        archivedAt: {
            type: Date,
            default: null,
        },

        // Shelter's reply (sent to the user by email + notification)
        reply: {
            type: String,
            default: "",
            trim: true,
            maxlength: 2000,
        },

        repliedAt: {
            type: Date,
            default: null,
        },

        repliedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        repliedByName: {
            type: String,
            default: "",
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "Feedback",
    FeedbackSchema
);