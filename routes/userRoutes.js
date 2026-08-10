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


module.exports = router;