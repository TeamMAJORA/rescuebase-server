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

        colour: {
            type: String,
            default: "",
            trim: true,
        },

        size: {
            type: String,
            default: "",
            trim: true,
        },

        sex: {
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

        coordinates: {
            latitude: {
                type: Number,
                min: -90,
                max: 90,
                default: null,
            },
            longitude: {
                type: Number,
                min: -180,
                max: 180,
                default: null,
            },
        },

        eventDate: {
            type: Date,
            default: null,
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

        matchStatus: {
            type: String,
            enum: [
                "none",
                "suggested",
                "confirmed",
            ],
            default: "none",
        },

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


        colour: {
            type: String,
            enum: [
                "",
                "Black",
                "White",
                "Brown",
                "Tan",
                "Gray",
                "Grey",
                "Cream",
                "Golden",
                "Orange",
                "Red",
                "Mixed",
                "Other",
            ],
            default: "",
            trim: true,
        },

        size: {
            type: String,
            enum: [
                "",
                "Small",
                "Medium",
                "Large",
                "Extra Large",
            ],
            default: "",
            trim: true,
        },

        sex: {
            type: String,
            enum: [
                "",
                "Male",
                "Female",
                "Unknown",
            ],
            default: "",
            trim: true,
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