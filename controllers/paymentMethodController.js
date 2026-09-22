
const PaymentMethod = require("../models/PaymentMethods");

exports.getPaymentMethods = async (req, res) => {
    const methods = await PaymentMethod.find({
        is_active: true,
    }).sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        methods,
    });
};

exports.getAllPaymentMethods = async (req, res) => {
    const methods = await PaymentMethod.find()
        .sort({ createdAt: -1 });

    res.status(200).json({
        success: true,
        methods,
    });
};

exports.createPaymentMethod = async (req, res) => {
    const {
        method_type,
        account_name,
        account_number,
        qr_image_url,
        instructions,
    } = req.body;

    if (
        !method_type ||
        !account_name ||
        !account_number
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Method type, account name, and account number are required.",
        });
    }

    const paymentMethod =
        await PaymentMethod.create({
            method_type,
            account_name,
            account_number,
            qr_image_url: qr_image_url || "",
            instructions: instructions || "",
            is_test: true,
            is_active: true,
            createdByName:
                req.user?.name ||
                req.user?.username ||
                "Admin User",
            createdByEmail:
                req.user?.email || "",
        });

    res.status(201).json({
        success: true,
        message:
            "Test payment method created successfully.",
        method: paymentMethod,
    });
};

exports.updatePaymentMethod = async (req, res) => {
    const { id } = req.params;

    const allowedFields = [
        "method_type",
        "account_name",
        "account_number",
        "qr_image_url",
        "instructions",
        "is_active",
    ];

    const updates = {};

    allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    });

    const paymentMethod =
        await PaymentMethod.findByIdAndUpdate(
            id,
            updates,
            {
                new: true,
                runValidators: true,
            }
        );

    if (!paymentMethod) {
        return res.status(404).json({
            success: false,
            message: "Payment method not found.",
        });
    }

    res.status(200).json({
        success: true,
        message:
            "Payment method updated successfully.",
        method: paymentMethod,
    });
};

exports.deletePaymentMethod = async (req, res) => {
    const { id } = req.params;

    const paymentMethod =
        await PaymentMethod.findByIdAndDelete(id);

    if (!paymentMethod) {
        return res.status(404).json({
            success: false,
            message: "Payment method not found.",
        });
    }

    res.status(200).json({
        success: true,
        message:
            "Payment method deleted successfully.",
    });
};