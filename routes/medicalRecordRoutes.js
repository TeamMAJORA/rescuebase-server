const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const controller = require("../controllers/medicalRecordController");

// Admin and staff can view, add and edit
router.get("/", verifyToken, authorizeRoles("admin", "staff"), asyncHandler(controller.getMedicalRecords));
router.post("/", verifyToken, authorizeRoles("admin", "staff"), asyncHandler(controller.createMedicalRecord));
router.patch("/:id", verifyToken, authorizeRoles("admin", "staff"), asyncHandler(controller.updateMedicalRecord));

// Only admin can delete!!!
router.delete("/:id", verifyToken, authorizeRoles("admin"), asyncHandler(controller.deleteMedicalRecord));

module.exports = router;