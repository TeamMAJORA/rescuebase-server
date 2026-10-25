const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const foodInventoryController = require("../controllers/foodInventoryController");

router.use(verifyToken);
router.use(authorizeRoles("admin", "staff"));

router.get(
    "/",
    asyncHandler(foodInventoryController.getInventory)
);

router.post(
    "/",
    asyncHandler(foodInventoryController.createInventory)
);

router.patch(
    "/:id",
    asyncHandler(foodInventoryController.updateInventory)
);

router.post(
    "/:id/adjust",
    asyncHandler(foodInventoryController.adjustStock)
);

router.get(
    "/:id/history",
    asyncHandler(foodInventoryController.getAdjustmentHistory)
);

module.exports = router;