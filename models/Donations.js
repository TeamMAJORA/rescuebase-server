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
            // Every category on the donation form (and older ones still in the data)
            enum: [
                "Money",
                "Pet Food",
                "Dog Food",
                "Cat Food",
                "Medicine",
                "Medical Supplies",
                "Blankets & Bedding",
                "Cleaning Supplies",
                "Pet Toys",
                "Pet Accessories",
                "Feeding Bowls",
                "Leashes & Collars",
                "Other Supplies",
                "Other",
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

        // "cancelled" is shown as "Not received": the donation never reached the shelter
        status: {
            type: String,
            enum: ["pending", "received", "cancelled"],
            default: "pending",
        },

        // Why staff marked it not received (shown to the donor)
        notReceivedReason: {
            type: String,
            trim: true,
            maxlength: 300,
            default: "",
        },

        notReceivedByName: {
            type: String,
            trim: true,
            default: "",
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

        // Photo of the donated items (in-kind), uploaded by the donor
        itemPhotoUrl: {
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

        // Set when a Received donation is "deleted": it is hidden from the ledger list
        // but still counts in every total (donation counts, money, supply totals).
        hiddenFromLedgerAt: {
            type: Date,
            default: null,
        },

        hiddenFromLedgerBy: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.models.Donation || mongoose.model("Donation", DonationSchema);