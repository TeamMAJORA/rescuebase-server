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
                "Pet Food",
            ],
            required: true,
        },

        amount: {
            type: Number,
            default: 0,
            min: 0,
        },

        itemName: {
            type: String,
            trim: true,
            default: "",
        },

        quantity: {
            type: Number,
            default: 1,
            min: 1,
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

        paymentMethod: {
            type: String,
            trim: true,
            default: "",
        },

        paymentStatus: {
            type: String,
            enum: [
                "not_required",
                "pending",
                "verified",
                "rejected",
            ],
            default: "not_required",
        },

        paymentReference: {
            type: String,
            trim: true,
            default: "",
        },

        proofOfPayment: {
            type: String,
            trim: true,
            default: "",
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

        neededSupplyId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "NeededSupply",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.models.Donation || mongoose.model("Donation", DonationSchema);