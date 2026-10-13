
const express = require("express");
const router = express.Router();

const {
    getGlobalSettings,
    updateGlobalSettings,
} = require("../controllers/globalSettingsController");

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

router.use(verifyToken);
router.use(authorizeRoles("admin"));

router.get("/", asyncHandler(getGlobalSettings));
router.patch("/", asyncHandler(updateGlobalSettings));

module.exports = router;
