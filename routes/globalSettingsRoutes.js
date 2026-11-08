
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
            name: general.shelterName || "RescueBase Shelter",
            email: general.contactEmail || "",
            phone: general.contactPhone || "",
            facebook: general.facebookUrl || "",
        },
    });
}));

// Public (landing page footer): the shelter's Facebook page
router.get("/social", asyncHandler(async (req, res) => {
    const settings = await getSettingsDocument();

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
        success: true,
        facebook: settings?.general?.facebookUrl || "",
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
            latitude: dropOff.enabled ? dropOff.latitude ?? null : null,
            longitude: dropOff.enabled ? dropOff.longitude ?? null : null,
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
        latitude: dropOff.latitude ?? null,
        longitude: dropOff.longitude ?? null,
    };
}

// The pin must be inside the Philippines; empty clears it
const PHILIPPINES_BOUNDS = { minLatitude: 4, maxLatitude: 22, minLongitude: 116, maxLongitude: 127 };

function readDropOffPin(body) {
    const hasLatitude = body.latitude !== undefined && body.latitude !== null && body.latitude !== "";
    const hasLongitude = body.longitude !== undefined && body.longitude !== null && body.longitude !== "";

    if (!hasLatitude && !hasLongitude) return { latitude: null, longitude: null };

    const latitude = Number(body.latitude);
    const longitude = Number(body.longitude);
    const insidePhilippines =
        hasLatitude && hasLongitude &&
        latitude >= PHILIPPINES_BOUNDS.minLatitude && latitude <= PHILIPPINES_BOUNDS.maxLatitude &&
        longitude >= PHILIPPINES_BOUNDS.minLongitude && longitude <= PHILIPPINES_BOUNDS.maxLongitude;

    return insidePhilippines ? { latitude, longitude } : null;
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

    const pin = readDropOffPin(body);

    if (!pin) {
        return res.status(400).json({ success: false, message: "The map pin must be a spot in the Philippines." });
    }

    update["donationDropOff.latitude"] = pin.latitude;
    update["donationDropOff.longitude"] = pin.longitude;

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

    return res.status(200).json({
        success: true,
        shelterCapacity: capacity,
        shelterName: settings?.general?.shelterName || "RescueBase Shelter",
    });
}));

router.use(verifyToken);

router.use(authorizeRoles("admin"));

router.get("/", asyncHandler(getGlobalSettings));
router.patch("/", asyncHandler(updateGlobalSettings));

module.exports = router;
