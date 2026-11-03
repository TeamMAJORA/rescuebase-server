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

        // Which update emails the user wants (in-app notifications always show).
        // Security emails (login codes, password resets) ignore these.
        emailPrefs: {
            adoption: { type: Boolean, default: true },
            petAvailable: { type: Boolean, default: true },
            foster: { type: Boolean, default: true },
            lostFound: { type: Boolean, default: true },
            donation: { type: Boolean, default: true },
            rescue: { type: Boolean, default: true },
            feedback: { type: Boolean, default: true },
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

        roleApplication: {
            targetRole: {
                type: String,
                enum: ["adopter", "volunteer", "foster", "staff", "admin"],
                default: null,
            },

            status: {
                type: String,
                enum: ["none", "pending", "approved", "rejected"],
                default: "none",
            },

            reason: {
                type: String,
                default: "",
                trim: true,
            },

            rejectionReason: {
                type: String,
                default: "",
                trim: true,
            },

            submittedAt: {
                type: Date,
                default: null,
            },

            reviewedAt: {
                type: Date,
                default: null,
            },

            reviewedBy: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "User",
                default: null,
            },
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

        loginOtp: {
            type: String,
            default: "",
            select: false,
        },

        loginOtpExpires: {
            type: Date,
            default: null,
            select: false,
        },

        loginOtpAttempts: {
            type: Number,
            default: 0,
            select: false,
        },

        loginOtpLockedUntil: {
            type: Date,
            default: null,
            select: false,
        },

        passwordResetToken: {
            type: String,
            default: "",
            select: false,
        },

        passwordResetExpires: {
            type: Date,
            default: null,
            select: false,
        },

        passwordLoginAttempts: {
            type: Number,
            default: 0,
            select: false,
        },

        passwordLoginLockedUntil: {
            type: Date,
            default: null,
            select: false,
        },

    },
    { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);