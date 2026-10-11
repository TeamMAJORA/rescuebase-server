const mongoose = require("mongoose");

const VaccinationRecord =
    require("../models/VaccinationRecord");

const Animal =
    require("../models/Animal");


exports.createVaccination = async (
    req,
    res
) => {
    const animalId = String(
        req.body.animal_id || ""
    ).trim();

    const vaccineName = String(
        req.body.vaccine_name || ""
    ).trim();

    const vaccinationDate =
        req.body.vaccination_date;

    const nextDueDate =
        req.body.next_due_date;

    const veterinarian =
        req.body.veterinarian === null
            ? null
            : String(
                req.body.veterinarian ||
                    ""
            ).trim();

    if (
        !mongoose.isValidObjectId(
            animalId
        )
    ) {
        const error = new Error(
            "Valid animal ID is required."
        );

        error.statusCode = 400;
        throw error;
    }

    if (!vaccineName) {
        const error = new Error(
            "Vaccine name is required."
        );

        error.statusCode = 400;
        throw error;
    }

    if (!vaccinationDate) {
        const error = new Error(
            "Vaccination date is required."
        );

        error.statusCode = 400;
        throw error;
    }

    const animal =
        await Animal.findById(
            animalId
        );

    if (!animal) {
        const error = new Error(
            "Animal not found."
        );

        error.statusCode = 404;
        throw error;
    }

    const vaccination =
        await VaccinationRecord.create({
            animal_id: animal._id,

            vaccine_name:
                vaccineName,

            vaccination_date:
                vaccinationDate,

            next_due_date:
                nextDueDate || null,

            veterinarian:
                veterinarian || null,
        });

    await vaccination.populate(
        "animal_id",
        "name type breed image"
    );

    return res.status(201).json({
        success: true,

        message:
            "Vaccination record created.",

        vaccination,
    });
};


exports.getVaccinations = async (
    req,
    res
) => {
    const vaccinations =
        await VaccinationRecord.find()
            .populate(
                "animal_id",
                "name type breed image"
            )
            .sort({
                next_due_date: 1,
                vaccination_date: -1,
            });

    return res.status(200).json({
        success: true,
        vaccinations,
    });
};


exports.getVaccinationsByAnimal =
    async (req, res) => {
        const animalId = String(
            req.params.animalId || ""
        ).trim();

        if (
            !mongoose.isValidObjectId(
                animalId
            )
        ) {
            const error = new Error(
                "Invalid animal ID."
            );

            error.statusCode = 400;
            throw error;
        }

        const vaccinations =
            await VaccinationRecord.find({
                animal_id: animalId,
            })
                .populate(
                    "animal_id",
                    "name type breed image"
                )
                .sort({
                    vaccination_date: -1,
                });

        return res.status(200).json({
            success: true,
            vaccinations,
        });
    };


exports.getDueVaccinations =
    async (req, res) => {
        const days = Number(
            req.query.days || 7
        );

        if (
            !Number.isFinite(days) ||
            days < 0
        ) {
            const error = new Error(
                "Days must be a valid non-negative number."
            );

            error.statusCode = 400;
            throw error;
        }

        const now = new Date();

        const endDate = new Date(
            now.getTime() +
                days *
                    24 *
                    60 *
                    60 *
                    1000
        );

        const vaccinations =
            await VaccinationRecord.find({
                next_due_date: {
                    $ne: null,
                    $gte: now,
                    $lte: endDate,
                },
            })
                .populate(
                    "animal_id",
                    "name type breed image"
                )
                .sort({
                    next_due_date: 1,
                });

        return res.status(200).json({
            success: true,

            days,

            vaccinations,
        });
    };


exports.updateVaccination = async (
    req,
    res
) => {
    const vaccinationId =
        String(
            req.params.id || ""
        ).trim();

    if (
        !mongoose.isValidObjectId(
            vaccinationId
        )
    ) {
        const error = new Error(
            "Invalid vaccination record ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const allowedFields = [
        "animal_id",
        "vaccine_name",
        "vaccination_date",
        "next_due_date",
        "veterinarian",
    ];

    const updates = {};

    for (
        const field of allowedFields
    ) {
        if (
            req.body[field] !==
            undefined
        ) {
            updates[field] =
                req.body[field];
        }
    }

    if (
        updates.animal_id !==
        undefined
    ) {
        if (
            !mongoose.isValidObjectId(
                updates.animal_id
            )
        ) {
            const error = new Error(
                "Invalid animal ID."
            );

            error.statusCode = 400;
            throw error;
        }

        const animal =
            await Animal.findById(
                updates.animal_id
            );

        if (!animal) {
            const error = new Error(
                "Animal not found."
            );

            error.statusCode = 404;
            throw error;
        }
    }

    if (
        updates.vaccine_name !==
        undefined
    ) {
        updates.vaccine_name =
            String(
                updates.vaccine_name
            ).trim();

        if (
            !updates.vaccine_name
        ) {
            const error = new Error(
                "Vaccine name cannot be empty."
            );

            error.statusCode = 400;
            throw error;
        }
    }

    if (
        updates.veterinarian !==
        undefined
    ) {
        if (
            updates.veterinarian ===
            null
        ) {
            updates.veterinarian =
                null;
        } else {
            updates.veterinarian =
                String(
                    updates.veterinarian
                ).trim() || null;
        }
    }

    const vaccination =
        await VaccinationRecord.findByIdAndUpdate(
            vaccinationId,
            {
                $set: updates,
            },
            {
                new: true,
                runValidators: true,
            }
        ).populate(
            "animal_id",
            "name type breed image"
        );

    if (!vaccination) {
        const error = new Error(
            "Vaccination record not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,

        message:
            "Vaccination record updated.",

        vaccination,
    });
};


exports.deleteVaccination = async (
    req,
    res
) => {
    const vaccinationId =
        String(
            req.params.id || ""
        ).trim();

    if (
        !mongoose.isValidObjectId(
            vaccinationId
        )
    ) {
        const error = new Error(
            "Invalid vaccination record ID."
        );

        error.statusCode = 400;
        throw error;
    }

    const vaccination =
        await VaccinationRecord.findByIdAndDelete(
            vaccinationId
        );

    if (!vaccination) {
        const error = new Error(
            "Vaccination record not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,

        message:
            "Vaccination record deleted.",
    });
};