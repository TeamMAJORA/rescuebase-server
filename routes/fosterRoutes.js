const express = require("express");
const router = express.Router();

const FosterAssignment = require("../models/FosterAssignment");
const LedgerEntry = require("../models/LedgerEntry");

router.post("/assignments", async (req, res) => {
    try {
        const assignment = await FosterAssignment.create({
            ...req.body,
            status: "active",
        });

        await LedgerEntry.create({
            type: "foster",
            action: "foster_assignment_created",
            actorName: req.body.adminName || "Admin User",
            actorEmail: req.body.adminEmail || "admin",
            targetType: "FosterAssignment",
            targetId: assignment._id.toString(),
            description: `${assignment.fosterName} was assigned to foster ${assignment.petName}.`,
            status: "active",
            metadata: {
                petName: assignment.petName,
                fosterEmail: assignment.fosterEmail,
            },
        });

        res.status(201).json({
            success: true,
            message: "Foster assignment created.",
            assignment,
        });
    } catch (error) {
        console.error("Create foster assignment error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create foster assignment.",
        });
    }
});

router.get("/assignments", async (req, res) => {
    try {
        const assignments = await FosterAssignment.find().sort({
            createdAt: -1,
        });

        res.json({
            success: true,
            assignments,
        });
    } catch (error) {
        console.error("Fetch foster assignments error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch foster assignments.",
        });
    }
});

router.get("/assignments/foster/:email/active", async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email).trim().toLowerCase();

        const assignment = await FosterAssignment.findOne({
            fosterEmail: email,
            status: "active",
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            assignment,
        });
    } catch (error) {
        console.error("Fetch active foster assignment error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch active foster assignments.",
        });
    }
});

router.post("/assignments/:id/updates", async (req, res) => {
    try {
        const assignment = await FosterAssignment.findById(req.params.id);

        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: "Foster assignment not found.",
            });
        }

        assignment.updates.push({
            note: req.body.note,
            photoUrl: req.body.photoUrl,
            submittedBy: req.body.submittedBy,
            submittedByEmail: req.body.submittedByEmail,
        });

        await assignment.save();

        await LedgerEntry.create({
            type: "foster",
            action: "weekly_update_submitted",
            actorName: req.body.submittedBy || assignment.fosterName,
            actorEmail: req.body.submittedByEmail || assignment.fosterEmail,
            targetType: "FosterAssignment",
            targetId: assignment._id.toString(),
            description: `${assignment.fosterName} submitted a weekly foster update for ${assignment.petName}.`,
            status: assignment.status,
            metadata: {
                petName: assignment.petName,
                photoUrl: req.body.photoUrl,
            },
        });

        res.json({
            success: true,
            message: "Weekly update submitted.",
            assignment,
        });
    } catch (error) {
        console.error("Submit foster update error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to submit foster update.",
        });
    }
});

router.patch("/assignments/:id/complete", async (req, res) => {
    try {
        const assignment = await FosterAssignment.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    status: "completed",
                    endDate: new Date(),
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: "Foster assignment not found.",
            });
        }

        await LedgerEntry.create({
            type: "foster",
            action: "foster_assignment_completed",
            actorName: req.body.adminName || "Admin User",
            actorEmail: req.body.adminEmail || "admin",
            targetType: "FosterAssignment",
            targetId: assignment._id.toString(),
            description: `${assignment.fosterName}'s foster assignment for ${assignment.petName} was completed.`,
            status: "completed",
            metadata: {
                petName: assignment.petName,
                fosterEmail: assignment.fosterEmail,
            },
        });

        res.json({
            success: true,
            message: "Foster assignment completed.",
            assignment,
        });
    } catch (error) {
        console.error("Complete foster assignment error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to complete foster assignment.",
            error: error.message,
        });
    }
});

module.exports = router;