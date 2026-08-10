const multer = require("multer");
const streamifier = require("streamifier");

const cloudinary = require("../config/cloudinary");

function uploadToCloudinary(
    fileBuffer,
    folder = "rescuebase/uploads"
) {
    return new Promise((resolve, reject) => {
        const uploadStream =
            cloudinary.uploader.upload_stream(
                {
                    folder,
                    resource_type: "image",
                },
                (error, result) => {
                    if (error) {
                        reject(error);
                        return;
                    }

                    resolve(result);
                }
            );

        streamifier
            .createReadStream(fileBuffer)
            .pipe(uploadStream);
    });
}

exports.uploadImage = async (req, res) => {
    if (!req.file) {
        const error = new Error(
            "No image file uploaded."
        );

        error.statusCode = 400;
        throw error;
    }

    const folder =
        String(
            req.body.folder ||
            "rescuebase/uploads"
        ).trim();

    const result =
        await uploadToCloudinary(
            req.file.buffer,
            folder
        );

    return res.status(201).json({
        success: true,
        message:
            "Image uploaded successfully.",
        imageUrl: result.secure_url,
        publicId: result.public_id,
        folder,
    });
};