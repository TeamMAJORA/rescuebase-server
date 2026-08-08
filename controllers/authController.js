const bcrypt = require("bcrypt");
const User = require("../models/user");

const generateOtp = require("../utils");
const cleanUser = require("../utils");

const {
    sendOtpEmail,
} = require("../services");

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
    const email = String(req.body, email || "").trim().toLowerCase();
    const otp = String(req.body.otpp || "").trim();

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
            success : true,
            message : "Account is already verified.",
            user: cleanUser(user),
        });
    }

    if (!user.emailOtp || !user.emailOtpExpires) {
        const error = new Error("No OTP Found. Please request a new code.");
        error.codeStatus = 400;
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

    return res.json({
        success: true,
        message: "Email verified successfully.",
        user: cleanUser(user),
    });
};

