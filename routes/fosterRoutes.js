const express = require("express");
const router = express.Router();

const FosterAssignment = require("../models/FosterAssignment");
const FosterApplication = require("../models/FosterApplication");
const LedgerEntry = require("../models/LedgerEntry");

router.post("/applications", async (req, res) => {
    try {
        const applicantEmail = String(req.body.applicantEmail || "")
            .trim()
            .toLowerCase();

        const existingApplication = await FosterApplication.findOne({
            applicantEmail,
            status: "pending",
        });

        if (existingApplication) {
            return res.status(400).json({
                success: false,
                message: "You already have a pending foster application.",
            });
        }

        const application = await FosterApplication.create({
            applicantName: req.body.applicantName,
            applicantEmail,
            phoneNumber: req.body.phoneNumber || "",
            address: req.body.address || "",
            housingType: req.body.housingType || "House",
            hasPets: Boolean(req.body.hasPets),
            hasChildren: Boolean(req.body.hasChildren),
            availableSpace: req.body.availableSpace || "",
            availableTime: req.body.availableTime || "",
            fosterExperience: req.body.fosterExperience || "",
            preferredAnimalType: req.body.preferredAnimalType || "Both",
            capacity: Number(req.body.capacity || 1),
            status: "pending",
        });

        await LedgerEntry.create({
            type: "foster",
            action: "foster_application_submitted",
            actorName: application.applicantName,
            actorEmail: application.applicantEmail,
            targetType: "FosterApplication",
            targetId: application._id.toString(),
            description: `${application.applicantName} submitted a foster caregiver application.`,
            status: "pending",
            metadata: {
                applicantEmail: application.applicantEmail,
                capacity: application.capacity,
                preferredAnimalType: application.preferredAnimalType,
            },
        });

        res.status(201).json({
            success: true,
            message: "Foster application submitted.",
            application,
        });
    } catch (error) {
        console.error("Create foster application error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to submit foster application.",
            error: error.message,
        });
    }
});

router.get("/applications", async (req, res) => {
    try {
        const applications = await FosterApplication.find().sort({
            createdAt: -1,
        });

        res.json({
            success: true,
            applications,
        });
    } catch (error) {
        console.error("Fetch foster applications error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch foster applications.",
            error: error.message,
        });
    }
});

router.get("/applications/applicant/:email", async (req, res) => {
    try {
        const applicantEmail = decodeURIComponent(req.params.email)
            .trim()
            .toLowerCase();

        const application = await FosterApplication.findOne({
            applicantEmail,
        }).sort({ createdAt: -1 });

        res.json({
            success: true,
            application,
        });
    } catch (error) {
        console.error("Fetch foster applicant application error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch foster application.",
            error: error.message,
        });
    }
});

router.patch("/applications/:id/status", async (req, res) => {
    try {
        const allowedStatuses = ["pending", "approved", "rejected"];

        if (!allowedStatuses.includes(req.body.status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid foster application status.",
            });
        }

        const application = await FosterApplication.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    status: req.body.status,
                    reviewedByName: req.body.adminName || "Admin User",
                    reviewedByEmail: req.body.adminEmail || "admin",
                    reviewNotes: req.body.reviewNotes || "",
                    reviewedAt: new Date(),
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!application) {
            return res.status(404).json({
                success: false,
                message: "Foster application not found.",
            });
        }

        await LedgerEntry.create({
            type: "foster",
            action: "foster_application_reviewed",
            actorName: req.body.adminName || "Admin User",
            actorEmail: req.body.adminEmail || "admin",
            targetType: "FosterApplication",
            targetId: application._id.toString(),
            description: `${application.applicantName}'s foster application was ${application.status}.`,
            status: application.status,
            metadata: {
                applicantEmail: application.applicantEmail,
                reviewNotes: application.reviewNotes,
            },
        });

        res.json({
            success: true,
            message: `Foster application ${application.status}.`,
            application,
        });
    } catch (error) {
        console.error("Update foster application status error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update foster application status.",
            error: error.message,
        });
    }
});

