const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const userController = require(
    "../controllers/userController"
);


// ----- My account (any logged-in role) — must stay above "/:id" -----
router.get("/me", verifyToken, asyncHandler(userController.getMe));
router.patch("/me", verifyToken, asyncHandler(userController.updateMe));
router.patch("/me/password", verifyToken, asyncHandler(userController.changeMyPassword));
router.patch("/me/notifications", verifyToken, asyncHandler(userController.updateMyNotifications));

router.get(
    "/",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        userController.getAllUsers
    )
);

// Names of active staff/admin accounts (used by "Assessed By" dropdowns)
router.get(
    "/staff",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(
        userController.getStaffList
    )
);


router.get(
    "/volunteers",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(
        userController.getVolunteerList
    )
);

router.patch(
    "/:id",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        userController.updateUser
    )
);

router.post(
    "/",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(userController.adminCreateUser)
);

router.patch(
    "/:id/deactivate",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(userController.deactivateUser)
);

router.post(
    "/role-application",
    verifyToken,
    authorizeRoles("adopter"),
    asyncHandler(userController.submitRoleApplication)
);

router.get(
    "/role-application/me",
    verifyToken,
    authorizeRoles("adopter"),
    asyncHandler(userController.getMyRoleApplication)
);

router.patch(
    "/:id/role-application",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(userController.reviewRoleApplication)
);


module.exports = router;