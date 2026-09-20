const express = require("express");

const router = express.Router();

const asyncHandler = require("../middleware/asyncHandler");
const verifyToken = require("../middleware/verifyToken");
const authoriseRoles = require("../middleware/authoriseRoles");

const neededSupplyController = require(
    "../controllers/neededSupplyController"
);

router.get(
    "/",
    verifyToken,
    authoriseRoles("admin", "staff", "foster", "adopter", "volunteer"),
    asyncHandler(
        neededSupplyController.getAllSupplies
    )
);

router.post(
    "/",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        neededSupplyController.createSupply
    )
);

router.patch(
    "/:id",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        neededSupplyController.updateSupply
    )
);

router.delete(
    "/:id",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        neededSupplyController.deleteSupply
    )
);

module.exports = router;