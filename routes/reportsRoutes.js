
const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");
const reportsController = require("../controllers/reportsController");

// Generate a complete shelter report with CSV datasets.
router.post(
    "/generate",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(reportsController.generateReport)
);

// Create a regular report.
router.post(
    "/",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(reportsController.createReport)
);

// List reports.
router.get(
    "/",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(reportsController.getAllReports)
);

// Finalize a report.
router.patch(
    "/:id/finalize",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(reportsController.finalizeReport)
);

// Download a report.
router.get(
    "/:id/download",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(reportsController.downloadReport)
);

// Delete a report.
router.delete(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(reportsController.deleteReport)
);

module.exports = router;
