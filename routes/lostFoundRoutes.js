const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const lostFoundController = require("../controllers/lostFoundController");

router.post(
    "/reports",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "foster",
        "adopter",
        "volunteer"
    ),
    asyncHandler(
        lostFoundController.createReport
    )
);

router.get(
    "/reports",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        lostFoundController.getAllReports
    )
);

router.get(
    "/reports/me",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "foster",
        "adopter",
        "volunteer"
    ),
    asyncHandler(
        lostFoundController.getMyReports
    )
);

router.get(
    "/reports/:id",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "foster",
        "adopter",
        "volunteer"
    ),
    asyncHandler(
        lostFoundController.getReportById
    )
);

router.post(
    "/reports/:id/claim",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "foster",
        "adopter",
        "volunteer"
    ),
    asyncHandler(
        lostFoundController.claimReport
    )
);

router.patch(
    "/reports/:id/claim",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        lostFoundController.reviewClaim
    )
);

router.patch(
    "/reports/:id/reunited",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        lostFoundController.markReunited
    )
);

router.delete(
    "/reports/:reportId",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        lostFoundController.deleteReport
    )
);

module.exports = router;