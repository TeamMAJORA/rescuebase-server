const jwt = require("jsonwebtoken");

module.exports = function verifyToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if(!authHeader) {
            return res.status(401).json({
                success : false,
                message : "Authorization header is missing",
            });
        }

        if(!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success : false,
                message : "Invalid authorization format."
            });
        }

        const token = authHeader.split(" ")[1];

        if (!token) {
            return res.status(401).json({
                success : false,
                message : "Authentication token is missing.",
            })
        }

        const decoded = jwt.verify(
            token, process.env.JWT_SECRET
        );

        req.user = {
            id : decoded.id,
            email : decoded.email,
            role : String(decoded.role).toLowerCase(),
        };

        next();
    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(401).json({
                success : false,
                message : "Session has expired. Please log in again.",
            });
        }

        if (error.name === "JsonWebTokenError") {
            return res.status(401).json({
                success : false,
                message : "Invalid authentication token.",
            });
        }

        console.error("JWT Verification Error: ", error);

        return res.status(500).json({
            success : false,
            message : "Authentication failed."
        });
    }
};