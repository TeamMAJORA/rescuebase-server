const express = require("express");
const multer = require("multer");
const streamifier = require("streamifier");

const cloudinary = require("../config/cloudinary");

const router = express.Router();

const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 5 * 1024 * 1024,
    },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("Only image files are allowed."));
        }

        cb(null, true);
    }
});

function uploadtoCloudinary(fileBuffer, folder = "rescuebase/uploads") {
    return new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream({
            folder,
            resource_type: "image",
        }, (error, result) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(result);
        });

        streamifier
            .createReadStream(fileBuffer)
            .pipe(uploadStream);
    });
}

router.post("/image", upload.single("image"), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: "No image file uploaded",
            });
        }

        const folder =
            req.body.folder ||
            "rescuebase/uploads";

        const result = await uploadtoCloudinary(
            req.file.buffer,
            folder
        );

        res.status(201).json({
            success : true, 
            message : "Image uploaded successfully.",
            imageUrl: result.secure_url,
            publicId: result.public_id,
            folder,
        });
    } catch (error) {
        console.error(
            "Upload image error",
            error
        );

        res.status(500).json({
            success: false,
            message: "Failed to upload image.",
            error: error.message,
        });
    }
});

module.exports = router;