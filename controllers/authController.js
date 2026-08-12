const bcrypt = require("bcrypt");
const crypto = require("crypto");
const User = require("../models/User");
const generateOtp = require("../utils/generateOtp");
const cleanUser = require("../utils/cleanUser");
const generateToken = require("../utils/generateToken");

const {
    sendOtpEmail, sendPasswordResetEmail
} = require("../services/emailService");

exports.emailSignup = async (req, res) => {
    const username = String(req.body.username || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const confirmPassword = String(req.body.confirmPassword || "");

    if (!username) {
        const error = new Error("Username is required.");
        error.statusCode = 400;
        throw error;
    }

    if (!email) {
        const error = new Error("Email is required.");
        error.statusCode = 400;
        throw error;
    }

    if (!password) {
        const error = new Error("Password is required.");
        error.statusCode = 400;
        throw error;
    }

    if (!confirmPassword) {
        const error = new Error("Passwords confirm your password");
        error.statusCode = 400;
        throw error;
    }

    if (password !== confirmPassword) {
        const error = new Error("Passwords do not match.");
        error.statusCode = 400;
        throw error;
    }

    if (password.length < 6) {
        const error = new Error("Passwords must be at least 6 characters.");
        error.statusCode = 400;
        throw error;
    }

    const existingUser = await User.findOne({
        email
    }).select(
        "+password +emailOtp +emailOtpExpires +emailOtpAttempts"
    );

    if (existingUser?.verified) {
        const error = new Error("Email is already registered. Please login instead.");
        error.statusCode = 409;
        throw error;
    }

    if (existingUser && existingUser.provider === "google") {
        const error = new Error("This email is already registered with Google Sign-In.");
        error.statusCode = 409;
        throw error;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const otp = generateOtp();

    let user;

    if (existingUser && !existingUser.verified) {
        existingUser.username = username;
        existingUser.email = email;
        existingUser.password = hashedPassword;
        existingUser.provider = "local";
        existingUser.role = "adopter";
        existingUser.status = "active";

        existingUser.verified = false;
        existingUser.emailOtp = otp;
        existingUser.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000);

        existingUser.emailOtpAttempts = 0;
        user = await existingUser.save();
    } else {
        user = await User.create({
            username,
            name: username,
            email,
            password: hashedPassword,
            provider: "local",
            role: "adopter",
            status: "active",
            verified: false,
            emailOtp: otp,
            emailOtpExpires: new Date(Date.now() + 10 * 60 * 1000),
            emailOtpAttempts: 0,
        });
    }

    await sendOtpEmail(email, otp);

    return res.status(201).json({
        success: true,
        message: "Signup successful. Please check your email for the OTP Code.",
        email,
        user: cleanUser(user),
    });
};

exports.verifyOtp = async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();

    if (!email) {
        const error = new Error("Email is required.");
        error.statusCode = 400;
        throw error;
    }

    if (!otp) {
        const error = new Error("OTP is required.");
        error.statusCode = 400;
        throw error;
    }

    const user = await User.findOne({
        email,
    }).select(
        "+password +emailOtp +emailOtpExpires +emailOtpAttempts"
    );

    if (!user) {
        const error = new Error("User not found.");
        error.statusCode = 404;
        throw error;
    }

    if (user.verified) {
        return res.json({
            success: true,
            message: "Account is already verified.",
            user: cleanUser(user),
        });
    }

    if (!user.emailOtp || !user.emailOtpExpires) {
        const error = new Error("No OTP Found. Please request a new code.");
        error.statusCode = 400;
        throw error;
    }

    if (user.emailOtpExpires < new Date()) {
        const error = new Error("OTP Expired. Please request a new code.");
        error.statusCode = 400;
        throw error;
    }

    if (user.emailOtpAttempts >= 5) {
        const error = new Error("Too many OTP Entry attempts. Please request a new code")
        error.statusCode = 429;
        throw error;
    }

    if (user.emailOtp !== otp) {
        user.emailOtpAttempts += 1;
        await user.save();
        const error = new Error("Invalid OTP");
        error.statusCode = 400;
        throw error;
    }

    user.verified = true;
    user.emailOtp = "";
    user.emailOtpExpires = null;
    user.emailOtpAttempts = 0;
    await user.save();
    const token = generateToken(user);

    return res.json({
        success: true,
        message: "Email verified successfully.",
        token,
        user: cleanUser(user),
    });
};

exports.resendOtp = async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();

    if (!email) {
        const error = new Error("Email is required.");
        error.statusCode = 400;
        throw error;
    }

    const user = await User.findOne({
        email,
    }).select(
        "+emailOtp +emailOtpExpires +emailOtpAttempts"
    );

    if (!user) {
        const error = new Error("User not found.");
        error.statusCode = 404;
        throw error;
    }

    if (user.verified) {
        const error = new Error("Account is already verified.");
        error.statusCode = 400;
        throw error;
    }

    const otp = generateOtp();
    user.emailOtp = otp;
    user.emailOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.emailOtpAttempts = 0;
    await user.save();
    await sendOtpEmail(email, otp);

    return res.status(200).json({
        success: true,
        message: "New OTP send to your email.",
    });
};

