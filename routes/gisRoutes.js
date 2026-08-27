const express = require("express");

const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const gisController =
    require("../controllers/gisController");


router.get(
    "/public",
    asyncHandler(
        gisController.getPublicLocations
    )
);


router.post(
    "/",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        gisController.createLocation
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
        gisController.getAllLocations
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
        gisController.getLocationById
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
        gisController.updateLocation
    )
);


router.patch(
    "/:id/resolve",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        gisController.resolveLocation
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
        gisController.deleteLocation
    )
);


module.exports = router;