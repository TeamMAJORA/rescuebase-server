const mongoose = require("mongoose");

const lostFoundMatchSchema = new mongoose.Schema(
    {
        reportA: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LostFoundReport",
            required: true,
        },

        reportB: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LostFoundReport",
            required: true,
        },

        pairKey: {
            type: String,
            required: true,
            unique: true,
        },

        score: {
            type: Number,
            required: true,
            min: 0,
            max: 100,
        },

        factors: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },

        status: {
            type: String,
            enum: [
                "suggested",
                "confirmed",
                "not_a_match",
            ],
            default: "suggested",
        },

        suggestedBy: {
            type: String,
            default: "system",
        },

        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },

        reviewedAt: {
            type: Date,
            default: null,
        },

        reviewNotes: {
            type: String,
            default: "",
            trim: true,
        },
    },
    {
        timestamps: true,
    }
);

lostFoundMatchSchema.index({
    status: 1,
    score: -1,
});

lostFoundMatchSchema.index({
    reportA: 1,
    status: 1,
});

lostFoundMatchSchema.index({
    reportB: 1,
    status: 1,
});

module.exports = mongoose.model(
    "LostFoundMatch",
    lostFoundMatchSchema
);