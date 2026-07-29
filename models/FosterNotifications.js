const mongoose = require("mongoose");

const FosterNotificationSchema = new mongoose.Schema(
    {
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true,
            index: true,
        },

        title: {
            type: String,
            required: true,
            trim: true,
        },

        message: {
            type: String,
            required: true,
            trim: true,
        },

        type: {
            type: String,
            enum: [
                "application",
                "assignment",
                "update",
                "reminder",
                "general",
            ],
            default: "general",
        },

        relatedId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },

        read: {
            type: Boolean,
            default: false,
        },

        readAt: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
        collection: "foster_notifications",
    }
);

module.exports = mongoose.model(
    "FosterNotification",
    FosterNotificationSchema
);