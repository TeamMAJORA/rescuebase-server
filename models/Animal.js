const mongoose = require("mongoose");

const animalSchema = new mongoose.Schema({
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
        default: "Unknown"
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
        default: true,
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

    intakeDate: {
        type: Date,
        defaut: Date.now,
    },

    intakeCondition: {
        type: String,
        enum: ["Healthy", "Injured", "Sick", "Under Observation", "Unknown"],
        default: "Unknown",
    },

    availabilitySatus: {
        type: String,
        enum: ["available", "unavailable"],
        default: "available"
    },

    adoptionStatus: {
        type: String,
        enum: ["available", "pending", "adopted"],
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

    createdByName: {
        type: String,
        default: "Admin User",
    },

    createdByEmail: {
        type: String,
        default: "admin",
    },
},
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Animal", animalSchema);