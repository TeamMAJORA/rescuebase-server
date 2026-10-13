
const jwt = require("jsonwebtoken");
const { getGlobalSettings } = require("../utils/globalSettings");

module.exports = async function verifyToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Authorization header is missing.",
            });
        }

        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Invalid authorization format.",
            });
        }

        const token = authHeader.slice(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Authentication token is missing.",
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is not configured.");

            return res.status(500).json({
                success: false,
                message: "Server configuration error.",
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET, {
            issuer: "RescueBase",
            audience: "rescuebase-client",
        });

        if (
            !decoded ||
            !decoded.id ||
            !decoded.email ||
            !decoded.role ||
            !decoded.iat
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication payload.",
            });
        }

        const settings = await getGlobalSettings();
        const timeoutMs =
            settings.security.sessionTimeoutMinutes * 60 * 1000;
        const issuedAtMs = decoded.iat * 1000;

        if (Date.now() >= issuedAtMs + timeoutMs) {
            return res.status(401).json({
                success: false,
                message: "Session has expired. Please log in again.",
            });
        }

        const role = String(decoded.role).trim().toLowerCase();

        if (!role) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication role.",
            });
        }

        req.user = {
            id: decoded.id,
            email: decoded.email,
            role,
        };

        return next();
    } catch (error) {
        if (
            error.name === "TokenExpiredError" ||
            error.message === "SESSION_EXPIRED"
        ) {
            return res.status(401).json({
                success: false,
                message: "Session has expired. Please log in again.",
            });
        }

        if (
            error.name === "JsonWebTokenError" ||
            error.name === "NotBeforeError"
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication token.",
            });
        }

        console.error("JWT verification error:", error);

        return res.status(500).json({
            success: false,
            message: "Authentication failed.",
        });
    }
};
