const express = require("express");
const router = express.Router();

const Animal = require("../models/Animal");

router.post("/", async (req, res) => {
    try {
        const animal = await Animal.create({
            name: req.body.name,
            type: req.body.type,
            breed: req.body.breed || "",
            age: Number(req.body.age || 0),
            gender: req.body.gender || "Unknown",
            size: req.body.size || "Unknown",
            color: req.body.color || "",
            image: req.body.image || "",
            description: req.body.description || "",
            medicalStatus: req.body.medicalStatus || "",
            behaviorNotes: req.body.behaviorNotes || "",
            intakeDate: req.body.intakeDate || Date.now(),
            intakeCondition: req.body.intakeCondition || "Unknown",
            availabilityStatus: req.body.availabilityStatus || "available",
            adoptionStatus: req.body.adoptionStatus || "available",
            fosterStatus: req.body.fosterStatus || "none",
            location: req.body.location || "RescueBase Shelter",
            createdByName: req.body.adminName || "Admin User",
            createdByEmail: req.body.adminEmail || "admin",
        });

        res.status(201).json({
            success: true,
            message: "Animal profile created successfully.",
            animal,
        });
    } catch (error) {
        console.error("Create animal error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to create animal profile.",
            error: error.message,
        });
    }
});

router.get("/", async (req, res) => {
    try {
        const filter = {};

        if (req.query.type) {
            filter.type = req.query.type;
        }

        if (req.query.availabilityStatus) {
            filter.availabilityStatus = req.query.availabilityStatus;
        }

        if (req.query.adoptionStatus) {
            filter.adoptionStatus = req.query.adoptionStatus;
        }

        if (req.query.fosterStatus) {
            filter.fosterStatus = req.query.fosterStatus;
        }

        const animals = await Animal.find(filter).sort({ createdAt: -1 });

        res.json({
            success: true,
            animals,
        });
    } catch (error) {
        console.error("Fetch animals error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch animals.",
            error: error.message,
        });
    }
});

router.get("/:id", async (req, res) => {
    try {
        const animal = await Animal.findById(req.params.id);

        if (!animal) {
            return res.status(404).json({
                success: false,
                message: "Animal profile not found.",
            });
        }

        res.json({
            success: true,
            animal,
        });
    } catch (error) {
        console.error("Fetch animal error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to fetch animal profile.",
            error: error.message,
        });
    }
});

router.patch("/:id", async (req, res) => {
    try {
        const allowedFields = [
            "name",
            "type",
            "breed",
            "age",
            "gender",
            "size",
            "color",
            "image",
            "description",
            "medicalStatus",
            "behaviorNotes",
            "intakeDate",
            "intakeCondition",
            "availabilityStatus",
            "adoptionStatus",
            "fosterStatus",
            "location",
        ];

        const allowedUpdates = {};

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                allowedUpdates[field] = req.body[field];
            }
        });

        if (allowedUpdates.age !== undefined) {
            allowedUpdates.age = Number(allowedUpdates.age || 0);
        }

        if (Object.keys(allowedUpdates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields provided for this update.",
            });
        }

        const animal = await Animal.findByIdAndUpdate(
            req.params.id,
            { $set: allowedUpdates },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!animal) {
            return res.status(404).json({
                success: false,
                message: "Animal profile not found.",
            });
        }

        res.json({
            success: true,
            message: "Animal profile updated successfully.",
            animal,
        });
    } catch (error) {
        console.error("Update animal error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to update animal profile.",
            error: error.message,
        });
    }
});

router.delete("/:id", async (req, res) => {
    try {
        const animal = await Animal.findByIdAndDelete(req.params.id);

        if (!animal) {
            return res.status(404).json({
                success: false,
                message: "Animal profile not found.",
            });
        }

        res.json({
            success: true,
            message: "Animal profile deleted successfully.",
        });
    } catch (error) {
        console.error("Delete animal error:", error);

        res.status(500).json({
            success: false,
            message: "Failed to delete animal profile.",
            error: error.message,
        });
    }
});

module.exports = router;