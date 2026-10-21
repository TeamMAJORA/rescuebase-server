const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const controller = require("../controllers/animalTransferController");

// Admin and staff can view, add and edit
router.get("/", verifyToken, authorizeRoles("admin", "staff"), asyncHandler(controller.getTransfers));
router.post("/", verifyToken, authorizeRoles("admin", "staff"), asyncHandler(controller.createTransfer));
router.patch("/:id", verifyToken, authorizeRoles("admin", "staff"), asyncHandler(controller.updateTransfer));

// Only admin can delete!!!
router.delete("/:id", verifyToken, authorizeRoles("admin"), asyncHandler(controller.deleteTransfer));

module.exports = router;