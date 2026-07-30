const mongoose = require("mongoose");

const medicalRequestSchema = new mongoose.Schema({

    assignmentId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "FosterAssignment",
        required: true,
    },

    petId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Pet",
        required: false,
    },

    petName: {
        type: String,
        required: true,
    },

    fosterEmail: {
        type: String,
        required: true,
        lowercase: true,
        trim: true,
    },

    issueType: {
        type: String,
        required: true,
    },

    priority: {
        type: String,
        enum: [
            "Low",
            "Medium",
            "High",
            "Critical",
        ],
        default: "Medium",
    },

    description: {
        type: String,
        required: true,
        trim: true,
    },

    photoUrl: {
        type: String,
        default: "",
    },

    status: {
        type: String,
        enum: [
            "Pending",
            "In Progress",
            "Resolved",
        ],
        default: "Pending",
    },

    adminResponse: {
        type: String,
        default: "",
    },

    resolvedAt: Date,

}, {
    timestamps: true,
});

module.exports = mongoose.model(
    "MedicalRequest",
    medicalRequestSchema
);