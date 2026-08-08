const express = require("express");
const router = express.Router();
const { getAuth } = require("firebase-admin/auth");
const User = require("../models/User");
const bcrypt = require("bcrypt");
const nodemailer = require("nodemailer");
const asyncHandler = require("../middleware/asyncHandler");
const authController = require("../controllers/authController");
const validateRequest = require("../middleware/validateRequest");

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

router.post("/email/signup",
    validateRequest(["username", "email", "password", "confirmPassword"]),
    asyncHandler(authController.emailSignup)
);

router.post("/email/verify-otp",
    validateRequest(["email", "otp"]),
    asyncHandler(authController.verifyOtp)
);

router.post("/email/resend-otp", 
    validateRequest(["email"]),
    asyncHandler(authController.resendOtp)
);

router.post("/email/login",
    validateRequest(["email", "password"]),
    asyncHandler(authController.emailLogin)
);

router.post("/google/signup", verifyFirebaseToken, asyncHandler(authController.googleSignup));

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