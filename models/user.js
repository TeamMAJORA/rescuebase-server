const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        firebaseUid: {
            type: String,
            unique: true,
            sparse: true,
        },

        name: {
            type: String,
            default: "",
            trim: true,
        },

        username: {
            type: String,
            default: "",
            trim: true,
        },

        email: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            lowercase: true,
        },

        password: {
            type: String,
            default: "",
            select: false,
        },

        profileImage: {
            type: String,
            default: "",
        },

        provider: {
            type: String,
            enum: ["google", "local"],
            default: "google",
        },

        role: {
            type: String,
            enum: ["adopter", "foster", "volunteer", "staff", "admin"],
            default: "adopter",
        },

        status: {
            type: String,
            enum: ["active", "pending", "disabled"],
            default: "active",
        },

        verified: {
            type: Boolean,
            default: true,
        },

        emailOtp: {
            type: String,
            default: "",
            select: false,
        },

        emailOtpExpires: {
            type: Date,
            default: null,
            select: false,
        },

        emailOtpAttempts: {
            type: Number,
            default: 0,
            select: false,
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);