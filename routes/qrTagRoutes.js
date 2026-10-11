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
    authorizeRoles("admin", "staff"),//updated to allow staff to view qr tags
    asyncHandler(
        qrTagController.getAllQRTags
    )
);

router.post(
    "/generate",
    verifyToken,
    authorizeRoles("admin", "staff"),
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
    authorizeRoles("admin", "staff"),
    asyncHandler(
        qrTagController.regenerateQRTag
    )
);

router.delete(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(
        qrTagController.deleteQRTag
    )
);


module.exports = router;