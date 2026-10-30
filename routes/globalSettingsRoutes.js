
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

// Donations page (admin and staff): read and save only the drop-off details
const GlobalSettingsModel = require("../models/GlobalSettings");
const DROP_OFF_LIMITS = {
    address: 500,
    contactPerson: 150,
    contactNumber: 30,
    operatingHours: 150,
    instructions: 1000,
};

function dropOffOf(settings) {
    const dropOff = settings?.donationDropOff || {};
    return {
        enabled: Boolean(dropOff.enabled),
        address: String(dropOff.address || ""),
        contactPerson: String(dropOff.contactPerson || ""),
        contactNumber: String(dropOff.contactNumber || ""),
        operatingHours: String(dropOff.operatingHours || ""),
        instructions: String(dropOff.instructions || ""),
    };
}

router.get("/drop-off/manage", verifyToken, authorizeRoles("admin", "staff"), asyncHandler(async (req, res) => {
    const settings = await getSettingsDocument();
    return res.status(200).json({ success: true, dropOff: dropOffOf(settings) });
}));

router.patch("/drop-off", verifyToken, authorizeRoles("admin", "staff"), asyncHandler(async (req, res) => {
    const body = req.body || {};
    const update = { "donationDropOff.enabled": Boolean(body.enabled) };

    for (const [field, max] of Object.entries(DROP_OFF_LIMITS)) {
        const value = String(body[field] ?? "").trim();

        if (value.length > max) {
            return res.status(400).json({ success: false, message: `${field} is too long (max ${max}).` });
        }

        update[`donationDropOff.${field}`] = value;
    }

    const contactNumber = update["donationDropOff.contactNumber"];

    if (contactNumber && !/^09\d{9}$/.test(contactNumber)) {
        return res.status(400).json({
            success: false,
            message: "Contact number must be an 11-digit mobile number starting with 09.",
        });
    }

    if (update["donationDropOff.enabled"] && !update["donationDropOff.address"]) {
        return res.status(400).json({ success: false, message: "Add an address before showing the drop-off details." });
    }

    const settings = await GlobalSettingsModel.findOneAndUpdate(
        { key: "global" },
        { $set: update, $setOnInsert: { key: "global" } },
        { upsert: true, returnDocument: "after", runValidators: true }
    ).lean();

    return res.status(200).json({ success: true, message: "Drop-off details saved.", dropOff: dropOffOf(settings) });
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
