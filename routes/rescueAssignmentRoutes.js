const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const rescueAssignmentController =
    require("../controllers/rescueAssignmentController");

router.post(
    "/",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        rescueAssignmentController.createAssignment
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
        rescueAssignmentController.getAllAssignments
    )
);

router.get(
    "/my",
    verifyToken,
    authorizeRoles(
        "volunteer"
    ),
    asyncHandler(
        rescueAssignmentController.getMyAssignments
    )
);

router.get(
    "/:id",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "volunteer"
    ),
    asyncHandler(
        rescueAssignmentController.getAssignmentById
    )
);

router.patch(
    "/:id",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        rescueAssignmentController.updateAssignment
    )
);

router.patch(
    "/:id/accept",
    verifyToken,
    authorizeRoles(
        "volunteer"
    ),
    asyncHandler(
        rescueAssignmentController.acceptAssignment
    )
);

router.patch(
    "/:id/decline",
    verifyToken,
    authorizeRoles(
        "volunteer"
    ),
    asyncHandler(
        rescueAssignmentController.declineAssignment
    )
);

router.patch(
    "/:id/start",
    verifyToken,
    authorizeRoles(
        "volunteer"
    ),
    asyncHandler(
        rescueAssignmentController.startAssignment
    )
);

router.patch(
    "/:id/complete",
    verifyToken,
    authorizeRoles(
        "volunteer"
    ),
    asyncHandler(
        rescueAssignmentController.completeAssignment
    )
);

router.patch(
    "/:id/cancel",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        rescueAssignmentController.cancelAssignment
    )
);

router.delete(
    "/:id",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        rescueAssignmentController.deleteAssignment
    )
);

module.exports = router;