const mongoose = require("mongoose");

const StockAdjustmentSchema = new mongoose.Schema(
    {
        action: {
            type: String,
            enum: ["add", "remove"],
            required: true,
        },
        quantity: {
            type: Number,
            required: true,
            min: 0.001,
        },
        previousStock: {
            type: Number,
            required: true,
            min: 0,
        },
        newStock: {
            type: Number,
            required: true,
            min: 0,
        },
        reason: {
            type: String,
            trim: true,
            default: "Manual adjustment",
        },
        note: {
            type: String,
            trim: true,
            default: "",
        },
        adjustedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
        adjustedAt: {
            type: Date,
            default: Date.now,
        },
    },
    { _id: true }
);

const FoodInventorySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
            unique: true,
        },
        quantityInStock: {
            type: Number,
            required: true,
            min: 0,
            default: 0,
        },
        unit: {
            type: String,
            enum: ["kg"],
            default: "kg",
        },
        foodRatePerAnimalPerDay: {
            type: Number,
            required: true,
            min: 0,
            default: 0.5,
        },
        forecastDays: {
            type: Number,
            required: true,
            min: 1,
            default: 30,
        },
        adjustmentHistory: {
            type: [StockAdjustmentSchema],
            default: [],
        },
    },
    { timestamps: true }
);

module.exports = mongoose.model("FoodInventory", FoodInventorySchema);