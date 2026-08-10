const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authoriseRoles = require("../middleware/authoriseRoles");
const validateRequest = require("../middleware/validateRequest");
const asyncHandler = require("../middleware/asyncHandler");
const fosterController = require("../controllers/fosterController");

router.post(
    "/applications",
    verifyToken,
    authoriseRoles("foster"),
    validateRequest([
        "applicantName",
    ]),
    asyncHandler(
        fosterController.createApplication
    )
);


router.get(
    "/applications",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        fosterController.getAllApplications
    )
);


router.get(
    "/applications/me",
    verifyToken,
    authoriseRoles("foster"),
    asyncHandler(
        fosterController.getMyApplications
    )
);


router.patch(
    "/applications/:id/status",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        fosterController.reviewApplication
    )
);


router.post(
    "/assignments",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        fosterController.createAssignment
    )
);


router.get(
    "/assignments",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        fosterController.getAllAssignments
    )
);


router.get(
    "/assignments/me/active",
    verifyToken,
    authoriseRoles("foster"),
    asyncHandler(
        fosterController.getMyActiveAssignment
    )
);


router.post(
    "/assignments/:id/updates",
    verifyToken,
    authoriseRoles("foster"),
    asyncHandler(
        fosterController.submitAssignmentUpdate
    )
);


router.patch(
    "/assignments/:id/complete",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        fosterController.completeAssignment
    )
);


router.patch(
    "/assignments/:id",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        fosterController.updateAssignment
    )
);


router.delete(
    "/assignments/:id",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        fosterController.deleteAssignment
    )
);


router.get(
    "/assignments/me/history",
    verifyToken,
    authoriseRoles("foster"),
    asyncHandler(
        fosterController.getMyAssignmentHistory
    )
);

module.exports = router;