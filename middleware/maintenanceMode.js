
const jwt = require("jsonwebtoken");
const { getGlobalSettings } = require("../utils/globalSettings");

const EXEMPT_PATHS = new Set([
    "/",
    "/api/settings",
]);

module.exports = async function maintenanceMode(req, res, next) {
    try {
        if (req.method === "OPTIONS" || EXEMPT_PATHS.has(req.path)) {
            return next();
        }

        const settings = await getGlobalSettings();
        const maintenance = settings.maintenance;

        if (!maintenance.enabled) {
            return next();
        }

        let role = "";

        const authorization = req.headers.authorization || "";

        if (
            maintenance.allowAdminAccess &&
            authorization.startsWith("Bearer ") &&
            process.env.JWT_SECRET
        ) {
            try {
                const token = authorization.slice(7).trim();

                const decoded = jwt.verify(token, process.env.JWT_SECRET, {
                    issuer: "RescueBase",
                    audience: "rescuebase-client",
                });

                role = String(decoded.role || "").trim().toLowerCase();
            } catch {
                // Invalid or expired tokens do not grant maintenance access.
            }
        }

        if (role === "admin") {
            return next();
        }

        return res.status(503).json({
            success: false,
            maintenance: true,
            message: maintenance.message,
        });
    } catch (error) {
        console.error("Maintenance middleware error:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to verify application availability.",
        });
    }
};
