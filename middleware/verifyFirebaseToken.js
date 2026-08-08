const { getAuth } = require("firebase-admin/auth");

module.exports = async function verifyFirebaseToken(req, res, next) {
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
                message: "Inavlid authorization format.",
            })
        }

        const token = authHeader.slice(7).trim();

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Firebase authentication token is missing."
            });
        }

        const decodedToken = await getAuth().verifyIdToken(token);

        req.firebaseUser = decodedToken;

        next();
    } catch (error) {
        console.error("Firebase token verification error:", error);
        return res.status(401).json({
            success: false,
            message: "Invalid or expired Firebase authentcation token.",
        });
    }
};