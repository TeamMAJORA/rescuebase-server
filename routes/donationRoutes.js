const express = require("express");
const router = express.Router();

const asyncHandler = require("../middleware/asyncHandler");
const verifyToken = require("../middleware/verifyToken");
const authoriseRoles = require("../middleware/authoriseRoles");
const validateRequest = require("../middleware/validateRequest");

const donationController = require("../controllers/donationController");


router.post(
    "/",
    verifyToken,
    authoriseRoles("admin", "foster", "adopter", "volunteer"),
    validateRequest([
        "donorName",
        "donationType",
    ]),
    asyncHandler(
        donationController.createDonation
    )
);


router.get(
    "/",
    asyncHandler(
        donationController.getAllDonations
    )
);


router.patch(
    "/:id",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        donationController.updateDonation
    )
);


router.delete(
    "/:id",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        donationController.deleteDonation
    )
);


module.exports = router;