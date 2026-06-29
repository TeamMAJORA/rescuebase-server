// RENAME IT TO LOGGER

const mongoose = require("mongoose");

const ledgerEntrySchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ["adoption", "donation", "foster", "animal", "system"],
            default: "system",
        },

        action: {
            type: String,
            required: true,
        },

        actorName: String,
        actorEmail: String,

        targetType: String,
        targetId: String,

        description: {
            type: String,
            required: true,
        },

        status: String,

        amount: {
            type: Number,
            default: 0,
        },

        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("LedgerEntry", ledgerEntrySchema);