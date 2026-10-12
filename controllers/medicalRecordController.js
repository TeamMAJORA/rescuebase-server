const mongoose = require("mongoose");

const MedicalRecord = require("../models/MedicalRecord");
const Animal = require("../models/Animal");

function httpError(message, statusCode) {
    const error = new Error(message);
    error.statusCode = statusCode;
    return error;
}

// Checks the animal ID and that the animal exists
async function requireAnimal(animalId) {
    if (!mongoose.isValidObjectId(animalId)) {
        throw httpError("Valid animal ID is required.", 400);
    }

    const animal = await Animal.findById(animalId);

    if (!animal) {
        throw httpError("Animal not found.", 404);
    }

    return animal;
}

function requireId(id) {
    if (!mongoose.isValidObjectId(id)) {
        throw httpError("Invalid medical record ID.", 400);
    }
}

exports.getMedicalRecords = async (req, res) => {
    const records = await MedicalRecord.find()
        .populate("animal_id", "name type breed image")
        .sort({ record_date: -1, createdAt: -1 });

    return res.status(200).json({ success: true, records });
};

exports.createMedicalRecord = async (req, res) => {
    const animalId = String(req.body.animal_id || "").trim();
    const recordType = String(req.body.record_type || "").trim();
    const veterinarian = String(req.body.veterinarian || "").trim();
    const recordDate = req.body.record_date;
    const notes = String(req.body.notes || "").trim();

    if (!recordType) throw httpError("Record type is required.", 400);
    if (!veterinarian) throw httpError("Veterinarian is required.", 400);
    if (!recordDate) throw httpError("Record date is required.", 400);

    await requireAnimal(animalId);

    const record = await MedicalRecord.create({
        animal_id: animalId,
        record_type: recordType,
        veterinarian,
        record_date: recordDate,
        notes,
        recorded_by: req.user?.id || null,
    });

    await record.populate("animal_id", "name type breed image");

    return res.status(201).json({
        success: true,
        message: "Medical record created.",
        record,
    });
};

exports.updateMedicalRecord = async (req, res) => {
    const id = String(req.params.id || "").trim();
    requireId(id);

    const allowedFields = ["animal_id", "record_type", "veterinarian", "record_date", "notes"];
    const updates = {};

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updates[field] = typeof req.body[field] === "string"
                ? req.body[field].trim()
                : req.body[field];
        }
    }

    if (updates.animal_id !== undefined) await requireAnimal(updates.animal_id);
    if (updates.record_type === "") throw httpError("Record type cannot be empty.", 400);
    if (updates.veterinarian === "") throw httpError("Veterinarian cannot be empty.", 400);

    const record = await MedicalRecord.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
    ).populate("animal_id", "name type breed image");

    if (!record) throw httpError("Medical record not found.", 404);

    return res.status(200).json({
        success: true,
        message: "Medical record updated.",
        record,
    });
};

exports.deleteMedicalRecord = async (req, res) => {
    const id = String(req.params.id || "").trim();
    requireId(id);

    const record = await MedicalRecord.findByIdAndDelete(id);

    if (!record) throw httpError("Medical record not found.", 404);

    return res.status(200).json({
        success: true,
        message: "Medical record deleted.",
    });
};