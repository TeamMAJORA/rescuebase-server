const mongoose = require("mongoose");

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

exports.submitApplication = async (req, res) => {
    const animalId = String(req.body.animalId || "").trim();

    if (!mongoose.isValidObjectId(animalId)) {
        const error = new Error("Invalid Animal ID.");
        error.statusCode = 400;
        throw error;
    }

    const applicantUserId = req.user?.id;
    const email = String(req.user?.email || "").trim().toLowerCase();

    if (!applicantUserId || !email) {
        const error = new Error("Authenticated applicant inform is missing.");
        error.statusCode = 401;
        throw error;
    }

    const fullName = String(req.body.fullName || "").trim();

    if (!fullName) {
        const error = new Error("Full name is required.");
        error.statusCode = 400;
        throw error;
    }

    const existingPendingApplication = await AdoptionApplication.findOne({
        email,
        status: "pending",
    });

    if (existingPendingApplication) {
        const error = new Error("You already have a pending adoption application.");
        error.statusCode = 409;
        throw error;
    }

    const animalExists = await Animal.exists({ _id: animalId, });

    if (!animalExists) {
        const error = new Error("Animal not found.");
        error.statusCode = 404;
        throw error;
    }

    const reservedAnimal = await Animal.findOneAndUpdate(
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
        const error = new Error("This animal is no longer available for option.");
        error.statusCode = 409;
        throw error;
    }

    let applicationCreated = false;

    try {
        const documents = Array.isArray(req.body.documents)
            ? req.body.documents.map(
                (document) => ({
                    documentName: String(document?.documentName || "").trim(),

                    documentUrl: String(document?.documentUrl || ""),

                    publicId: String(document?.publicId || ""),

                    status: "pending",
                })
            )
            : [];

        const application = await AdoptionApplication.create({
            applicantUserId,
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

        applicationCreated = true;

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

        return res.status(201).json({
            success: true,
            message: "Adoption application submitted.",
            application,
        });
    } catch (error) {
        if (!applicationCreated) {
            try {
                await Animal.findOneAndUpdate(
                    {
                        _id:
                            reservedAnimal._id,

                        adoptionStatus:
                            "pending",
                    },
                    {
                        $set: {
                            adoptionStatus:
                                "available",

                            availabilityStatus:
                                "available",
                        },
                    },
                );
            } catch (rollbackError) {
                console.error("Animal reservation rollback error.");
                rollbackError
            }
        }
        throw error;
    }
};

exports.getAllApplications = async (req, res) => {
    const applications = (await AdoptionApplication.find()).sort({ createdAt: -1 });
    return res.status(200).json({
        success: true,
        applications,
    });
};

exports.getLatestUserApplication = async (req, res) => {
    const email = String(req.user?.email || "").trim().toLowerCase();

    if (!email) {
        const error = new Error("Authenticated user email is missing");
        error.statusCode = 401;
        throw error;
    }

    const application = await AdoptionApplication.findOne({ email })
        .populate(
            "animalId",
            "name type breed age gender size image availabilityStatus adoptionStatus"
        )
        .sort({
            createdAt: -1,
        });

    return res.status(200).json({
        success: true,
        application,
    });
};
