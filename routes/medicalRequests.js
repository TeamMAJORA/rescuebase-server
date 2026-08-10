const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const medicalRequestController = require(
    "../controllers/medicalRequestController"
);


router.post(
    "/",
    verifyToken,
    authorizeRoles("foster"),
    asyncHandler(
        medicalRequestController.createMedicalRequest
    )
);


router.get(
    "/",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        medicalRequestController.getAllMedicalRequests
    )
);


router.get(
    "/me",
    verifyToken,
    authorizeRoles("foster"),
    asyncHandler(
        medicalRequestController.getMyMedicalRequests
    )
);


router.patch(
    "/:id/resolve",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        medicalRequestController.resolveMedicalRequest
    )
);


module.exports = router;