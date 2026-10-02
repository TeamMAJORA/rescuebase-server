const mongoose = require("mongoose");

const ShelterSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        address: {
            type: String,
            required: true,
            trim: true,
        },

        latitude: {
            type: Number,
            required: true,
            min: -90,
            max: 90,
        },

        longitude: {
            type: Number,
            required: true,
            min: -180,
            max: 180,
        },

        contact: {
            type: String,
            default: "",
            trim: true,
        },

        email: {
            type: String,
            default: "",
            trim: true,
            lowercase: true,
        },

        description: {
            type: String,
            default: "",
            trim: true,
        },

        status: {
            type: String,
            enum: [
                "active",
                "inactive",
            ],
            default: "active",
            lowercase: true,
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

module.exports =
    mongoose.model(
        "Shelter",
        ShelterSchema
    );