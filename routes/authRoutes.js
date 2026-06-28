const express = require("express");
const { getAuth } = require("firebase-admin/auth");
const User = require("../models/User");

const router = express.Router();

async function verifyFirebaseToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "No token provided",
            });
        }

        const token = authHeader.split(" ")[1];

        const tokenPayload = JSON.parse(
            Buffer.from(token.split(".")[1], "base64url").toString()
        );

        const decodedToken = await getAuth().verifyIdToken(token);

        req.firebaseUser = decodedToken;
        next();
    } catch (error) {

        return res.status(401).json({
            success: false,
            message: "Invalid Google token",
            errorCode: error.code,
            errorMessage: error.message,
        });
    }
}

router.post("/google/signup", verifyFirebaseToken, async (req, res) => {
    try {
        console.log("Signup route reached");

        const firebaseUser = req.firebaseUser;

        const firebaseUid = firebaseUser.uid;
        const email = firebaseUser.email;
        const name = firebaseUser.name || "";
        const profileImage = firebaseUser.picture || "";

        console.log("Firebase user:", {
            firebaseUid,
            email,
            name,
        });

        const existingUser = await User.findOne({
            $or: [{ firebaseUid }, { email }],
        });

        console.log("Existing user:", existingUser);

        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: "Account already registered. Please log in.",
            });
        }

        const user = await User.create({
            firebaseUid,
            email,
            name,
            profileImage,
            provider: "google",
            role: "adopter",
            status: "active",
        });

        console.log("User saved to MongoDB:", user);

        return res.status(201).json({
            success: true,
            message: "Signup successful",
            user,
        });
    } catch (error) {
        console.error("Signup error FULL:", error);

        return res.status(500).json({
            success: false,
            message: "Signup failed",
            error: error.message,
        });
    }
});

router.post("/google/login", verifyFirebaseToken, async (req, res) => {
    try {
        const firebaseUser = req.firebaseUser;

        const firebaseUid = firebaseUser.uid;
        const email = firebaseUser.email;

        const user = await User.findOne({
            $or: [{ firebaseUid }, { email }],
        });

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "No associated account. Please sign up first.",
            });
        }

        if (user.status === "disabled") {
            return res.status(403).json({
                success: false,
                message: "This account has been disabled.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Login successful",
            user,
        });
    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            success: false,
            message: "Login failed",
        });
    }
});

module.exports = router;