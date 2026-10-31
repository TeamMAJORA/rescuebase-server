const mongoose = require("mongoose");

const NeededSupplySchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true,
        },

        category: {
            type: String,
            enum: [
                "Pet Food",
                "Medicine",
                "Medical Supplies",
                "Cleaning Supplies",
                "Blankets & Bedding",
                "Pet Toys",
                "Pet Accessories",
                "Feeding Supplies",
                "Other",
            ],
            required: true,
        },

        quantityNeeded: {
            type: Number,
            required: true,
            min: 1,
        },

        quantityReceived: {
            type: Number,
            default: 0,
            min: 0,
        },

        priority: {
            type: String,
            enum: [
                "Low",
                "Medium",
                "High",
                "Urgent",
            ],
            default: "Medium",
        },

        description: {
            type: String,
            trim: true,
            default: "",
        },

        status: {
            type: String,
            enum: [
                "active",
                "fulfilled",
                "inactive",
            ],
            default: "active",
        },

        //to request more food from Food Storage
        foodInventoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "FoodInventory",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model(
    "NeededSupply",
    NeededSupplySchema
);