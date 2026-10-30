
const express = require("express");
const router = express.Router();

const {
    getGlobalSettings,
    updateGlobalSettings,
} = require("../controllers/globalSettingsController");

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");
const { getGlobalSettings: getSettingsDocument } = require("../utils/globalSettings");

//for the maintenance status output
router.get("/status", asyncHandler(async (req, res) => {
    const settings = await getSettingsDocument();
    const maintenance = settings?.maintenance || {};

    res.set("Cache-Control", "no-store");

    return res.status(200).json({
        success: true,
        maintenance: {
            enabled: Boolean(maintenance.enabled),
            message: maintenance.enabled ? String(maintenance.message || "") : "",
        },
    });
}));

router.get("/contact", verifyToken, asyncHandler(async (req, res) => {
    const settings = await getSettingsDocument();
    const general = settings?.general || {};

    return res.status(200).json({
        success: true,
        contact: {
            name: general.appName || "RescueBase",
            email: general.contactEmail || "",
            phone: general.contactPhone || "",
        },
    });
}));

// Public (landing page and donation page): where to bring item donations
router.get("/drop-off", asyncHandler(async (req, res) => {
    const settings = await getSettingsDocument();
    const dropOff = settings?.donationDropOff || {};

    res.set("Cache-Control", "no-store");

    return res.status(200).json({
        success: true,
        dropOff: {
            enabled: Boolean(dropOff.enabled),
            city: dropOff.enabled ? String(dropOff.city || "") : "",
            address: dropOff.enabled ? String(dropOff.address || "") : "",
            contactPerson: dropOff.enabled ? String(dropOff.contactPerson || "") : "",
            contactNumber: dropOff.enabled ? String(dropOff.contactNumber || "") : "",
            operatingHours: dropOff.enabled ? String(dropOff.operatingHours || "") : "",
            instructions: dropOff.enabled ? String(dropOff.instructions || "") : "",
        },
    });
}));

// Shelter capacity for the dashboard (admin and staff)
router.get("/capacity", verifyToken, asyncHandler(async (req, res) => {
    const settings = await getSettingsDocument();
    const capacity = Number(settings?.general?.shelterCapacity) || 30;

    return res.status(200).json({ success: true, shelterCapacity: capacity });
}));

router.use(verifyToken);

router.use(authorizeRoles("admin"));

router.get("/", asyncHandler(getGlobalSettings));
router.patch("/", asyncHandler(updateGlobalSettings));

module.exports = router;
