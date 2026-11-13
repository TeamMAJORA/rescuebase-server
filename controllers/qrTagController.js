const mongoose = require("mongoose");
const QRCode = require("qrcode");

const QRTag = require("../models/QRTag");
const Animal = require("../models/Animal");

// Scanning a tag with any phone camera opens the public pet page: <website>/pet/<tagCode>
// CLIENT_URL can list several sites for CORS ("https://rescue-base.vercel.app,http://localhost:5173");
// the QR link uses the first one, so put the live site first.
function petProfileUrl(tagCode) {
    const website = String(process.env.CLIENT_URL || "http://localhost:5173").split(",")[0].trim().replace(/\/+$/, "");
    return `${website}/pet/${encodeURIComponent(tagCode)}`;
}

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

    // Older tags stored JSON; rebuild them as the pet-page link (same tag code, so nothing breaks)
    for (const qrTag of qrTags) {
        const link = petProfileUrl(qrTag.tagCode);
        if (qrTag.qrData !== link) {
            qrTag.qrData = link;
            qrTag.qrImageUrl = await QRCode.toDataURL(link);
            // updateOne, not save(): a tag whose animal was deleted would fail validation
            await QRTag.updateOne(
                { _id: qrTag._id },
                { $set: { qrData: qrTag.qrData, qrImageUrl: qrTag.qrImageUrl } }
            );
        }
    }

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

    const qrData = petProfileUrl(tagCode);

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

    const qrData = petProfileUrl(tagCode);

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