const GlobalSettings = require("../models/GlobalSettings");

const DEFAULT_SETTINGS = {
    general: {
        appName: "RESCUEBASE",
        contactEmail: "",
        contactPhone: "",
        timezone: "Asia/Manila",
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

async function getGlobalSettings() {
    const document = await GlobalSettings.findOneAndUpdate(
        { key: "global" },
        {
            $setOnInsert: {
                key: "global",
            },
        },
        {
            new: true,
            upsert: true,
            setDefaultsOnInsert: true,
            runValidators: true,
        }
    ).lean();

    return {
        ...DEFAULT_SETTINGS,

        general: {
            ...DEFAULT_SETTINGS.general,
            ...(document?.general || {}),
        },

        security: {
            ...DEFAULT_SETTINGS.security,
            ...(document?.security || {}),
        },

        notifications: {
            ...DEFAULT_SETTINGS.notifications,
            ...(document?.notifications || {}),
        },

        maintenance: {
            ...DEFAULT_SETTINGS.maintenance,
            ...(document?.maintenance || {}),
        },

        updatedAt: document?.updatedAt || null,
    };
}

async function isNotificationEnabled(category) {
    const settings = await getGlobalSettings();

    if (!settings.notifications.emailEnabled) {
        return false;
    }

    if (
        Object.prototype.hasOwnProperty.call(
            settings.notifications,
            category
        )
    ) {
        return settings.notifications[category] === true;
    }

    return true;
}

module.exports = {
    getGlobalSettings,
    isNotificationEnabled,
    DEFAULT_SETTINGS,
};