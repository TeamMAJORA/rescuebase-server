const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const AdoptionApplication = require("../models/AdoptionApplication");
const Animal = require("../models/Animal");
const LedgerEntry = require("../models/LedgerEntry");

async function createLedgerEntrySafely(data) {
    try {
        await LedgerEntry.create(data);
    } catch (error) {
        console.error("Adoption ledger error:", error);
    }
}

router.post("/", async (req, res) => {
    let reservedAnimal = null;

    try {
        const fullName = String(req.body.fullName || "").trim();
        const email = String(req.body.email || "").trim().toLowerCase();
        const animalId = String(req.body.animalId || "").trim();

        if (!fullName || !email || !animalId) {
            return res.status(400).json({
                success: false,
                message: "Full name, email, and animal are required.",
            });
        }

        if (!mongoose.isValidObjectId(animalId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid animal ID.",
            });
        }

        if (
            req.body.applicantUserId &&
            !mongoose.isValidObjectId(req.body.applicantUserId)
        ) {
            return res.status(400).json({
                success: false,
                message: "Invalid applicant user ID.",
            });
        }

        const existingPendingApplication =
            await AdoptionApplication.findOne({
                email,
                status: "pending",
            });

        if (existingPendingApplication) {
            return res.status(409).json({
                success: false,
                message:
                    "You already have a pending adoption application.",
            });
        }

        const animalExists = await Animal.findById(animalId);

        if (!animalExists) {
            return res.status(404).json({
                success: false,
                message: "Animal not found.",
            });
        }

        reservedAnimal = await Animal.findOneAndUpdate(
            {
                _id: animalId,
                availabilityStatus: "available",
                adoptionStatus: "available",
            },
            {
                $set: {
                    availabilityStatus: "unavailable",
                    adoptionStatus: "pending",
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!reservedAnimal) {
            return res.status(409).json({
                success: false,
                message:
                    "This animal is no longer available for adoption.",
            });
        }

        const documents = Array.isArray(req.body.documents)
            ? req.body.documents.map((document) => ({
                  documentName: String(
                      document.documentName || ""
                  ).trim(),
                  documentUrl: String(document.documentUrl || ""),
                  publicId: String(document.publicId || ""),
                  status: "pending",
              }))
            : [];

        const application = await AdoptionApplication.create({
            applicantUserId: req.body.applicantUserId || null,

            fullName,
            email,
            phone: String(req.body.phone || "").trim(),
            address: String(req.body.address || "").trim(),

            animalId: reservedAnimal._id,
            petName: reservedAnimal.name,
            petBreed: reservedAnimal.breed || "",
            petImage: reservedAnimal.image || "",

            homeType: String(req.body.homeType || "").trim(),
            hasChildren: String(req.body.hasChildren || "").trim(),
            hasOtherPets: String(req.body.hasOtherPets || "").trim(),

            reason: String(req.body.reason || "").trim(),
            experience: String(req.body.experience || "").trim(),

            documents,
            documentsVerified: false,

            role: "adopter",
            status: "pending",
        });

        await createLedgerEntrySafely({
            type: "adoption",
            action: "application_submitted",
            actorName: application.fullName,
            actorEmail: application.email,
            targetType: "AdoptionApplication",
            targetId: application._id.toString(),
            description: `${application.fullName} submitted an adoption application for ${application.petName}.`,
            status: "pending",
            metadata: {
                animalId: application.animalId.toString(),
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

        if (reservedAnimal?._id) {
            try {
                await Animal.findOneAndUpdate(
                    {
                        _id: reservedAnimal._id,
                        adoptionStatus: "pending",
                    },
                    {
                        $set: {
                            adoptionStatus: "available",
                            availabilityStatus: "available",
                        },
                    }
                );
            } catch (rollbackError) {
                console.error(
                    "Animal reservation rollback error:",
                    rollbackError
                );
            }
        }

        res.status(500).json({
            success: false,
            message: "Failed to submit adoption application.",
            error: error.message,
        });
    }
});

router.get("/", async (req, res) => {
    try {
        const applications = await AdoptionApplication.find()
            .populate(
                "animalId",
                "name type breed age gender size image availabilityStatus adoptionStatus"
            )
            .sort({
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
            message: "Failed to fetch adoption applications.",
            error: error.message,
        });
    }
});

router.get("/user/:email/latest", async (req, res) => {
    try {
        const email = decodeURIComponent(req.params.email)
            .trim()
            .toLowerCase();

        const application = await AdoptionApplication.findOne({
            email,
        })
            .populate(
                "animalId",
                "name type breed age gender size image availabilityStatus adoptionStatus"
            )
            .sort({
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
            message: "Failed to fetch adoption application.",
            error: error.message,
        });
    }
});

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