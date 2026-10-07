const express = require("express");

const router = express.Router();

const verifyToken =
    require("../middleware/verifyToken");

const authorizeRoles =
    require("../middleware/authoriseRoles");

const asyncHandler =
    require("../middleware/asyncHandler");

const vaccinationController =
    require("../controllers/vacciantionController");


router.post(
    "/",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff"
    ),
    asyncHandler(
        vaccinationController.createVaccination
    )
);


router.get(
    "/",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "foster"
    ),
    asyncHandler(
        vaccinationController.getVaccinations
    )
);


router.get(
    "/animal/:animalId",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "foster"
    ),
    asyncHandler(
        vaccinationController
            .getVaccinationsByAnimal
    )
);


router.get(
    "/due",
    verifyToken,
    authorizeRoles(
        "admin",
        "staff",
        "foster"
    ),
    asyncHandler(
        vaccinationController
            .getDueVaccinations
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
        vaccinationController
            .updateVaccination
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
        vaccinationController
            .deleteVaccination
    )
);


module.exports = router;