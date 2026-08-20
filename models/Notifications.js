const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
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
                "general",
                "application_update",
                "adoption_update",
                "vaccination",
                "donation",
                "foster_update",
                "pet_available",
                "interview",
                "rescue_update",
                "donation_update",
            ],
            default: "general",
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
    }
);

module.exports = mongoose.model(
    "Notification",
    notificationSchema
);