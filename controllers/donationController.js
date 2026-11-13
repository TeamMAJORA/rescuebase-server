const mongoose = require("mongoose");

const Donation = require("../models/Donations");
const User = require("../models/User");
const Notification = require("../models/Notifications");
const { sendDonationConfirmationEmail } = require("../services/emailService");
const NeededSupply = require("../models/NeededSupply.js")
const FoodInventory = require("../models/FoodInventory");
const PaymentMethod = require("../models/PaymentMethods");

const MAX_FOOD_STOCK_KG = 100000;

// updates the quantityReceived field of a supply
// item, the same amount (kg) is added to / taken from that food's stock.
async function changeSupplyReceived(supplyId, delta, req) {
    if (!supplyId || !delta) return;

    const supply = await NeededSupply.findByIdAndUpdate(
        supplyId,
        { $inc: { quantityReceived: delta } },
        { returnDocument: "after" }
    );

    await changeLinkedFoodStock(supply, delta, req);
}

// Adds / removes kg on the Food Storage item a supply is linked to (if any)
async function changeLinkedFoodStock(supply, delta, req) {
    if (!supply?.foodInventoryId || !delta) return;

    const food = await FoodInventory.findById(supply.foodInventoryId);
    if (!food) return;

    const previousStock = Number(food.quantityInStock) || 0;
    const newStock = Math.min(MAX_FOOD_STOCK_KG, Math.max(0, previousStock + delta));
    const changed = Math.abs(newStock - previousStock);

    if (!changed) return;

    food.quantityInStock = newStock;
    food.adjustmentHistory.push({
        action: newStock > previousStock ? "add" : "remove",
        quantity: changed,
        previousStock,
        newStock,
        reason: newStock > previousStock ? "Donation received" : "Donation reversed",
        note: `Needed supply: ${supply.name}`,
        adjustedBy: req.user?.id || null,
    });
    await food.save();
}

const MAX_DONATION_AMOUNT = 100000;
const MAX_DONATION_QUANTITY = 1000;


// Donor's account, found by the donation's email. Never throws.
async function notifyDonorNotReceived(donation) {
    try {
        const email = String(donation.donorEmail || donation.createdByEmail || "").trim().toLowerCase();
        const donor = email ? await User.findOne({ email }).select("_id role") : null;

        if (!donor || ["admin", "staff"].includes(donor.role)) return;

        const what = donation.donationType === "Money"
            ? `Your ₱${Number(donation.amount || 0).toLocaleString("en-PH")} donation`
            : `Your donation of ${donation.itemName || donation.donationType}`;

        await Notification.create({
            user: donor._id,
            title: "Donation Not Received",
            message: `${what} was marked as not received. Reason: ${donation.notReceivedReason}`,
            type: "donation_update",
        });
    } catch (error) {
        console.error("Donation not-received notification failed:", error);
    }
}

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

    const proofOfPayment = String(
        req.body.proofOfPayment || ""
    ).trim();

    const paymentMethod = String(
        req.body.paymentMethod || ""
    ).trim();

    const itemPhotoUrl = donationType === "Money"
        ? ""
        : String(req.body.itemPhotoUrl || "").trim();

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

    // Money is counted by amount, not quantity
    const quantity = donationType === "Money"
        ? 1
        : Number(req.body.quantity || 1);

    if (Number.isNaN(amount) || amount < 0 || amount > MAX_DONATION_AMOUNT) {
        const error = new Error(
            `Donation amount must be between 0 and ${MAX_DONATION_AMOUNT.toLocaleString()}.`
        );
        error.statusCode = 400;
        throw error;
    }

    if (Number.isNaN(quantity) || quantity < 1 || quantity > MAX_DONATION_QUANTITY) {
        const error = new Error(
            `Donation quantity must be between 1 and ${MAX_DONATION_QUANTITY.toLocaleString()}.`
        );

        error.statusCode = 400;
        throw error;
    }
