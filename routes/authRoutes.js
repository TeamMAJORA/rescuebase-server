const express = require("express");
const router = express.Router();
const { getAuth } = require("firebase-admin/auth");
const User = require("../models/User");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const asyncHandler = require("../middleware/asyncHandler");
const authController = require("../controllers/authController");

function generateOtp() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function cleanUser(user) {
    const userObject = user.toObject();

    delete userObject.password;
    delete userObject.emailOtp;
    delete userObject.emailOtpExpires;
    delete userObject.emailOtpAttempts;

    return userObject;
}

async function sendOtpEmail(email, otp) {

    const UserEmail = process.env.EMAIL_USER
    const UserPassword = process.env.EMAIL_PASS

    const transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: UserEmail,
            pass: UserPassword,
        },
    });

    await transporter.sendMail({
        from: `RescueBase <${UserEmail}>`,
        to: email,
        subject: "RescueBase Email Verification OTP",
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6;">
                <h2>RescueBase Email Verification</h2>
                <p>Your verification code is:</p>
                <h1 style="letter-spacing: 4px;">${otp}</h1>
                <p>This code will expire in 10 minutes.</p>
                <p>If you did not create a RescueBase account, you can ignore this email.</p>
            </div>
        `,
    })

}

router.post("/email/signup", async (req, res) => {
    asyncHandler(authController.emailSignup);
});

router.post("/email/verify-otp", async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const otp = String(req.body.otp || "").trim();

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required.",
            });
        }

        const user = await User.findOne({ email }).select(
            "+password +emailOtp +emailOtpExpires +emailOtpAttempts"
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        if (user.verified) {
            return res.json({
                success: true,
                message: "Account is already verified.",
                user: cleanUser(user),
            });
        }

        if (!user.emailOtp || !user.emailOtpExpires) {
            return res.status(400).json({
                success: false,
                message: "No OTP found. Please request a new code.",
            });
        }

        if (user.emailOtpExpires < new Date()) {
            return res.status(400).json({
                success: false,
                message: "OTP expired. Please request a new code.",
            });
        }

        if (user.emailOtpAttempts >= 5) {
            return res.status(429).json({
                success: false,
                message: "Too many OTP attempts. Please request a new code.",
            });
        }

        if (user.emailOtp !== otp) {
            user.emailOtpAttempts += 1;
            await user.save();

            return res.status(400).json({
                success: false,
                message: "Invalid OTP.",
            });
        }

        user.verified = true;
        user.emailOtp = "";
        user.emailOtpExpires = null;
        user.emailOtpAttempts = 0;

        await user.save();

        res.json({
            success: true,
            message: "Email verified successfully.",
            user: cleanUser(user),
        });
    } catch (error) {
        console.error("Verify OTP error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to verify OTP.",
            error: error.message,
        });
    }
});

router.post("/email/resend-otp", async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required.",
            });
        }

        const user = await User.findOne({ email }).select(
            "+emailOtp +emailOtpExpires +emailOtpAttempts"
        );

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found.",
            });
        }

        if (user.verified) {
            return res.status(400).json({
                success: false,
                message: "Account is already verified.",
            });
        }

        const otp = generateOtp();

        user.emailOtp = otp;
        user.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
        user.emailOtpAttempts = 0;

        await user.save();
        await sendOtpEmail(email, otp);

        res.json({
            success: true,
            message: "New OTP sent to your email.",
        });
    } catch (error) {
        console.error("Resend OTP error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to resend OTP.",
            error: error.message,
        });
    }
});

router.post("/email/login", async (req, res) => {
    try {
        const email = String(req.body.email || "").trim().toLowerCase();
        const password = String(req.body.password || "");

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: "Email and password are required.",
            });
        }

        const user = await User.findOne({ email }).select("+password");

        if (!user) {
            return res.status(400).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        if (user.provider === "google" && !user.password) {
            return res.status(400).json({
                success: false,
                message: "This account uses Google Sign-In.",
            });
        }

        const passwordMatches = await bcrypt.compare(password, user.password || "");

        if (!passwordMatches) {
            return res.status(400).json({
                success: false,
                message: "Invalid email or password.",
            });
        }

        if (!user.verified) {
            return res.status(403).json({
                success: false,
                message: "Please verify your email OTP before logging in.",
                needsVerification: true,
                email: user.email,
            });
        }

        if (user.status === "disabled") {
            return res.status(403).json({
                success: false,
                message: "Your account has been disabled.",
            });
        }

        res.json({
            success: true,
            message: "Login successful.",
            user: cleanUser(user),
        });
    } catch (error) {
        console.error("Email login error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to login with email.",
            error: error.message,
        });
    }
});

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
                message: "You don't have an account with us. Please sign up first.",
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