const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");
const analyticsController = require("../controllers/analyticsController");

router.get(
    "/overview",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(analyticsController.getOverview)
);

module.exports = router;