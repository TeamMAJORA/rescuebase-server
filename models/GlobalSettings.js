const mongoose = require("mongoose");

const globalSettingsSchema = new mongoose.Schema(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            default: "global",
            immutable: true,
        },

        general: {
            appName: {
                type: String,
                default: "RESCUEBASE",
                trim: true,
                maxlength: 100,
            },
            contactEmail: {
                type: String,
                default: "",
                trim: true,
                maxlength: 254,
            },
            contactPhone: {
                type: String,
                default: "",
                trim: true,
                maxlength: 30,
            },
            timezone: {
                type: String,
                default: "Asia/Manila",
                trim: true,
                maxlength: 100,
            },
            // How many animals the shelter can hold (dashboard "Space used")
            shelterCapacity: {
                type: Number,
                default: 30,
                min: 1,
                max: 10000,
            },
        },

        security: {
            maxLoginAttempts: {
                type: Number,
                default: 5,
                min: 1,
                max: 20,
            },
            lockoutMinutes: {
                type: Number,
                default: 15,
                min: 1,
                max: 1440,
            },
            sessionTimeoutMinutes: {
                type: Number,
                default: 60,
                min: 5,
                max: 10080,
            },
            requireStrongPasswords: {
                type: Boolean,
                default: true,
            },
        },

        notifications: {
            emailEnabled: {
                type: Boolean,
                default: true,
            },
            adoptionUpdates: {
                type: Boolean,
                default: true,
            },
            medicalAlerts: {
                type: Boolean,
                default: true,
            },
            fosterUpdates: {
                type: Boolean,
                default: true,
            },
            lostFoundAlerts: {
                type: Boolean,
                default: true,
            },
            systemAlerts: {
                type: Boolean,
                default: true,
            },
        },

        maintenance: {
            enabled: {
                type: Boolean,
                default: false,
            },
            message: {
                type: String,
                default:
                    "RESCUEBASE is temporarily undergoing maintenance. Please try again later.",
                maxlength: 500,
            },
            allowAdminAccess: {
                type: Boolean,
                default: true,
            },
        },

        updatedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
        minimize: false,
    }
);

module.exports = mongoose.model(
    "GlobalSettings",
    globalSettingsSchema
);