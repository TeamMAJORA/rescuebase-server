const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const feedbackController =
    require("../controllers/feedbackController");

router.post(
    "/",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "adopter",
        "foster",
        "volunteer",
        "donor"
    ),
    asyncHandler(
        feedbackController.createFeedback
    )
);

router.get(
    "/",
    verifyToken,
    authorizeRoles(
        "admin"
    ),
    asyncHandler(
        feedbackController.getAllFeedback
    )
);

router.get(
    "/:id",
    verifyToken,
    authorizeRoles(
        "admin"
    ),
    asyncHandler(
        feedbackController.getFeedbackById
    )
);

router.patch(
    "/:id/archive",
    verifyToken,
    authorizeRoles(
        "admin"
    ),
    asyncHandler(
        feedbackController.archiveFeedback
    )
);

router.patch(
    "/:id/restore",
    verifyToken,
    authorizeRoles(
        "admin"
    ),
    asyncHandler(
        feedbackController.restoreFeedback
    )
);

router.delete(
    "/:id",
    verifyToken,
    authorizeRoles(
        "admin"
    ),
    asyncHandler(
        feedbackController.deleteFeedback
    )
);

module.exports = router;