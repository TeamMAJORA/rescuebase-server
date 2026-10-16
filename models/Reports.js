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
                "all",
                "animals",
                "medical",
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

        // Saved by Generate so Download can rebuild the same ZIP
        exportFormat: {
            type: String,
            enum: ["text", "zip"],
            default: "text",
        },

        dateRange: {
            type: String,
            default: "all",
        },

        fromDate: {
            type: Date,
            default: null,
        },

        toDate: {
            type: Date,
            default: null,
        },

        datasets: {
            type: Object,
            default: null,
        },

        // Rows per CSV file, e.g. { animals: 42, medical_records: 18 }
        recordCounts: {
            type: Object,
            default: {},
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