const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const userController = require(
    "../controllers/userController"
);


router.get(
    "/",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        userController.getAllUsers
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