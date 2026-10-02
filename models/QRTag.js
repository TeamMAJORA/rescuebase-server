const mongoose = require("mongoose");

const qrTagSchema = new mongoose.Schema(
    {
        animal: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Animal",
            required: true,
            unique: true,
        },

        tagCode: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },

        qrData: {
            type: String,
            required: true,
        },

        qrImageUrl: {
            type: String,
            required: true,
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.model("QRTag", qrTagSchema);