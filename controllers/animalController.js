const mongoose = require("mongoose");
const Animal = require("../models/Animal");
const User = require("../models/User");
const Notification = require("../models/Notifications");
const {
    sendPetAvailableEmail,
} = require("../services/emailService");

async function notifyAdoptersAboutAnimal(animal) {
    const adopters = await User.find({
        role: "adopter",
    }).select("_id email");

    if (!adopters.length) {
        return;
    }

    await Notification.insertMany(
        adopters.map((adopter) => ({
            user: adopter._id,
            title: "New Pet Available for Adoption",
            message:
                `${animal.name} is now available for adoption at RescueBase.`,
            type: "adoption_update",
        }))
    );

    await Promise.all(
        adopters
            .filter((adopter) => adopter.email)
            .map((adopter) =>
                sendPetAvailableEmail(
                    adopter.email,
                    animal.name,
                    animal.type
                )
            )
    );
}

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
        const error = new Error("Invalid animal age.");
        error.statusCode = 400;
        throw error;
    }

    const adminId = req.user?.id;
    const adminEmail = String(
        req.user?.email || ""
    ).trim().toLowerCase();

    if (!adminId || !adminEmail) {
        const error = new Error("Auth admin info is missing.");
        error.statusCode = 401;
        throw error;
    }

    const adminUser = await User.findById(adminId).select(
        "name username email role"
    );

    if (!adminUser) {
        const error = new Error(
            "Auth admin account was not found."
        );
        error.statusCode = 401;
        throw error;
    }

    const adminName = String(
        adminUser.name ||
        adminUser.username ||
        "Admin User"
    ).trim();

    const animal = await Animal.create({
        name,
        type,
        breed: String(req.body.breed || "").trim(),
        age,
        gender: String(
            req.body.gender || "Unknown"
        ).trim(),
        size: String(
            req.body.size || "Unknown"
        ).trim(),
        color: String(req.body.color || "").trim(),
        image: String(req.body.image || "").trim(),
        description: String(
            req.body.description || ""
        ).trim(),
        medicalStatus: String(
            req.body.medicalStatus || ""
        ).trim(),
        behaviorNotes: String(
            req.body.behaviorNotes || ""
        ).trim(),
        energyLevel: req.body.energyLevel ?? null,
        friendliness: req.body.friendliness ?? null,
        humanSociability: req.body.humanSociability ?? null,
        animalSociability: req.body.animalSociability ?? null,
        trainability: req.body.trainability ?? null,
        anxietyLevel: req.body.anxietyLevel ?? null,
        aggressionLevel: req.body.aggressionLevel ?? null,
        activityLevel: req.body.activityLevel ?? null,
        intakeDate: req.body.intakeDate || Date.now(),
        intakeCondition: String(
            req.body.intakeCondition || "Unknown"
        ).trim(),
        intakeType: String(
            req.body.intakeType || "Rescued"
        ).trim(),
        rescuedBy: String(
            req.body.rescuedBy || ""
        ).trim(),
        intakeStatus: "pending",
        availabilityStatus: "unavailable",
        adoptionStatus: "available",
        fosterStatus: String(
            req.body.fosterStatus || "none"
        ).trim(),
        location: String(
            req.body.location || "RescueBase Shelter"
        ).trim(),
        latitude: req.body.latitude ?? null,
        longitude: req.body.longitude ?? null,
        rejectionReason: "",
        createdByName: adminName,
        createdByEmail: adminEmail,
    });

    return res.status(201).json({
        success: true,
        message:
            "Animal intake record created and submitted for review.",
        animal,
    });
};

exports.getAllAnimals = async (req, res) => {
    const filter = {};

    if (req.query.type) {
        filter.type = String(req.query.type).trim();
    }

    if (req.query.availabilityStatus) {
        filter.availabilityStatus = String(
            req.query.availabilityStatus
        ).trim();
    }

    if (req.query.adoptionStatus) {
        filter.adoptionStatus = String(
            req.query.adoptionStatus
        ).trim();
    }

    if (req.query.fosterStatus) {
        filter.fosterStatus = String(
            req.query.fosterStatus
        ).trim();
    }

    if (req.query.intakeStatus) {
        filter.intakeStatus = String(
            req.query.intakeStatus
        ).trim();
    } else {
        filter.$or = [
            {
                intakeStatus: "approved",
            },
            {
                intakeStatus: {
                    $exists: false,
                },
            },
        ];
    }

    const animals = await Animal.find(filter).sort({
        createdAt: -1,
    });

    return res.status(200).json({
        success: true,
        animals,
    });
};

exports.getPendingIntakes = async (req, res) => {
    const intakes = await Animal.find({
        intakeStatus: "pending",
    }).sort({
        createdAt: -1,
    });

    return res.status(200).json({
        success: true,
        intakes,
    });
};

