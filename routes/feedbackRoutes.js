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
        "admin",
        "staff"
    ),
    asyncHandler(
        feedbackController.getAllFeedback
    )
);
router.get(
    "/me",
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
        feedbackController.getMyFeedback
    )
);
router.get(
    "/:id",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        feedbackController.getFeedbackById
    )
);

router.patch(
    "/:id/reply",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        feedbackController.replyToFeedback
    )
);

router.patch(
    "/:id/archive",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        feedbackController.archiveFeedback
    )
);

router.patch(
    "/:id/restore",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
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