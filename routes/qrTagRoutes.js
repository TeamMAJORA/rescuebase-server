const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");
const qrTagController = require(
    "../controllers/qrTagController"
);


router.get(
    "/",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        qrTagController.getAllQRTags
    )
);

router.post(
    "/generate",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        qrTagController.generateQRTag
    )
);

router.get(
    "/lookup/:tagCode",
    asyncHandler(
        qrTagController.lookupQRTag
    )
);

router.post(
    "/:id/regenerate",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        qrTagController.regenerateQRTag
    )
);

router.delete(
    "/:id",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        qrTagController.deleteQRTag
    )
);


module.exports = router;