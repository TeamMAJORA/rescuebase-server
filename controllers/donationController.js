const mongoose = require("mongoose");

const Donation = require("../models/Donations");
const User = require("../models/User");
const Notification = require("../models/Notifications");
const sendDonationConfirmationEmail = require("../services/emailService");


exports.createDonation = async (req, res) => {
    const donorName = String(
        req.body.donorName || ""
    ).trim();

    const donorEmail = String(
        req.body.donorEmail || ""
    ).trim().toLowerCase();

    const donationType = String(
        req.body.donationType || ""
    ).trim();

    if (!donorName) {
        const error = new Error(
            "Donor name is required."
        );
        error.statusCode = 400;
        throw error;
    }

    if (!donationType) {
        const error = new Error(
            "Donation type is required."
        );
        error.statusCode = 400;
        throw error;
    }

    const amount = Number(
        req.body.amount || 0
    );

    const quantity = Number(
        req.body.quantity || 1
    );

    if (Number.isNaN(amount) || amount < 0) {
        const error = new Error(
            "Invalid donation amount."
        );
        error.statusCode = 400;
        throw error;
    }

    if (Number.isNaN(quantity) || quantity < 1) {
        const error = new Error(
            "Invalid donation quantity."
        );

        error.statusCode = 400;
        throw error;
    }

    const creatorId = req.user?.id;

    const creatorEmail = String(
        req.user?.email || ""
    ).trim().toLowerCase();

    if (!creatorId || !creatorEmail) {
        const error = new Error(
            "Authenticated user information is missing."
        );
        error.statusCode = 401;
        throw error;
    }

    const creator = await User.findById(creatorId).select("name username email role");

    if (!creator) {
        const error = new Error(
            "Authenticated user account was not found."
        );
        error.statusCode = 401;
        throw error;
    }

    const creatorName = String(
        creator.name ||
        creator.username ||
        "User"
    ).trim();

    const donation = await Donation.create({
        donorName,
        donorEmail,
        donationType,
        amount,
        itemName: String(
            req.body.itemName || ""
        ).trim(),
        quantity,
        notes: String(
            req.body.notes || ""
        ).trim(),
        status:
            String(
                req.body.status || "pending"
            )
                .trim()
                .toLowerCase(),

        createdByName: creatorName,
        createdByEmail: creatorEmail,
    });

    await Notification.create({
        user: creatorId,
        title: "Thank You for Your Donation!",
        message:
            "Thank you for supporting RescueBase. Your donation has been successfully submitted and is currently pending review.",
        type: "donation_update",
    });

    await sendDonationConfirmationEmail(creatorEmail, creatorName, donationType);

    return res.status(201).json({
        success: true,
        message:
            "Donation record created successfully.",
        donation,
    });
};


exports.getAllDonations = async (req, res) => {
    const donations = await Donation.find()
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        donations,
    });
};


exports.updateDonation = async (req, res) => {
    const donationId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(donationId)) {
        const error = new Error(
            "Invalid donation ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const allowedFields = [
        "donorName",
        "donorEmail",
        "donationType",
        "amount",
        "itemName",
        "quantity",
        "notes",
        "status",
    ];

    const allowedUpdates = {};

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            allowedUpdates[field] =
                req.body[field];
        }
    }

    if (
        allowedUpdates.donorEmail !== undefined
    ) {
        allowedUpdates.donorEmail =
            String(
                allowedUpdates.donorEmail
            )
                .trim()
                .toLowerCase();
    }

    if (
        allowedUpdates.amount !== undefined
    ) {
        const amount = Number(
            allowedUpdates.amount
        );

        if (
            Number.isNaN(amount) ||
            amount < 0
        ) {
            const error = new Error(
                "Invalid donation amount."
            );

            error.statusCode = 400;
            throw error;
        }

        allowedUpdates.amount = amount;
    }

    if (
        allowedUpdates.quantity !== undefined
    ) {
        const quantity = Number(
            allowedUpdates.quantity
        );

        if (
            Number.isNaN(quantity) ||
            quantity < 1
        ) {
            const error = new Error(
                "Invalid donation quantity."
            );

            error.statusCode = 400;
            throw error;
        }

        allowedUpdates.quantity = quantity;
    }

    if (
        allowedUpdates.status !== undefined
    ) {
        const status = String(
            allowedUpdates.status
        )
            .trim()
            .toLowerCase();

        allowedUpdates.status = status;

        if (status === "received") {
            allowedUpdates.receivedDate =
                new Date();
        } else {
            allowedUpdates.receivedDate =
                null;
        }
    }

    if (
        Object.keys(allowedUpdates).length === 0
    ) {
        const error = new Error(
            "No valid fields provided for this update."
        );

        error.statusCode = 400;
        throw error;
    }

    const donation =
        await Donation.findByIdAndUpdate(
            donationId,
            {
                $set: allowedUpdates,
            },
            {
                new: true,
                runValidators: true,
            }
        );

    if (!donation) {
        const error = new Error(
            "Donation record not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        message:
            "Donation record updated successfully.",
        donation,
    });
};


exports.deleteDonation = async (req, res) => {
    const donationId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(donationId)) {
        const error = new Error(
            "Invalid donation ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const donation =
        await Donation.findByIdAndDelete(
            donationId
        );

    if (!donation) {
        const error = new Error(
            "Donation record not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        message:
            "Donation record deleted successfully.",
    });
};