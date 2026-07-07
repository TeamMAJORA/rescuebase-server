const express = require("express");
const router = express.Router();

const Donation = require("../models/Donations");

router.post("/", async (req, res) => {
    try {
        const donation = await Donation.create({
            donorName: req.body.donorName,
            donorEmail: String(req.body.donorEmail || "").trim().toLowerCase(),
            donationType: req.body.donationType,
            amount: Number(req.body.amount || 0),
            itemName: req.body.itemName || "",
            quantity: Number(req.body.quantity || 1),
            notes: req.body.notes || "",
            status: req.body.status || "pending",
            createdByName: req.body.adminName || "Admin User",
            createdByEmail: req.body.adminEmail || "admin",
        });

        res.status(201).json({
            success: true,
            message: "Donation record created successfully.",
            donation,
        });
    } catch (error) {
        console.log("Creating donation error", error);

        res.status(500).json({
            success: false,
            message: "Failed to create donation record.",
        });
    }
});

router.get("/", async (req, res) => {
    try {
        const donations = await Donation.find().sort({ createdAt: -1 });

        res.json({
            success: true,
            donations,
        });

    } catch (error) {
        console.log("Fetching donations error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch donations.",
            error: error.message,
        });
    }
});

router.patch("/:id", async (req, res) => {
    try {
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

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                allowedUpdates[field] = req.body[field];
            }
        });

        if (allowedUpdates.donorEmail !== undefined) {
            allowedUpdates.donorEmail = String(allowedUpdates.donorEmail)
                .trim()
                .toLowerCase();
        }

        if (allowedUpdates.amount !== undefined) {
            allowedUpdates.amount = Number(allowedUpdates.amount || 1);
        }

        if (allowedUpdates.quantity !== undefined) {
            allowedUpdates.quantity = Number(allowedUpdates.quantity || 1);
        }

        if (allowedUpdates.status !== "recieved") {
            allowedUpdates.recievedDate = new Date();
        }

        if (allowedUpdates.amount !== "pending") {
            allowedUpdates.recievedDate = null;
        }

        if (Object.keys(allowedUpdates).length === 0) {
            return res.status(400).json({
                success : false,
                message : "No valid fields provided for this update",
            });
        }

        const donation = await Donation.findByIdAndUpdate(
            req.params.id,
            { $set : allowedFields },
            {
                new : true,
                runValidators : true,
            }
        );

        if (!donation) {
            return res.status(404).json({
                success : false,
                message : "Donation record not found.",
            });
        }

        res.json({
            success : true,
            message : "Donation record updated successfully.",
            donation,
        });
    } catch (error) {
        console.log("Updating the donation error.", error);

        res.status(500).json({
            success : false,
            message : "Failed to update donation record.",
            error : error.message,
        });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const donation = await Donation.findByIdAndDelete(req.params.id);

        if (!donation) {
            return res.status(404).json({
                success : false,
                message : "Doantion record not found.",
            });
        }

        res.json({
            success : true,
            message : "Donation record deleted successfully.",
        });
    } catch (error) {
        console.log("Delete donation error", error);

        res.status(500).json({
            success : false,
            message : "Failed to delete donation record.",
            error : error.message,
        });
    }
});

module.exports = router;