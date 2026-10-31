
const express = require("express");

const router = express.Router();
const paymentMethodController = require("../controllers/paymentMethodController");
const asyncHandler = require("../middleware/asyncHandler");
const verifyToken = require("../middleware/verifyToken");
const authoriseRoles = require("../middleware/authoriseRoles");

// Public (landing page): active payment methods, same as the Donation page. No creator details.
const PaymentMethod = require("../models/PaymentMethods");

router.get(
    "/public",
    asyncHandler(async (req, res) => {
        const methods = await PaymentMethod.find({ is_active: true })
            .select("method_type account_name account_number qr_image_url instructions")
            .sort({ createdAt: 1 })
            .lean();

        res.set("Cache-Control", "no-store");
        return res.status(200).json({ success: true, methods });
    })
);

router.get(
    "/",
    verifyToken,
    authoriseRoles("admin", "staff", "adopter", "foster"),
    asyncHandler(
        paymentMethodController.getPaymentMethods
    )
);

router.get(
    "/all",
    verifyToken,
    authoriseRoles("admin", "staff", "adopter", "foster"),
    asyncHandler(
        paymentMethodController.getAllPaymentMethods
    )
);

router.post(
    "/",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        paymentMethodController.createPaymentMethod
    )
);

router.patch(
    "/:id",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        paymentMethodController.updatePaymentMethod
    )
);

router.delete(
    "/:id",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        paymentMethodController.deletePaymentMethod
    )
);

module.exports = router;