const mongoose = require("mongoose");

const fosterApplicationSchema = new mongoose.Schema(
    {
        applicantName: {
            type: String,
            required: true,
            trim: true,
        },

        applicantEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },

        phoneNumber: {
            type: String,
            default: "",
        },

        address: {
            type: String,
            default: "",
        },

        housingType: {
            type: String,
            enum: ["House", "Apartment", "Condo", "Other"],
            default: "House",
        },

        hasPets: {
            type: Boolean,
            default: false,
        },

        hasChildren: {
            type: Boolean,
            default: false,
        },

        availableSpace: {
            type: String,
            default: "",
        },

        availableTime: {
            type: String,
            default: "",
        },

        fosterExperience: {
            type: String,
            default: "",
        },

        preferredAnimalType: {
            type: String,
            enum: ["Dog", "Cat", "Both", "Other"],
            default: "Both",
        },

        capacity: {
            type: Number,
            default: 1,
        },

        status: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },

        reviewedByName: {
            type: String,
            default: "",
        },

        reviewedByEmail: {
            type: String,
            default: "",
        },

        reviewNotes: {
            type: String,
            default: "",
        },

        reviewedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("FosterApplication", fosterApplicationSchema);