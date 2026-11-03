const mongoose = require("mongoose");

const animalTransferSchema = new mongoose.Schema(
    {
        animal_id: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Animal",
            required: true,
        },

        from_location: {
            type: String,
            required: true,
            trim: true,
        },

        to_location: {
            type: String,
            required: true,
            trim: true,
        },

        transfer_date: {
            type: Date,
            required: true,
        },

        reason: {
            type: String,
            required: true,
            trim: true,
        },

        status: {
            type: String,
            enum: ["Pending", "In Transit", "Completed", "Cancelled"],
            default: "Pending",
        },

        recorded_by: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("AnimalTransfer", animalTransferSchema);