exports.getAnimalById = async (req, res) => {
    const animalId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(animalId)) {
        const error = new Error("Invalid animal ID.");
        error.statusCode = 400;
        throw error;
    }

    const animal = await Animal.findById(animalId);

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

exports.approveIntake = async (req, res) => {
    const animalId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(animalId)) {
        const error = new Error("Invalid animal ID.");
        error.statusCode = 400;
        throw error;
    }

    const animal = await Animal.findById(animalId);

    if (!animal) {
        const error = new Error(
            "Animal profile not found."
        );
        error.statusCode = 404;
        throw error;
    }

    if (animal.intakeStatus === "approved") {
        const error = new Error(
            "This intake is already approved."
        );
        error.statusCode = 400;
        throw error;
    }

    animal.intakeStatus = "approved";
    animal.availabilityStatus = "available";
    animal.adoptionStatus = "available";
    animal.rejectionReason = "";

    await animal.save();

    await notifyAdoptersAboutAnimal(animal);

    return res.status(200).json({
        success: true,
        message:
            "Animal intake approved successfully.",
        animal,
    });
};

exports.rejectIntake = async (req, res) => {
    const animalId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(animalId)) {
        const error = new Error("Invalid animal ID.");
        error.statusCode = 400;
        throw error;
    }

    const reason = String(
        req.body.reason ||
        req.body.rejectionReason ||
        ""
    ).trim();

    if (!reason) {
        const error = new Error(
            "A rejection reason is required."
        );
        error.statusCode = 400;
        throw error;
    }

    const animal = await Animal.findById(animalId);

    if (!animal) {
        const error = new Error(
            "Animal profile not found."
        );
        error.statusCode = 404;
        throw error;
    }

    animal.intakeStatus = "rejected";
    animal.availabilityStatus = "unavailable";
    animal.rejectionReason = reason;

    await animal.save();

    return res.status(200).json({
        success: true,
        message: "Animal intake rejected.",
        animal,
    });
};

exports.updateAnimal = async (req, res) => {
    const animalId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(animalId)) {
        const error = new Error("Invalid animal ID.");
        error.statusCode = 400;
        throw error;
    }

    const existingAnimal = await Animal.findById(animalId);

    if (!existingAnimal) {
        const error = new Error(
            "Animal profile not found."
        );
        error.statusCode = 404;
        throw error;
    }

    const wasAvailable =
        existingAnimal.intakeStatus === "approved" &&
        existingAnimal.availabilityStatus === "available" &&
        existingAnimal.adoptionStatus === "available";

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
        "energyLevel",
        "friendliness",
        "humanSociability",
        "animalSociability",
        "trainability",
        "anxietyLevel",
        "aggressionLevel",
        "activityLevel",
        "intakeDate",
        "intakeCondition",
        "intakeType",
        "rescuedBy",
        "availabilityStatus",
        "adoptionStatus",
        "fosterStatus",
        "location",
    ];

    const allowedUpdates = {};

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            allowedUpdates[field] = req.body[field];
        }
    }

    if (allowedUpdates.age !== undefined) {
        const age = Number(allowedUpdates.age);

        if (Number.isNaN(age) || age < 0) {
            const error = new Error(
                "Invalid animal age."
            );
            error.statusCode = 400;
            throw error;
        }

        allowedUpdates.age = age;
    }

    if (allowedUpdates.name !== undefined) {
        allowedUpdates.name = String(
            allowedUpdates.name
        ).trim();
    }

    if (allowedUpdates.type !== undefined) {
        allowedUpdates.type = String(
            allowedUpdates.type
        ).trim();
    }

    if (allowedUpdates.intakeType !== undefined) {
        allowedUpdates.intakeType = String(
            allowedUpdates.intakeType
        ).trim();
    }

    if (allowedUpdates.rescuedBy !== undefined) {
        allowedUpdates.rescuedBy = String(
            allowedUpdates.rescuedBy
        ).trim();
    }

    if (Object.keys(allowedUpdates).length === 0) {
        const error = new Error(
            "No valid fields provided for this update."
        );
        error.statusCode = 400;
        throw error;
    }

    const animal = await Animal.findByIdAndUpdate(
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

    const isAvailable =
        animal.intakeStatus === "approved" &&
        animal.availabilityStatus === "available" &&
        animal.adoptionStatus === "available";

    if (!wasAvailable && isAvailable) {
        await notifyAdoptersAboutAnimal(animal);
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
        const error = new Error("Invalid animal ID.");
        error.statusCode = 400;
        throw error;
    }

    const animal = await Animal.findByIdAndDelete(
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