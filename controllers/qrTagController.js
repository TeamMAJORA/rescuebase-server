const mongoose = require("mongoose");
const QRCode = require("qrcode");

const QRTag = require("../models/QRTag");
const Animal = require("../models/Animal");

function createTagCode() {
    const randomPart = Math.random()
        .toString(36)
        .substring(2, 8)
        .toUpperCase();

    return `RB-${Date.now()}-${randomPart}`;
}

exports.getAllQRTags = async (req, res) => {
    const qrTags = await QRTag.find()
        .populate("animal")
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        qrTags,
    });
};

exports.generateQRTag = async (req, res) => {
    const animalId = String(
        req.body.animalId || ""
    ).trim();

    if (!mongoose.isValidObjectId(animalId)) {
        const error = new Error("Invalid animal ID.");
        error.statusCode = 400;
        throw error;
    }

    const animal = await Animal.findById(animalId);

    if (!animal) {
        const error = new Error("Animal not found.");
        error.statusCode = 404;
        throw error;
    }

    const existingTag = await QRTag.findOne({
        animal: animalId,
    });

    if (existingTag) {
        const error = new Error(
            "This animal already has a QR tag."
        );

        error.statusCode = 409;
        throw error;
    }

    const tagCode = createTagCode();

    const qrData = JSON.stringify({
        tagCode,
        animalId: animal._id.toString(),
    });

    const qrImageUrl = await QRCode.toDataURL(qrData);

    const qrTag = await QRTag.create({
        animal: animal._id,
        tagCode,
        qrData,
        qrImageUrl,
        createdBy: req.user?.id || null,
    });

    await qrTag.populate("animal");

    return res.status(201).json({
        success: true,
        message: "QR tag generated successfully.",
        qrTag,
    });
};

exports.lookupQRTag = async (req, res) => {
    const tagCode = String(
        req.params.tagCode || ""
    ).trim();

    if (!tagCode) {
        const error = new Error("QR tag code is required.");
        error.statusCode = 400;
        throw error;
    }

    const qrTag = await QRTag.findOne({
        tagCode,
    }).populate("animal");

    if (!qrTag || !qrTag.animal) {
        const error = new Error(
            "QR tag or linked animal was not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        qrTag,
        animal: qrTag.animal,
    });
};

exports.regenerateQRTag = async (req, res) => {
    const qrTagId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(qrTagId)) {
        const error = new Error("Invalid QR tag ID.");
        error.statusCode = 400;
        throw error;
    }

    const qrTag = await QRTag.findById(qrTagId);

    if (!qrTag) {
        const error = new Error("QR tag not found.");
        error.statusCode = 404;
        throw error;
    }

    const tagCode = createTagCode();

    const qrData = JSON.stringify({
        tagCode,
        animalId: qrTag.animal.toString(),
    });

    const qrImageUrl = await QRCode.toDataURL(qrData);

    qrTag.tagCode = tagCode;
    qrTag.qrData = qrData;
    qrTag.qrImageUrl = qrImageUrl;

    await qrTag.save();
    await qrTag.populate("animal");

    return res.status(200).json({
        success: true,
        message: "QR tag regenerated successfully.",
        qrTag,
    });
};

exports.deleteQRTag = async (req, res) => {
    const qrTagId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(qrTagId)) {
        const error = new Error("Invalid QR tag ID.");
        error.statusCode = 400;
        throw error;
    }

    const qrTag = await QRTag.findByIdAndDelete(qrTagId);

    if (!qrTag) {
        const error = new Error("QR tag not found.");
        error.statusCode = 404;
        throw error;
    }

    return res.status(200).json({
        success: true,
        message: "QR tag deleted successfully.",
    });
};