const express = require("express");
const multer = require("multer");

const router = express.Router();

const asyncHandler = require("../middleware/asyncHandler");
const verifyToken = require("../middleware/verifyToken");

const uploadController = require(
    "../controllers/uploadController"
);

const upload = multer({
    storage: multer.memoryStorage(),

    limits: {
        fileSize: 5 * 1024 * 1024,
    },

    fileFilter: (
        req,
        file,
        cb
    ) => {
        if (
            !file.mimetype.startsWith(
                "image/"
            )
        ) {
            return cb(
                new Error(
                    "Only image files are allowed."
                )
            );
        }

        cb(null, true);
    },
});

router.post(
    "/image",
    verifyToken,
    upload.single("image"),
    asyncHandler(
        uploadController.uploadImage
    )
);

module.exports = router;