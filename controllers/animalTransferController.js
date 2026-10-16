const mongoose = require("mongoose");

const AnimalTransfer = require("../models/AnimalTransfer");
const Animal = require("../models/Animal");

const STATUSES = ["Pending", "In Transit", "Completed", "Cancelled"];

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
        throw httpError("Invalid transfer ID.", 400);
    }
}

exports.getTransfers = async (req, res) => {
    const transfers = await AnimalTransfer.find()
        .populate("animal_id", "name type breed image")
        .sort({ transfer_date: -1, createdAt: -1 });

    return res.status(200).json({ success: true, transfers });
};

exports.createTransfer = async (req, res) => {
    const animalId = String(req.body.animal_id || "").trim();
    const fromLocation = String(req.body.from_location || "").trim();
    const toLocation = String(req.body.to_location || "").trim();
    const transferDate = req.body.transfer_date;
    const reason = String(req.body.reason || "").trim();
    const status = req.body.status || "Pending";

    if (!fromLocation) throw httpError("From location is required.", 400);
    if (!toLocation) throw httpError("To location is required.", 400);
    if (!transferDate) throw httpError("Transfer date is required.", 400);
    if (!reason) throw httpError("Reason is required.", 400);
    if (!STATUSES.includes(status)) throw httpError("Invalid transfer status.", 400);

    await requireAnimal(animalId);

    const transfer = await AnimalTransfer.create({
        animal_id: animalId,
        from_location: fromLocation,
        to_location: toLocation,
        transfer_date: transferDate,
        reason,
        status,
        recorded_by: req.user?.id || null,
    });

    await transfer.populate("animal_id", "name type breed image");

    return res.status(201).json({
        success: true,
        message: "Transfer created.",
        transfer,
    });
};

exports.updateTransfer = async (req, res) => {
    const id = String(req.params.id || "").trim();
    requireId(id);

    const allowedFields = ["animal_id", "from_location", "to_location", "transfer_date", "reason", "status"];
    const updates = {};

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updates[field] = typeof req.body[field] === "string"
                ? req.body[field].trim()
                : req.body[field];
        }
    }

    if (updates.animal_id !== undefined) await requireAnimal(updates.animal_id);
    if (updates.status !== undefined && !STATUSES.includes(updates.status)) {
        throw httpError("Invalid transfer status.", 400);
    }

    for (const field of ["from_location", "to_location", "reason"]) {
        if (updates[field] === "") throw httpError(`${field.replace("_", " ")} cannot be empty.`, 400);
    }

    const transfer = await AnimalTransfer.findByIdAndUpdate(
        id,
        { $set: updates },
        { returnDocument: "after", runValidators: true }
    ).populate("animal_id", "name type breed image");

    if (!transfer) throw httpError("Transfer not found.", 404);

    return res.status(200).json({
        success: true,
        message: "Transfer updated.",
        transfer,
    });
};

exports.deleteTransfer = async (req, res) => {
    const id = String(req.params.id || "").trim();
    requireId(id);

    const transfer = await AnimalTransfer.findByIdAndDelete(id);

    if (!transfer) throw httpError("Transfer not found.", 404);

    return res.status(200).json({
        success: true,
        message: "Transfer deleted.",
    });
};