//gaw nilagay ko dito sa baba after then const of donation types
    // Admin and staff record walk-in cash themselves, so only donors must attach proof of payment and payment method.
    // Staff without a proof photo must give a receipt or reference number instead.

    const isShelterStaff = ["admin", "staff"].includes(req.user?.role);

    const paymentReference = String(
        req.body.paymentReference || ""
    ).trim();

    if (donationType === "Money") {
        if (amount <= 0) {
            const error = new Error(
                "Money donations must have an amount greater than zero."
            );
            error.statusCode = 400;
            throw error;
        }

        if (!isShelterStaff && !proofOfPayment) {
            const error = new Error(
                "Proof of payment is required for money donations."
            );
            error.statusCode = 400;
            throw error;
        }

        if (isShelterStaff && !proofOfPayment && !paymentReference) {
            const error = new Error(
                "A receipt or reference number is required when recording a money donation without proof of payment."
            );
            error.statusCode = 400;
            throw error;
        }

        if (!isShelterStaff && !paymentMethod) {
            const error = new Error(
                "Payment method is required for money donations."
            );
            error.statusCode = 400;
            throw error;
        }

        if (!isShelterStaff) {
            const registeredPaymentMethod = await PaymentMethod.exists({
                method_type: paymentMethod,
                is_active: true,
            });

            if (!registeredPaymentMethod) {
                const error = new Error(
                    "Please choose one of the shelter's available payment methods."
                );
                error.statusCode = 400;
                throw error;
            }
        }
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

    if (donationType === "Other" && !String(req.body.itemName || "").trim()) {
        const error = new Error("Please say what item you're donating.");
        error.statusCode = 400;
        throw error;
    }

    // Donors show what they're bringing; staff logging walk-ins don't need a photo
    if (donationType !== "Money" && !isShelterStaff && !itemPhotoUrl) {
        const error = new Error("Please upload a photo of the items you're donating.");
        error.statusCode = 400;
        throw error;
    }

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
        paymentMethod,
        paymentStatus: donationType === "Money"
            ? "pending"
            : "not_required",
        paymentReference,
        proofOfPayment,
        itemPhotoUrl,
        status: "pending",
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

    // Staff only change the status (mark received / cancel); the donor's details stay as sent
    const allowedFields = ["status"];

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

    if (allowedUpdates.status === undefined) {
        const error = new Error("Only the donation status can be changed.");
        error.statusCode = 400;
        throw error;
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

    // Not received: staff must say why; the donor is told
    if (newStatus === "cancelled") {
        const notReceivedReason = String(req.body.notReceivedReason || "").trim();

        if (notReceivedReason.length < 5 || notReceivedReason.length > 300) {
            const error = new Error("Please give a reason (5 to 300 characters) for marking it not received.");
            error.statusCode = 400;
            throw error;
        }

        allowedUpdates.notReceivedReason = notReceivedReason;
        const staffMember = await User.findById(req.user?.id).select("name username");
        allowedUpdates.notReceivedByName = String(staffMember?.name || staffMember?.username || "Staff").trim();
    } else {
        allowedUpdates.notReceivedReason = "";
        allowedUpdates.notReceivedByName = "";
    }

    if (oldStatus === "received" && oldSupplyId) {
        const shouldRemoveOldQuantity =
            newStatus !== "received" ||
            newSupplyId !== oldSupplyId;

        if (shouldRemoveOldQuantity) {
            await changeSupplyReceived(oldSupplyId, -oldQuantity, req);
        } else if (newQuantity !== oldQuantity) {
            await changeSupplyReceived(oldSupplyId, newQuantity - oldQuantity, req);
        }
    }

    if (newStatus === "received" && newSupplyId) {
        const shouldAddNewQuantity =
            oldStatus !== "received" ||
            newSupplyId !== oldSupplyId;

        if (shouldAddNewQuantity) {
            await changeSupplyReceived(newSupplyId, newQuantity, req);
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
                returnDocument: "after",
                runValidators: true,
            }
        );

    if (newStatus === "cancelled" && oldStatus !== "cancelled") {
        await notifyDonorNotReceived(donation);
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
        const error = new Error("Invalid donation ID.");
        error.statusCode = 400;
        throw error;
    }

    const donation = await Donation.findById(donationId);

    if (!donation || donation.hiddenFromLedgerAt) {
        const error = new Error("Donation record not found.");
        error.statusCode = 404;
        throw error;
    }

    // A Received donation stays in the database and keeps counting in all totals
    // (donation counts, money received, supply totals); it is only hidden from the ledger.
    if (donation.status === "received") {
        const hidden = await Donation.findOneAndUpdate(
            { _id: donationId, status: "received", hiddenFromLedgerAt: null },
            {
                $set: {
                    hiddenFromLedgerAt: new Date(),
                    hiddenFromLedgerBy: req.user?.name || req.user?.username || req.user?.email || "",
                },
            },
            { returnDocument: "after" }
        );

        if (!hidden) {
            const error = new Error("Donation record not found.");
            error.statusCode = 404;
            throw error;
        }

        return res.status(200).json({
            success: true,
            message: "Donation removed from the ledger. It still counts in the totals.",
        });
    }

    // Pending and Cancelled donations were never added to any total, so they are deleted for real
    await Donation.findByIdAndDelete(donationId);

    return res.status(200).json({
        success: true,
        message: "Donation record deleted successfully.",
    });
};