router.post("/assignments", async (req, res) => {
    try {
        const fosterEmail = String(req.body.fosterEmail || "")
            .trim()
            .toLowerCase();

        const approvedApplication = await FosterApplication.findOne({
            applicantEmail: fosterEmail,
            status: "approved",
        }).sort({ reviewedAt: -1, createdAt: -1 });

        if (!approvedApplication) {
            return res.status(400).json({
                success: false,
                message: "This foster caregiver is not approved yet.",
            });
        }

        const activeAssignmentsCount = await FosterAssignment.countDocuments({
            fosterEmail,
            status: "active",
        });

        if (activeAssignmentsCount >= approvedApplication.capacity) {
            return res.status(400).json({
                success: false,
                message: "This foster caregiver has already reached their foster capacity.",
            });
        }

        const assignment = await FosterAssignment.create({
            petName: req.body.petName,
            petBreed: req.body.petBreed || "",
            petImage: req.body.petImage || "",
            fosterName: req.body.fosterName || approvedApplication.applicantName,
            fosterEmail,
            fosterApplicationId: approvedApplication._id,
            shelterName: req.body.shelterName || "RescueBase Shelter",
            careInstructions:
                req.body.careInstructions ||
                "Provide food, water, shelter, and weekly updates.",
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
                fosterApplicationId: approvedApplication._id.toString(),
                fosterCapacity: approvedApplication.capacity,
            },
        });

        res.status(201).json({
            success : true,
            message : "Foster assignment created.",
            assignment,
        });
    } catch (error) {
        console.error("Create foster assignment error: ", error);

        res.status(500).json({
            success : false,
            message : "Failed to cerate foster assignment.",
            error : error.message,
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

router.patch("/assignments/:id", async (req, res) => {
    try {
        const currentAssignment = await FosterAssignment.findById(req.params.id);

        if (!currentAssignment) {
            return res.status(404).json({
                success: false,
                message: "Foster assignment not found",
            });
        }

        if (currentAssignment.status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Only in-progress foster assignments can be updated",
            });
        }

        const assignment = await FosterAssignment.findByIdAndUpdate(
            req.params.id,
            {
                $set: {
                    petName: req.body.petName,
                    petBreed: req.body.petBreed,
                    petImage: req.body.petImage,
                    fosterName: req.body.fosterName,
                    fosterEmail: String(req.body.fosterEmail || "")
                        .trim()
                        .toLowerCase(),
                    careInstructions: req.body.careInstructions,
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

        await LedgerEntry.create({
            type: "foster",
            action: "foster_assignment_updated",
            actorName: req.body.adminName || "Admin User",
            actorEmail: req.body.adminEmail || "admin",
            targetType: "FosterAssignment",
            targetId: assignment._id.toString(),
            description: `Foster assignment for ${assignment.petName} was updated.`,
            status: assignment.status,
            metadata: {
                petName: assignment.petName,
                fosterEmail: assignment.fosterEmail,
            },
        });

        res.json({
            success: true,
            message: "Foster assignment updated",
            assignment,
        });
    } catch (error) {
        console.error("Update foster assignment error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update foster assignment.",
            error: error.message,
        });
    }
});

router.delete("/assignments/:id", async (req, res) => {
    try {
        const assignment = await FosterAssignment.findById(req.params.id);

        if (!assignment) {
            return res.status(404).json({
                success: false,
                message: "Foster assignment not found.",
            });
        }

        if (assignment.status !== "active") {
            return res.status(400).json({
                success: false,
                message: "Only in-progress foster assignments can be deleted.",
            });
        }

        await LedgerEntry.create({
            type: "foster",
            action: "foster_assignment_deleted",
            actorName: req.body.adminName || "Admin User",
            actorEmail: req.body.adminEmail || "admin",
            targetType: "FosterAssignment",
            targetId: assignment._id.toString(),
            description: `In-progress foster assignment for ${assignment.petName} was deleted.`,
            status: "deleted",
            metadata: {
                petName: assignment.petName,
                fosterEmail: assignment.fosterEmail,
            },
        });

        await FosterAssignment.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: "Foster assignment deleted.",
        });
    } catch (error) {
        console.error("Delete foster assignment error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete foster assignment.",
            error: error.message,
        });
    }
});

module.exports = router;