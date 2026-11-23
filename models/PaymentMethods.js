
const mongoose = require("mongoose");

const PaymentMethodSchema = new mongoose.Schema(
    {
        // GCash, Maya, Bank Account, or a name the shelter typed (e.g. PayPal)
        method_type: {
            type: String,
            required: true,
            trim: true,
            maxlength: 40,
        },

        account_name: {
            type: String,
            required: true,
            trim: true,
        },

        account_number: {
            type: String,
            required: true,
            trim: true,
        },

        qr_image_url: {
            type: String,
            default: "",
            trim: true,
        },

        instructions: {
            type: String,
            default: "",
            trim: true,
        },

        is_test: {
            type: Boolean,
            default: true,
        },

        is_active: {
            type: Boolean,
            default: true,
        },

        createdByName: {
            type: String,
            default: "",
        },

        createdByEmail: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

module.exports = mongoose.models.PaymentMethod || mongoose.model("PaymentMethod", PaymentMethodSchema);