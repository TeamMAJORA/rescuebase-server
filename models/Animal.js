const mongoose = require("mongoose");

const animalSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        type: {
            type: String,
            enum: ["Dog", "Cat", "Other"],
            required: true,
        },

        breed: {
            type: String,
            default: "",
            trim: true,
        },

        age: {
            type: Number,
            default: 0,
        },

        gender: {
            type: String,
            enum: ["Male", "Female", "Unknown"],
            default: "Unknown",
        },

        size: {
            type: String,
            enum: ["Small", "Medium", "Large", "Unknown"],
            default: "Unknown",
        },

        color: {
            type: String,
            default: "",
            trim: true,
        },

        image: {
            type: String,
            default: "",
        },

        description: {
            type: String,
            default: "",
            trim: true,
        },

        medicalStatus: {
            type: String,
            default: "",
            trim: true,
        },

        behaviorNotes: {
            type: String,
            default: "",
            trim: true,
        },

        energyLevel: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        friendliness: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        humanSociability: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        animalSociability: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        trainability: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        anxietyLevel: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        aggressionLevel: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        activityLevel: {
            type: Number,
            enum: [1, 2, 3, 4, 5, null],
            default: null,
        },

        intakeDate: {
            type: Date,
            default: Date.now,
        },

        intakeCondition: {
            type: String,
            enum: ["Healthy", "Injured", "Sick", "Under Observation", "Unknown"],
            default: "Unknown",
        },

        availabilityStatus: {
            type: String,
            enum: ["available", "unavailable"],
            default: "available",
        },

        adoptionStatus: {
            type: String,
            enum: ["available", "pending", "adopted"],
            default: "available",
        },

        fosterStatus: {
            type: String,
            enum: ["none", "in_foster", "completed"],
            default: "none",
        },

        location: {
            type: String,
            default: "RescueBase Shelter",
            trim: true,
        },

        latitude: {
            type: Number,
            default: null,
        },

        longitude: {
            type: Number,
            default: null,
        },

        createdByName: {
            type: String,
            default: "Admin User",
        },

        createdByEmail: {
            type: String,
            default: "admin",
        },

        intakeStatus: {
            type: String,
            enum: ["pending", "approved", "rejected"],
            default: "pending",
        },

        intakeType: {
            type: String,
            enum: [
                "Rescued",
                "Owner Surrender",
                "Transferred",
                "Stray",
            ],
            default: "Rescued",
        },

        rescuedBy: {
            type: String,
            default: "",
            trim: true,
        },

        rejectionReason: {
            type: String,
            default: "",
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Animal", animalSchema);