exports.emailLogin = async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const user = await User.findOne({
        email,
    }).select("+password " + "+loginOtp " + "+loginOtpExpires " + "+loginOtpAttempts " + "+loginOtpLockedUntil ");

    if (!user) {
        const error = new Error("Invalid email or password.");
        error.statusCode = 401;
        throw error;
    }

    if (user.provider === "google" && !user.password) {
        const error = new Error("This account uses Google Sign-In.");
        error.statusCode = 400;
        throw error;
    }

    const passwordMatches = await bcrypt.compare(password, user.password || "");

    if (!passwordMatches) {
        const error = new Error("Invalid email or password.");
        error.statusCode = 401;
        throw error;
    }

    if (!user.verified) {
        const error = new Error("Please verify your email OTP before logging in");
        error.statusCode = 403;
        error.needsVerification = true;
        error.email = user.email;
        throw error;
    }

    if (user.status === "disabled") {
        const error = new Error("Your account is disabled.");
        error.statusCode = 403;
        throw error;
    }

    const loginOtp = generateOtp();

    user.loginOtp = loginOtp;
    user.loginOtpExpires = new Date(Date.now() + 10 * 60 * 1000);
    user.loginOtpAttempts = 0;
    user.loginOtpLockedUntil = null;

    await user.save();

    await sendOtpEmail(user.email, loginOtp);

    return res.status(200).json({
        success: true,
        message: "Login successful.",
        requiresOtp: true,
        user: cleanUser(user),
    });
};

exports.verifyLoginOtp = async (req, res) => {
    const email = String(req.body.email || "").trim().toLowerCase();
    const otp = String(req.body.otp || "").trim();

    if (!email || !otp) {
        const e = new Error("Email and OTP are required.");
        e.statusCode = 400;
        throw e;
    }

    const user = await User.findOne({ email, }).select("+loginOtp " + "+loginOtpExpires " + "+loginOtpAttempts " + "+loginOtpLockedUntil ");

    if (!user) {
        const e = new Error("Invalid OTP.");
        e.statusCode = 401;
        throw e;
    }

    if (user.loginOtpLockedUntil && user.loginOtpLockedUntil > new Date()) {
        const e = new Error("Too many incorrect OTP attempts. Please try again later.");
        e.statusCode = 429;
        throw e;
    }

    if (user.loginOtpLockedUntil && user.loginOtpLockedUntil <= new Date()) {
        user.loginOtpLockedUntil = null;
        user.loginOtpAttempts = 0;
    }

    if (!user.loginOtp || !user.loginOtpExpires) {
        const e = new Error("No active login OTP found. Please log in again.");
        e.statusCode = 400;
        throw e;
    }

    if (user.loginOtpExpires < new Date()) {
        user.loginOtp = "";
        user.loginOtpExpires = null;
        user.loginOtpAttempts = 0;

        await user.save();
        const e = new Error("Login OTP has expired. Please login again.");
        e.statusCode = 400;
        throw e;
    }

    if (user.loginOtp !== otp) {
        user.loginOtpAttempts += 1;

        if (user.loginOtpAttempts >= 3) {
            user.loginOtp = "";
            user.loginOtpExpires = null;
            user.loginOtpLockedUntil = new Date(Date.now() + 15 * 60 * 1000);

            await user.save();
            const e = new Error("Too many incorrect OTP Attempts. Please try again later.");
            e.statusCode = 429;
            throw error;
        }

        await user.save();

        const remainingAttempts = 3 - user.loginOtpAttempts;

        const e = new Error(`Invalid OTP. ${remainingAttempts} attempt(s) remaining.`);
        e.statusCode = 401;
        throw e;
    }

    user.loginOtp = "";
    user.loginOtpExpires = null;
    user.loginOtpAttempts = 0;
    user.loginOtpLockedUntil = null;

    await user.save();

    const token = generateToken(user);

    return res.status(200).json({
        success: true,
        message: "Login successful.",
        token,
        user: cleanUser(user),
    })
}

