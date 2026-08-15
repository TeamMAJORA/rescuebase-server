const mongoose = require("mongoose");
const Animal = require("../models/Animal");
const User = require("../models/User");
const Notification = require("../models/Notifications");

exports.createAnimal = async (req, res) => {
    const name = String(req.body.name || "").trim();
    const type = String(req.body.type || "").trim();

    if (!name) {
        const error = new Error("Animal name is required.");
        error.statusCode = 400;
        throw error;
    }

    if (!type) {
        const error = new Error("Animal type is required.");
        error.statusCode = 400;
        throw error;
    }

    const age = Number(req.body.age || 0);

    if (Number.isNaN(age) || age < 0) {
        const e = new Error("Invalid animal age.");
        e.statusCode = 400;
        throw e;
    }

    const adminId = req.user?.id;
    const adminEmail = String(req.user?.email || "").trim().toLowerCase();

    if (!adminId || !adminEmail) {
        const e = new Error("Auth admin info is missing.");
        e.statusCode = 401;
        throw e;
    }

    const adminUser = await User.findById(adminId).select("name username email role");

    if (!adminUser) {
        const e = new Error("Auth admin account was not found");
        e.statusCode = 401;
        throw e;
    }

    const adminName = String(adminUser.name || adminUser.username || "Admin User").trim();

    const animal = await Animal.create({
        name,
        type,

        breed: String(req.body.breed || "").trim(),

        age,
        gender: String(req.body.gender || "Unknown").trim(),
        size: String(req.body.size || "Unknown").trim(),
        color: String(req.body.color || "").trim(),
        image: String(req.body.image || "").trim(),
        description: String(req.body.description || "").trim(),
        medicalStatus: String(req.body.medicalStatus || "").trim(),
        behaviorNotes: String(req.body.behaviorNotes || "").trim(),
        intakeDate: req.body.intakeDate || Date.now(),
        intakeCondition: String(req.body.intakeCondition || "Unknown").trim(),
        availabilityStatus: req.body.availabilityStatus || "available",
        adoptionStatus: req.body.adoptionStatus || "available",
        fosterStatus: req.body.fosterStatus || "none",
        location: String(req.body.location || "RescueBase Shelter").trim(),
        createdByName: adminName,
        createdByEmail: adminEmail,
    });

    if (animal.availabilityStatus === "available" && animal.adoptionStatus === "available") {
        const adopters = await User.find({
            role: "adopter",
        }).select("_id");

        if (adopters.length > 0) {
            await Notification.insertMany(
                adopters.map((adopter) => ({
                    user: adopter._id,
                    title: "New Pet Available for Adoption",
                    message: `${animal.name} is now available for adoption at RescueBase.`,
                    type: "adoption_update",
                }))
            )
        }
    }

    return res.status(201).json({
        success: true,
        message: "Animal profile created successfully.",
        animal,
    });
};

exports.getAllAnimals = async (req, res) => {
    const filter = {};

    if (req.query.type) {
        filter.type = String(req.query.type).trim();
    }

    if (req.query.availabilityStatus) {
        filter.availabilityStatus =
            String(req.query.availabilityStatus).trim();
    }

    if (req.query.adoptionStatus) {
        filter.adoptionStatus =
            String(req.query.adoptionStatus).trim();
    }

    if (req.query.fosterStatus) {
        filter.fosterStatus =
            String(req.query.fosterStatus).trim();
    }

    const animals = await Animal.find(filter)
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        animals,
    });
};

exports.getAnimalById = async (req, res) => {
    const animalId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(animalId)) {
        const error = new Error(
            "Invalid animal ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const animal = await Animal.findById(
        animalId
    );

    if (!animal) {
        const error = new Error(
            "Animal profile not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        animal,
    });
};

exports.updateAnimal = async (req, res) => {
    const animalId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(animalId)) {
        const error = new Error(
            "Invalid animal ID."
        );

        error.statusCode = 400;
        throw error;
    }

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

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            allowedUpdates[field] =
                req.body[field];
        }
    }

    if (allowedUpdates.age !== undefined) {
        const age = Number(
            allowedUpdates.age
        );

        if (Number.isNaN(age) || age < 0) {
            const error = new Error(
                "Invalid animal age."
            );

            error.statusCode = 400;
            throw error;
        }

        allowedUpdates.age = age;
    }

    if (
        allowedUpdates.name !== undefined
    ) {
        allowedUpdates.name =
            String(
                allowedUpdates.name
            ).trim();
    }

    if (
        allowedUpdates.type !== undefined
    ) {
        allowedUpdates.type =
            String(
                allowedUpdates.type
            ).trim();
    }

    if (
        Object.keys(allowedUpdates).length === 0
    ) {
        const error = new Error(
            "No valid fields provided for this update."
        );

        error.statusCode = 400;
        throw error;
    }

    const animal =
        await Animal.findByIdAndUpdate(
            animalId,
            {
                $set: allowedUpdates,
            },
            {
                new: true,
                runValidators: true,
            }
        );

    if (!animal) {
        const error = new Error(
            "Animal profile not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        message:
            "Animal profile updated successfully.",
        animal,
    });
};

exports.deleteAnimal = async (req, res) => {
    const animalId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(animalId)) {
        const error = new Error(
            "Invalid animal ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const animal =
        await Animal.findByIdAndDelete(
            animalId
        );

    if (!animal) {
        const error = new Error(
            "Animal profile not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        message:
            "Animal profile deleted successfully.",
    });
};