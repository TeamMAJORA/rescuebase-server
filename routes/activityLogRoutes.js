const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");
const activityLogController = require("../controllers/activityLogController");

router.get(
    "/",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        activityLogController.getActivityLogs
    )
);

module.exports = router;