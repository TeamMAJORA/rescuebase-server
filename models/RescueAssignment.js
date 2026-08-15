const mongoose = require("mongoose");

const rescueAssignmentSchema = new mongoose.Schema(
    {
        volunteerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        volunteerName: {
            type: String,
            required: true,
            trim: true,
        },

        volunteerEmail: {
            type: String,
            required: true,
            trim: true,
            lowercase: true,
        },

        animalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Animal",
            default: null,
        },

        animalName: {
            type: String,
            trim: true,
            default: "",
        },

        animalType: {
            type: String,
            trim: true,
            default: "",
        },

        animalBreed: {
            type: String,
            trim: true,
            default: "",
        },

        animalImage: {
            type: String,
            trim: true,
            default: "",
        },

        assignmentType: {
            type: String,
            enum: [
                "rescue",
                "transport",
                "emergency",
                "follow_up",
                "other",
            ],
            default: "rescue",
        },

        title: {
            type: String,
            required: true,
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

        scheduledDate: {
            type: Date,
            required: true,
        },

        scheduledTime: {
            type: String,
            trim: true,
            default: "",
        },

        priority: {
            type: String,
            enum: [
                "low",
                "normal",
                "high",
                "urgent",
            ],
            default: "normal",
        },

        status: {
            type: String,
            enum: [
                "pending",
                "accepted",
                "declined",
                "active",
                "completed",
                "cancelled",
            ],
            default: "pending",
        },

        volunteerNotes: {
            type: String,
            trim: true,
            default: "",
        },

        completionNotes: {
            type: String,
            trim: true,
            default: "",
        },

        adminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        adminName: {
            type: String,
            trim: true,
            default: "",
        },

        adminEmail: {
            type: String,
            trim: true,
            lowercase: true,
            default: "",
        },

        acceptedAt: {
            type: Date,
            default: null,
        },

        startedAt: {
            type: Date,
            default: null,
        },

        completedAt: {
            type: Date,
            default: null,
        },

        cancelledAt: {
            type: Date,
            default: null,
        },

        declinedAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "RescueAssignment",
    rescueAssignmentSchema
);