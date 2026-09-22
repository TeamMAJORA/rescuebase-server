
const express = require("express");

const router = express.Router();
const paymentMethodController = require("../controllers/paymentMethodController");
const asyncHandler = require("../middleware/asyncHandler");
const verifyToken = require("../middleware/verifyToken");
const authoriseRoles = require("../middleware/authoriseRoles");

router.get(
    "/",
    verifyToken,
    authoriseRoles("admin", "staff","adopter"),
    asyncHandler(
        paymentMethodController.getPaymentMethods
    )
);

router.get(
    "/all",
    verifyToken,
    authoriseRoles("admin", "staff", "adopter"),
    asyncHandler(
        paymentMethodController.getAllPaymentMethods
    )
);

router.post(
    "/",
    verifyToken,
    authoriseRoles("admin", "staff", "adopter"),
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