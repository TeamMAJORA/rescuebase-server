const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const AdoptionApplication = require("../models/AdoptionApplication");
const Animal = require("../models/Animal");
const LedgerEntry = require("../models/LedgerEntry");

const adoptionController = require("../controllers/adoptionController");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validateRequest");
const verifyToken = require("../middleware/verifyToken");
const authoriseRoles = require("../middleware/authoriseRoles");

router.post("/", 
    verifyToken,
    authoriseRoles("adopter"),
    validateRequest([
        "fullName",
        "animalId",
    ]),
    asyncHandler(
        adoptionController.submitApplication
    )
);

router.get("/", 
    verifyToken,
    authoriseRoles(
        "admin",
        "staff",
    ),
    asyncHandler(adoptionController.getAllApplications)
);

router.get("/user/latest",
    verifyToken,
    authoriseRoles("adopter"),

    asyncHandler(adoptionController.getLatestUserApplication)
);

router.patch("/:id/status", async (req, res) => {
    try {
        const status = String(req.body.status || "")
            .trim()
            .toLowerCase();

        const adminName = String(
            req.body.adminName || "Admin User"
        ).trim();

        const adminEmail = String(
            req.body.adminEmail || "admin"
        )
            .trim()
            .toLowerCase();

        const reviewNotes = String(
            req.body.reviewNotes || ""
        ).trim();

        const rejectionReason = String(
            req.body.rejectionReason || ""
        ).trim();

        if (!["pending", "approved", "rejected"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Invalid application status.",
            });
        }

        const application =
            await AdoptionApplication.findById(req.params.id);

        if (!application) {
            return res.status(404).json({
                success: false,
                message: "Application not found.",
            });
        }

        if (!application.animalId) {
            return res.status(400).json({
                success: false,
                message:
                    "This application is not connected to an animal record.",
            });
        }

        if (
            application.status !== "pending" &&
            application.status !== status
        ) {
            return res.status(409).json({
                success: false,
                message: `This application has already been ${application.status}.`,
            });
        }

        const animal = await Animal.findById(application.animalId);

        if (!animal) {
            return res.status(404).json({
                success: false,
                message: "Connected animal record not found.",
            });
        }

        if (status === "approved") {
            animal.adoptionStatus = "adopted";
            animal.availabilityStatus = "unavailable";

            await animal.save();

            await AdoptionApplication.updateMany(
                {
                    _id: {
                        $ne: application._id,
                    },
                    animalId: application.animalId,
                    status: "pending",
                },
                {
                    $set: {
                        status: "rejected",
                        reviewedByName: adminName,
                        reviewedByEmail: adminEmail,
                        reviewNotes:
                            "Another adoption application was approved.",
                        rejectionReason:
                            "The animal has already been adopted.",
                        reviewedAt: new Date(),
                    },
                }
            );
        }

        if (status === "rejected") {
            const anotherPendingApplication =
                await AdoptionApplication.exists({
                    _id: {
                        $ne: application._id,
                    },
                    animalId: application.animalId,
                    status: "pending",
                });

            if (anotherPendingApplication) {
                animal.adoptionStatus = "pending";
                animal.availabilityStatus = "unavailable";
            } else {
                animal.adoptionStatus = "available";
                animal.availabilityStatus = "available";
            }

            await animal.save();
        }

        if (status === "pending") {
            animal.adoptionStatus = "pending";
            animal.availabilityStatus = "unavailable";

            await animal.save();
        }

        application.status = status;
        application.reviewedByName = adminName;
        application.reviewedByEmail = adminEmail;
        application.reviewNotes = reviewNotes;

        application.rejectionReason =
            status === "rejected" ? rejectionReason : "";

        application.reviewedAt =
            status === "pending" ? null : new Date();

        if (status === "approved") {
            application.interviewSchedule =
                req.body.interviewSchedule || null;
        } else {
            application.interviewSchedule = null;
        }

        await application.save();

        await application.populate(
            "animalId",
            "name type breed age gender size image availabilityStatus adoptionStatus"
        );

        await createLedgerEntrySafely({
            type: "adoption",
            action: `application_${status}`,
            actorName: adminName,
            actorEmail: adminEmail,
            targetType: "AdoptionApplication",
            targetId: application._id.toString(),
            description: `Admin ${status} the adoption application of ${application.fullName} for ${application.petName}.`,
            status,
            metadata: {
                animalId: String(application.animalId?._id || ""),
                petName: application.petName,
                petBreed: application.petBreed,
                applicantEmail: application.email,
                rejectionReason:
                    status === "rejected" ? rejectionReason : "",
                interviewSchedule:
                    status === "approved"
                        ? application.interviewSchedule
                        : null,
            },
        });

        res.json({
            success: true,
            message: `Application ${status} successfully.`,
            application,
            animal,
        });
    } catch (error) {
        console.error("Update adoption status error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update application status.",
            error: error.message,
        });
    }
});

module.exports = router;