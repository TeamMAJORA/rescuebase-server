const mongoose = require("mongoose");

const GISLocationSchema = new mongoose.Schema(
    {
        petName: {
            type: String,
            required: true,
            trim: true,
        },

        reportType: {
            type: String,
            enum: [
                "lost",
                "found",
                "stray",
                "rescue",
                "intake",
            ],
            required: true,
            lowercase: true,
            trim: true,
        },

        species: {
            type: String,
            enum: [
                "dog",
                "cat",
                "other",
                "unknown",
            ],
            default: "unknown",
            lowercase: true,
            trim: true,
        },

        locationName: {
            type: String,
            required: true,
            trim: true,
        },

        latitude: {
            type: Number,
            required: true,
        },

        longitude: {
            type: Number,
            required: true,
        },

        status: {
            type: String,
            enum: [
                "open",
                "resolved",
            ],
            default: "open",
            lowercase: true,
            trim: true,
        },

        description: {
            type: String,
            default: "",
            trim: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        createdByName: {
            type: String,
            default: "",
            trim: true,
        },

        createdByEmail: {
            type: String,
            default: "",
            trim: true,
            lowercase: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports =
    mongoose.model(
        "GISLocation",
        GISLocationSchema
    );