exports.forgotPassword = async (req, res) => {
    const email = String(
        req.body.email || ""
    ).trim().toLowerCase();

    if (!email) {
        const e = new Error("Email is required.");
        e.statusCode = 400;
        throw e;
    }

    const user = await User.findOne({ email }).select(
        "+passwordResetToken +passwordResetExpires"
    );

    if (!user) {
        return res.status(200).json({
            success: true,
            message:
                "If an account is associated with this email, password reset instructions have been sent.",
        });
    }

    if (user.provider === "google" && !user.password) {
        return res.status(200).json({
            success: true,
            message:
                "If an account is associated with this email, password reset instructions have been sent.",
        });
    }

    // Generate a 6-digit password reset OTP
    const resetOtp = String(
        Math.floor(
            100000 + Math.random() * 900000
        )
    );

    user.passwordResetToken = resetOtp;

    user.passwordResetExpires = new Date(
        Date.now() + 15 * 60 * 1000
    );

    await user.save();

    await sendPasswordResetEmail(
        user.email,
        resetOtp
    );
    
    return res.status(200).json({
        success: true,
        message:
            "If an account is associated with this email, password reset instructions have been sent.",
    });
};

exports.resetPassword = async (req, res) => {
    const otp = String(
        req.body.otp || ""
    ).trim();

    const password = String(
        req.body.password || ""
    );

    const confirmPassword = String(
        req.body.confirmPassword || ""
    );

    if (!otp) {
        const e = new Error(
            "Password reset OTP is required."
        );
        e.statusCode = 400;
        throw e;
    }

    if (!password) {
        const e = new Error(
            "Password is required."
        );
        e.statusCode = 400;
        throw e;
    }

    if (!confirmPassword) {
        const e = new Error(
            "Please confirm your password."
        );
        e.statusCode = 400;
        throw e;
    }

    if (password !== confirmPassword) {
        const e = new Error(
            "Passwords do not match."
        );
        e.statusCode = 400;
        throw e;
    }

    if (password.length < 6) {
        const e = new Error(
            "Password must be at least 6 characters."
        );
        e.statusCode = 400;
        throw e;
    }

    const user = await User.findOne({
        passwordResetToken: otp,
        passwordResetExpires: {
            $gt: new Date(),
        },
    }).select(
        "+password " +
        "+passwordResetToken " +
        "+passwordResetExpires"
    );

    if (!user) {
        const e = new Error(
            "Invalid or expired password reset OTP."
        );
        e.statusCode = 400;
        throw e;
    }

    user.password = await bcrypt.hash(
        password,
        10
    );

    user.provider = "local";
    user.verified = true;

    user.passwordResetToken = "";
    user.passwordResetExpires = null;

    user.loginOtp = "";
    user.loginOtpExpires = null;
    user.loginOtpAttempts = 0;
    user.loginOtpLockedUntil = null;

    await user.save();

    return res.status(200).json({
        success: true,
        message:
            "Password reset successfully. You can now login.",
    });
};

exports.googleSignup = async (req, res) => {
    const firebaseUser = req.firebaseUser;

    if (!firebaseUser) {
        const error = new Error("Firebase authentication information is missing");
        error.statusCode = 401;
        throw error;
    }

    const firebaseUid = firebaseUser.uid;
    const email = String(firebaseUser.email || "").trim().toLowerCase();
    const name = String(firebaseUser.name || "").trim();
    const profileImage = String(firebaseUser.picture || "").trim();

    if (!firebaseUid || !email) {
        const error = new Error("Required Google account information is missing.");
        error.statusCode = 400;
        throw error;
    }

    const existingUser = await User.findOne({
        $or: [
            { firebaseUid },
            { email },
        ],
    });

    if (existingUser) {
        const error = new Error("Account already registered. Please log in.");
        error.statusCode = 409;
        throw error;
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

    const token = generateToken(user);

    return res.status(200).json({
        success: true,
        message: "Signup successful",
        token,
        user: cleanUser(user),
    });
};

exports.googleLogin = async (req, res) => {
    const firebaseUser = req.firebaseUser;

    if (!firebaseUser) {
        const error = new Error("Firebase authentication information is missing");
        error.statusCode = 401;
        throw error;
    }

    const firebaseUid = firebaseUser.uid;
    const email = String(firebaseUser.email || "").trim().toLowerCase();

    if (!firebaseUid || !email) {
        const error = new Error("Required Google account information is missing.");
        error.statusCode = 400;
        throw error;
    }

    const user = await User.findOne({
        $or: [
            { firebaseUid },
            { email },
        ],
    });

    if (!user) {
        const error = new Error("You don't have an account with RescueBase. Please sign up first.");
        error.statusCode = 404;
        throw error;
    }

    if (user.status == "disabled") {
        const error = new Error("This account has been disabled.");
        error.statusCode = 403;
        throw error;
    }

    const loginOtp = generateOtp();

    user.loginOtp = loginOtp;

    user.loginOtpExpires = new Date(
        Date.now() + 10 * 60 * 1000
    );

    user.loginOtpAttempts = 0;
    user.loginOtpLockedUntil = null;

    await user.save();

    await sendOtpEmail(
        user.email,
        loginOtp
    );

    return res.status(200).json({
        success: true,
        message:
            "A verification code has been sent to your email.",
        requiresOtp: true,
        email: user.email,
    });
};