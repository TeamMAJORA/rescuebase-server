const mongoose = require("mongoose");

const lostFoundReportSchema = new mongoose.Schema(
    {
        reporterName: {
            type: String,
            required: true,
            trim: true,
        },

        reporterEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },

        reportType: {
            type: String,
            enum: ["lost", "found"],
            required: true,
        },

        petName: {
            type: String,
            default: "",
            trim: true,
        },

        species: {
            type: String,
            required: true,
            trim: true,
        },

        breed: {
            type: String,
            default: "",
            trim: true,
        },

        description: {
            type: String,
            required: true,
            trim: true,
        },

        location: {
            type: String,
            required: true,
            trim: true,
        },

        dateReported: {
            type: Date,
            default: Date.now,
        },

        photoUrl: {
            type: String,
            default: "",
        },

        status: {
            type: String,
            enum: [
                "open",
                "matched",
                "claimed",
                "reunited",
                "rejected",
            ],
            default: "open",
        },

        // Used later by the matching system
        matchStatus: {
            type: String,
            enum: [
                "none",
                "suggested",
                "confirmed",
            ],
            default: "none",
        },

        // Used when Admin/Staff verifies a claim
        claimStatus: {
            type: String,
            enum: [
                "none",
                "pending",
                "approved",
                "rejected",
            ],
            default: "none",
        },

        claimedByName: {
            type: String,
            default: "",
        },

        claimedByEmail: {
            type: String,
            default: "",
            lowercase: true,
        },

        claimNotes: {
            type: String,
            default: "",
        },

        reviewedByName: {
            type: String,
            default: "",
        },

        reviewedByEmail: {
            type: String,
            default: "",
            lowercase: true,
        },

        reviewedAt: {
            type: Date,
            default: null,
        },

        reunitedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "LostFoundReport",
    lostFoundReportSchema
);