const express = require("express");
const router = express.Router();
const AdoptionApplication = require("../models/AdoptionApplication");
const LedgerEntry = require("../models/LedgerEntry");

router.post("/", async (req, res) => {
    try {
        const application = await AdoptionApplication.create({
            ...req.body,
            status: "pending",
        });

        res.status(201).json({
            success: true,
            message: "Adoption application submitted.",
            application,
        });
    } catch (error) {
        console.error("Adoption submit error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to submit adoption application",
        });
    }
});

router.get("/", async (req, res) => {
    try {
        const applications = await AdoptionApplication.find().sort({
            createdAt: -1,
        });

        res.json({
            success: true,
            applications,
        });
    } catch (error) {
        console.error("Fetch adoptions error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch adoption applications",
        });
    }
});

router.get("/user/:email/latest", async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email);

        const application = await AdoptionApplication.findOne({ email }).sort({
            createdAt: -1,
        });

        res.json({
            success: true,
            application,
        });
    } catch (error) {
        console.error("Fetch user adoption error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch adoption application",
        });
    }
});

router.patch("/:id/status", async (req, res) => {
    try {
        const { status } = req.body;

        if (!["pending", "approved", "rejected"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid application status",
            });
        }

        const application = await AdoptionApplication.findByIdAndUpdate(
            req.params.id,
            { status },
            { new: true }
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: "Application not found",
            });
        }

        res.json({
            success: true,
            message: "Application status updated.",
            application,
        });
    } catch (error) {
        console.error("Update adoption status error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update application status",
        });
    }
});

module.exports = router;