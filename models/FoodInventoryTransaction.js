const mongoose = require("mongoose");

const foodInventoryTransactionSchema = new mongoose.Schema(
    {
        inventoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "FoodInventory",
            required: true,
            index: true,
        },

        foodName: {
            type: String,
            required: true,
            trim: true,
        },

        transactionType: {
            type: String,
            enum: ["addition", "deduction", "adjustment"],
            required: true,
        },

        quantityChange: {
            type: Number,
            required: true,
        },

        previousStock: {
            type: Number,
            required: true,
            min: 0,
        },

        resultingStock: {
            type: Number,
            required: true,
            min: 0,
        },

        unit: {
            type: String,
            default: "kg",
        },

        reason: {
            type: String,
            required: true,
            trim: true,
        },

        notes: {
            type: String,
            trim: true,
            default: "",
        },

        actorId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },

        actorName: {
            type: String,
            default: "Unknown",
        },

        actorEmail: {
            type: String,
            default: "",
        },

        ledgerEntryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "LedgerEntry",
            default: null,
        },
    },
    { timestamps: true }
);

foodInventoryTransactionSchema.index({ createdAt: -1 });

module.exports = mongoose.model(
    "FoodInventoryTransaction",
    foodInventoryTransactionSchema
);