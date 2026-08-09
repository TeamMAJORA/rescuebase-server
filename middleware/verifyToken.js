const jwt = require("jsonwebtoken");

module.exports = function verifyToken(req, res, next) {
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

            console.error(
                "JWT_SECRET is not configured."
            );

            return res.status(500).json({
                success: false,
                message: "Server configuration error.",
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET,
            {
                issuer: "RescueBase",
                audience: "rescuebase-client",
            }
        );

        if (!decoded || !decoded.id || !decoded.email || !decoded.role) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication payload.",
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

        next();

    } catch (error) {

        console.error("JWT Verification Failed:", {
            name: error.name,
            message: error.message,
        });

        if (error.name === "TokenExpiredError") {
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

        console.error(
            "JWT Verification Error:",
            error
        );

        return res.status(500).json({
            success: false,
            message: "Authentication failed.",
        });
    }
};