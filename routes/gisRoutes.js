const express = require("express");
const router = express.Router();
const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");
const gisController = require("../controllers/gisController");

router.get(
    "/public",
    asyncHandler(gisController.getPublicLocations)
);

router.get(
    "/shelters",
    asyncHandler(gisController.getShelters)
);

router.post(
    "/stray-sightings",
    verifyToken,
    authorizeRoles("admin", "staff", "volunteer"),
    asyncHandler(gisController.createStraySighting)
);

router.get(
    "/hotspots",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(gisController.getHotspotAnalysis)
);

router.post(
    "/shelters",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(gisController.createShelter)
);

router.patch(
    "/shelters/:id",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(gisController.updateShelter)
);

router.post(
    "/",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(gisController.createLocation)
);

router.get(
    "/",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(gisController.getAllLocations)
);

router.patch(
    "/:id/resolve",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(gisController.resolveLocation)
);

router.get(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(gisController.getLocationById)
);

router.patch(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(gisController.updateLocation)
);

router.delete(
    "/:id",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(gisController.deleteLocation)
);

router.get(
    "/shelters/manage",
    verifyToken,
    authorizeRoles("admin", "staff"),
    asyncHandler(gisController.getAllShelters)
);

module.exports = router;
