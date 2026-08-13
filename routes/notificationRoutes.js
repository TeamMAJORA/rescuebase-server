const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const notificationController =
    require("../controllers/notificationController");

router.post(
    "/",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        notificationController.createNotification
    )
);

router.get(
    "/",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "foster",
        "adopter",
        "volunteer"
    ),
    asyncHandler(
        notificationController.getNotifications
    )
);

router.get(
    "/unread-count",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "foster",
        "adopter",
        "volunteer"
    ),
    asyncHandler(
        notificationController.getUnreadCount
    )
);

router.patch(
    "/:id/read",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "foster",
        "adopter",
        "volunteer"
    ),
    asyncHandler(
        notificationController.markAsRead
    )
);

router.patch(
    "/read-all",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "foster",
        "adopter",
        "volunteer"
    ),
    asyncHandler(
        notificationController.markAllAsRead
    )
);

module.exports = router;