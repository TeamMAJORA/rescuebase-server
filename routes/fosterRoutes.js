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
    authoriseRoles("adopter", "foster"),
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
    authoriseRoles("admin", "staff"),
    asyncHandler(
        fosterController.getAllApplications
    )
);


router.get(
    "/applications/me",
    verifyToken,
    authoriseRoles("adopter", "foster"),
    asyncHandler(
        fosterController.getMyApplications
    )
);


router.patch(
    "/applications/:id/status",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        fosterController.reviewApplication
    )
);


router.post(
    "/assignments",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        fosterController.createAssignment
    )
);


router.get(
    "/assignments",
    verifyToken,
    authoriseRoles("admin", "staff", "volunteer"),
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

router.post(
    "/assignments/:id/behavior-evaluation",
    verifyToken,
    authoriseRoles("foster"),
    asyncHandler(
        fosterController.submitBehaviorEvaluation
    )
);

router.patch(
    "/assignments/:id/behavior-evaluation/accept",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        fosterController.acceptBehaviorEvaluation
    )
);

router.patch(
    "/assignments/:id/complete",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        fosterController.completeAssignment
    )
);


router.patch(
    "/assignments/:id",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        fosterController.updateAssignment
    )
);


router.delete(
    "/assignments/:id",
    verifyToken,
    authoriseRoles("admin", "staff"),
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

router.post(
    "/assignments/:id/medical-requests",
    verifyToken,
    authoriseRoles("foster"),
    asyncHandler(
        fosterController.submitMedicalRequest
    )
);

router.get(
    "/medical-requests",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        fosterController.getMedicalRequests
    )
);

router.patch(
    "/medical-requests/:assignmentId/:requestId",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        fosterController.updateMedicalRequest
    )
);

module.exports = router;