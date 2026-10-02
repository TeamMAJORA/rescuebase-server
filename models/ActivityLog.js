const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },

        activity: {
            type: String,
            required: true,
            trim: true,
        },

        activityType: {
            type: String,
            required: true,
            trim: true,
        },

        activityDate: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: false,
    }
);

module.exports = mongoose.model(
    "ActivityLog",
    activityLogSchema
);