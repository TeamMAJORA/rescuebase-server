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
        "adopter",
        "volunteer",
        "foster",
        "staff",
        "admin"
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
        "staff",
        "foster",
        "adopter",
        "volunteer"
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
        "adopter",
        "volunteer",
        "foster"
    ),
    asyncHandler(
        lostFoundController.claimReport
    )
);

// The report's owner decides; staff/admin only for shelter intake listings (checked in the controller)
router.patch(
    "/reports/:id/claim",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "adopter",
        "volunteer",
        "foster"
    ),
    asyncHandler(
        lostFoundController.reviewClaim
    )
);

router.patch(
    "/reports/:id/claims/seen",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "adopter",
        "volunteer",
        "foster"
    ),
    asyncHandler(
        lostFoundController.markClaimsSeen
    )
);

// Admin: any report. Everyone else: their own (checked in the controller)
router.delete(
    "/reports/:reportId",
    verifyToken,
    authorizeRoles("admin", "staff", "adopter", "volunteer", "foster"),
    asyncHandler(
        lostFoundController.deleteReport
    )
);

router.get(
    "/matches",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(
        lostFoundController.getPossibleMatches
    )
);

router.get(
    "/matches/me",
    verifyToken,
    authorizeRoles("adopter", "volunteer", "foster"),
    asyncHandler(
        lostFoundController.getMySuggestedMatches
    )
);

router.patch(
    "/matches/:matchId/dismiss",
    verifyToken,
    authorizeRoles("adopter", "volunteer", "foster"),
    asyncHandler(
        lostFoundController.dismissSuggestedMatch
    )
);

router.patch(
    "/matches/:matchId/decision",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(
        lostFoundController.reviewPossibleMatch
    )
);

router.patch(
    "/reports/:id/claim/cancel",
    verifyToken,
    authorizeRoles(
        "adopter",
        "volunteer",
        "foster"
    ),
    asyncHandler(
        lostFoundController.cancelClaim
    )
);


module.exports = router;