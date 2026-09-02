const express = require("express");

const router = express.Router();

const asyncHandler =
    require("../middleware/asyncHandler");

const verifyToken =
    require("../middleware/verifyToken");

const authoriseRoles =
    require("../middleware/authoriseRoles");

const neededSuppliesController =
    require("../controllers/neededSuppliesController");


router.get(
    "/public",
    asyncHandler(
        neededSuppliesController.getPublicNeededSupplies
    )
);


router.post(
    "/",
    verifyToken,
    authoriseRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        neededSuppliesController.createNeededSupply
    )
);


router.get(
    "/",
    verifyToken,
    authoriseRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        neededSuppliesController.getAllNeededSupplies
    )
);


router.patch(
    "/:id",
    verifyToken,
    authoriseRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        neededSuppliesController.updateNeededSupply
    )
);


router.delete(
    "/:id",
    verifyToken,
    authoriseRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        neededSuppliesController.deleteNeededSupply
    )
);


module.exports = router;