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

        await LedgerEntry.create({
            type: "adoption",
            action: "application_submitted",
            actorName: application.fullName,
            actorEmail: application.email,
            targetType: "AdoptionApplication",
            targetId: application._id.toString(),
            description: `${application.fullName} submitted an adoption application for ${application.petName || "a pet"}.`,
            status: "pending",
            metadata: {
                petName: application.petName,
                petBreed: application.petBreed,
                applicantEmail: application.email,
            },
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
        const { status, adminName, adminEmail } = req.body;

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

        await LedgerEntry.create({
            type: "adoption",
            action: `application_${status}`,
            actorName: adminName || "Admin User",
            actorEmail: adminEmail || "admin",
            targetType: "AdoptionApplication",
            targetId: application._id.toString(),
            description: `Admin ${status} the adoption application of ${application.fullName} for ${application.petName || "a pet"}.`,
            status,
            metadata: {
                petName: application.petName,
                petBreed: application.petBreed,
                applicantEmail: application.email,
            },
        });

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