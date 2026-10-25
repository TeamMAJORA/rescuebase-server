
const mongoose = require("mongoose");
const GlobalSettings = require("../models/GlobalSettings");

const DEFAULT_SETTINGS = {
    general: {
        appName: "RESCUEBASE",
        contactEmail: "",
        contactPhone: "",
        timezone: "Asia/Manila",
        shelterCapacity: 30,
    },
    security: {
        maxLoginAttempts: 5,
        lockoutMinutes: 15,
        sessionTimeoutMinutes: 60,
        requireStrongPasswords: true,
    },
    notifications: {
        emailEnabled: true,
        adoptionUpdates: true,
        medicalAlerts: true,
        fosterUpdates: true,
        lostFoundAlerts: true,
        systemAlerts: true,
    },
    maintenance: {
        enabled: false,
        message:
            "RESCUEBASE is temporarily undergoing maintenance. Please try again later.",
        allowAdminAccess: true,
    },
};

const ALLOWED_FIELDS = {
    general: [
        "appName",
        "contactEmail",
        "contactPhone",
        "timezone",
        "shelterCapacity",
    ],
    security: [
        "maxLoginAttempts",
        "lockoutMinutes",
        "sessionTimeoutMinutes",
        "requireStrongPasswords",
    ],
    notifications: [
        "emailEnabled",
        "adoptionUpdates",
        "medicalAlerts",
        "fosterUpdates",
        "lostFoundAlerts",
        "systemAlerts",
    ],
    maintenance: [
        "enabled",
        "message",
        "allowAdminAccess",
    ],
};

function getAdminId(req) {
    const user = req.user;

    const id =
        user?._id ||
        user?.id ||
        user?.uid;

    return id && mongoose.isValidObjectId(id) ? id : null;
}

function validateSettingsPayload(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw Object.assign(
            new Error("A settings object is required."),
            { statusCode: 400 }
        );
    }

    const allowedCategories = Object.keys(ALLOWED_FIELDS);

    for (const category of Object.keys(body)) {
        if (!allowedCategories.includes(category)) {
            throw Object.assign(
                new Error(`Unknown settings category: ${category}`),
                { statusCode: 400 }
            );
        }

        const section = body[category];

        if (
            !section ||
            typeof section !== "object" ||
            Array.isArray(section)
        ) {
            throw Object.assign(
                new Error(`Invalid settings section: ${category}`),
                { statusCode: 400 }
            );
        }

        for (const field of Object.keys(section)) {
            if (!ALLOWED_FIELDS[category].includes(field)) {
                throw Object.assign(
                    new Error(`Unknown setting: ${category}.${field}`),
                    { statusCode: 400 }
                );
            }
        }
    }
}

function validateAndNormalize(body) {
    validateSettingsPayload(body);

    const normalized = {};

    const stringFields = {
        "general.appName": { max: 100 },
        "general.contactEmail": { max: 254 },
        "general.contactPhone": { max: 30 },
        "general.timezone": { max: 100 },
        "maintenance.message": { max: 500 },
    };

    const numberFields = {
        "general.shelterCapacity": { min: 1, max: 10000 },
        "security.maxLoginAttempts": { min: 1, max: 20 },
        "security.lockoutMinutes": { min: 1, max: 1440 },
        "security.sessionTimeoutMinutes": {
            min: 5,
            max: 10080,
        },
    };

    for (const [category, section] of Object.entries(body)) {
        normalized[category] = {};

        for (const [field, value] of Object.entries(section)) {
            const path = `${category}.${field}`;

            if (Object.hasOwn(stringFields, path)) {
                if (typeof value !== "string") {
                    throw Object.assign(
                        new Error(`${path} must be a string.`),
                        { statusCode: 400 }
                    );
                }

                const trimmed = value.trim();

                if (trimmed.length > stringFields[path].max) {
                    throw Object.assign(
                        new Error(`${path} is too long.`),
                        { statusCode: 400 }
                    );
                }

                if (path === "general.appName" && !trimmed) {
                    throw Object.assign(
                        new Error("Application name is required."),
                        { statusCode: 400 }
                    );
                }

                if (
                    path === "general.contactEmail" &&
                    trimmed &&
                    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
                ) {
                    throw Object.assign(
                        new Error("Enter a valid contact email."),
                        { statusCode: 400 }
                    );
                }

                if (
                    path === "general.timezone" &&
                    trimmed
                ) {
                    try {
                        new Intl.DateTimeFormat("en-US", {
                            timeZone: trimmed,
                        });
                    } catch {
                        throw Object.assign(
                            new Error("Enter a valid timezone."),
                            { statusCode: 400 }
                        );
                    }
                }

                normalized[category][field] = trimmed;
                continue;
            }

            if (Object.hasOwn(numberFields, path)) {
                const rules = numberFields[path];

                if (
                    typeof value !== "number" ||
                    !Number.isInteger(value) ||
                    value < rules.min ||
                    value > rules.max
                ) {
                    throw Object.assign(
                        new Error(
                            `${path} must be an integer between ${rules.min} and ${rules.max}.`
                        ),
                        { statusCode: 400 }
                    );
                }

                normalized[category][field] = value;
                continue;
            }

            if (typeof value !== "boolean") {
                throw Object.assign(
                    new Error(`${path} must be true or false.`),
                    { statusCode: 400 }
                );
            }

            normalized[category][field] = value;
        }
    }

    return normalized;
}

async function getOrCreateSettings() {
    return GlobalSettings.findOneAndUpdate(
        { key: "global" },
        { $setOnInsert: { key: "global" } },
        {
            returnDocument: "after",
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true,
        }
    ).lean();
}

exports.getGlobalSettings = async (req, res) => {
    const settings = await getOrCreateSettings();

    res.status(200).json({
        success: true,
        settings: {
            ...DEFAULT_SETTINGS,
            general: {
                ...DEFAULT_SETTINGS.general,
                ...(settings.general || {}),
            },
            security: {
                ...DEFAULT_SETTINGS.security,
                ...(settings.security || {}),
            },
            notifications: {
                ...DEFAULT_SETTINGS.notifications,
                ...(settings.notifications || {}),
            },
            maintenance: {
                ...DEFAULT_SETTINGS.maintenance,
                ...(settings.maintenance || {}),
            },
            updatedAt: settings.updatedAt,
        },
    });
};

exports.updateGlobalSettings = async (req, res) => {
    const updates = validateAndNormalize(req.body);
    const adminId = getAdminId(req);

    const setFields = {};

    for (const [category, section] of Object.entries(updates)) {
        for (const [field, value] of Object.entries(section)) {
            setFields[`${category}.${field}`] = value;
        }
    }

    if (adminId) {
        setFields.updatedBy = adminId;
    }

    const settings = await GlobalSettings.findOneAndUpdate(
        { key: "global" },
        {
            $set: setFields,
            $setOnInsert: { key: "global" },
        },
        {
            returnDocument: "after",
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true,
        }
    ).lean();

    res.status(200).json({
        success: true,
        message: "Global settings saved successfully.",
        settings: {
            ...DEFAULT_SETTINGS,
            general: {
                ...DEFAULT_SETTINGS.general,
                ...(settings.general || {}),
            },
            security: {
                ...DEFAULT_SETTINGS.security,
                ...(settings.security || {}),
            },
            notifications: {
                ...DEFAULT_SETTINGS.notifications,
                ...(settings.notifications || {}),
            },
            maintenance: {
                ...DEFAULT_SETTINGS.maintenance,
                ...(settings.maintenance || {}),
            },
            updatedAt: settings.updatedAt,
        },
    });
};
