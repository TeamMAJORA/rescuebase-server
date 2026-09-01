const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
    {
        title: {
            type: String,
            required: true,
            trim: true,
        },

        type: {
            type: String,
            required: true,
            enum: [
                "adoption",
                "foster",
                "lost-found",
                "gis",
                "feedback",
                "analytics",
            ],
            lowercase: true,
            trim: true,
        },

        period: {
            type: String,
            required: true,
            trim: true,
        },

        status: {
            type: String,
            enum: [
                "draft",
                "finalized",
            ],
            default: "draft",
            lowercase: true,
            trim: true,
        },

        summary: {
            type: String,
            required: true,
            trim: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        createdByName: {
            type: String,
            required: true,
            trim: true,
        },

        createdByEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },

        finalizedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "Report",
    reportSchema
);