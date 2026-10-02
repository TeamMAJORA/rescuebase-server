const mongoose = require("mongoose");

const Donation = require("../models/Donations");
const User = require("../models/User");
const Notification = require("../models/Notifications");
const { sendDonationConfirmationEmail }= require("../services/emailService");
const NeededSupply = require("../models/NeededSupply.js")


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
        paymentMethod: String(req.body.paymentMethod || "").trim(),
        paymentStatus: donationType === "Money" ? "pending" : "not_required",
        paymentReference: String(req.body.paymentReference || "").trim(),
        proofOfPayment: String(req.body.proofOfPayment || "").trim(),
        status: String(req.body.status || "pending")
            .trim()
            .toLowerCase(),
        createdByName: creatorName,
        createdByEmail: creatorEmail,
        neededSupplyId: req.body.neededSupplyId || null,
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

exports.getMyDonations = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);

        if (!user) {
            return res.status(404).json({
                message: "User not found"
            });
        }

        const donations = await Donation.find({
            donorEmail: user.email
        }).sort({ createdAt: -1 });

        return res.status(200).json(donations);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch donation history",
            error: error.message
        });
    }
};


exports.updateDonation = async (req, res) => {
    const donationId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(donationId)) {
        const error = new Error("Invalid donation ID.");
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
        "neededSupplyId",
        "paymentMethod",
        "paymentStatus",
        "paymentReference",
        "proofOfPayment",
    ];

    const allowedUpdates = {};

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            allowedUpdates[field] = req.body[field];
        }
    }

    const existingDonation =
        await Donation.findById(donationId);

    if (!existingDonation) {
        const error = new Error(
            "Donation record not found."
        );
        error.statusCode = 404;
        throw error;
    }

    if (allowedUpdates.donorEmail !== undefined) {
        allowedUpdates.donorEmail = String(
            allowedUpdates.donorEmail
        ).trim().toLowerCase();
    }

    if (allowedUpdates.amount !== undefined) {
        const amount = Number(allowedUpdates.amount);

        if (Number.isNaN(amount) || amount < 0) {
            const error = new Error(
                "Invalid donation amount."
            );
            error.statusCode = 400;
            throw error;
        }

        allowedUpdates.amount = amount;
    }

    if (allowedUpdates.quantity !== undefined) {
        const quantity = Number(allowedUpdates.quantity);

        if (Number.isNaN(quantity) || quantity < 1) {
            const error = new Error(
                "Invalid donation quantity."
            );
            error.statusCode = 400;
            throw error;
        }

        allowedUpdates.quantity = quantity;
    }

    if (allowedUpdates.status !== undefined) {
        allowedUpdates.status = String(
            allowedUpdates.status
        ).trim().toLowerCase();
    }

    const oldStatus = existingDonation.status;
    const newStatus =
        allowedUpdates.status || oldStatus;

    const oldQuantity = Number(
        existingDonation.quantity || 0
    );

    const newQuantity = Number(
        allowedUpdates.quantity ??
        existingDonation.quantity ??
        0
    );

    const oldSupplyId =
        existingDonation.neededSupplyId?.toString() || null;

    const newSupplyId =
        allowedUpdates.neededSupplyId !== undefined
            ? allowedUpdates.neededSupplyId
                ? String(allowedUpdates.neededSupplyId)
                : null
            : oldSupplyId;

    if (newStatus === "received") {
        allowedUpdates.receivedDate =
            existingDonation.receivedDate || new Date();
    } else {
        allowedUpdates.receivedDate = null;
    }

    if (oldStatus === "received" && oldSupplyId) {
        const shouldRemoveOldQuantity =
            newStatus !== "received" ||
            newSupplyId !== oldSupplyId;

        if (shouldRemoveOldQuantity) {
            await NeededSupply.findByIdAndUpdate(
                oldSupplyId,
                {
                    $inc: {
                        quantityReceived: -oldQuantity,
                    },
                }
            );
        } else if (newQuantity !== oldQuantity) {
            await NeededSupply.findByIdAndUpdate(
                oldSupplyId,
                {
                    $inc: {
                        quantityReceived:
                            newQuantity - oldQuantity,
                    },
                }
            );
        }
    }

    if (newStatus === "received" && newSupplyId) {
        const shouldAddNewQuantity =
            oldStatus !== "received" ||
            newSupplyId !== oldSupplyId;

        if (shouldAddNewQuantity) {
            await NeededSupply.findByIdAndUpdate(
                newSupplyId,
                {
                    $inc: {
                        quantityReceived: newQuantity,
                    },
                }
            );
        }
    }

    const donation =
        await Donation.findByIdAndUpdate(
            donationId,
            {
                $set: {
                    ...allowedUpdates,
                    neededSupplyId: newSupplyId,
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

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