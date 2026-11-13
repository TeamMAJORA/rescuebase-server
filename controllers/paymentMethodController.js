
const PaymentMethod = require("../models/PaymentMethods");

const SUPPORTED_PAYMENT_METHOD_TYPES = ["GCash", "Maya", "Bank Account"];

function paymentMethodTypeError(methodType) {
    if (!SUPPORTED_PAYMENT_METHOD_TYPES.includes(methodType)) {
        return `Payment method must be one of: ${SUPPORTED_PAYMENT_METHOD_TYPES.join(", ")}.`;
    }
    return null;
}

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
    if (!["admin", "staff"].includes(req.user?.role)) {
        return res.status(403).json({
            success: false,
            message: "You are not authorized to create payment methods.",
        });
    }
    const {
        method_type,
        account_name,
        account_number,
        qr_image_url,
        instructions,
    } = req.body;

    if (
        !method_type ||
        !String(account_name || "").trim() ||
        !String(account_number || "").trim()
    ) {
        return res.status(400).json({
            success: false,
            message:
                "Method type, account name, and account number are required.",
        });
    }

    const typeError = paymentMethodTypeError(method_type);
    if (typeError) {
        return res.status(400).json({ success: false, message: typeError });
    }

    const paymentMethod =
        await PaymentMethod.create({
            method_type,
            account_name: String(account_name).trim(),
            account_number: String(account_number).trim(),
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

    if (updates.method_type !== undefined) {
        const typeError = paymentMethodTypeError(updates.method_type);
        if (typeError) {
            return res.status(400).json({ success: false, message: typeError });
        }
    }

    for (const field of ["account_name", "account_number"]) {
        if (updates[field] !== undefined) {
            updates[field] = String(updates[field]).trim();
            if (!updates[field]) {
                return res.status(400).json({
                    success: false,
                    message: "Account name and account number cannot be empty.",
                });
            }
        }
    }

    const paymentMethod =
        await PaymentMethod.findByIdAndUpdate(
            id,
            updates,
            {
                returnDocument: "after",
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