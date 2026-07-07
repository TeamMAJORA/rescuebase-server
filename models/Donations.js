const mongoose = require("mongoose");

const DonationSchema = new mongoose.Schema(
    {
        donorName: {
            type: String,
            required: true,
            trim: true,
        },

        donorEmail: {
            type: String,
            trim: true,
            lowercase: true,
            default: "",
        },

        donationType: {
            type: String,
            enum: [
                "Money",
                "Dog Food",
                "Cat Food",
                "Medicine",
                "Medical Supplies",
                "Other Supplies",
                "Other",
            ],
            required: true,
        },

        amount: {
            type: Number,
            default: 0,
        },

        itemName: {
            type: String,
            trim: true,
            default: "",
        },

        quantity: {
            type: Number,
            default: 1,
        },

        notes: {
            type: String,
            trim: true,
            default: "",
        },

        status: {
            type: String,
            enum: ["pending", "received", "cancelled"],
            default: "pending",
        },

        receivedDate: {
            type: Date,
            default: null,
        },

        createdByName: {
            type: String,
            default: "Admin User",
        },

        createdByEmail: {
            type: String,
            default: "admin",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("Donation", DonationSchema);