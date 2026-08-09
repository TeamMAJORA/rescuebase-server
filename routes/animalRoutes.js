const express = require("express");
const router = express.Router();

const asyncHandler = require("../middleware/asyncHandler");
const verifyToken = require("../middleware/verifyToken");
const authoriseRoles = require("../middleware/authoriseRoles");
const validateRequest = require("../middleware/validateRequest");

const animalController = require("../controllers/animalController");

router.post("/",
    verifyToken,
    authoriseRoles("admin"),
    validateRequest(["name", "type"]),
    asyncHandler(
        animalController.createAnimal
    )
);

router.get("/",
    asyncHandler(
        animalController.getAllAnimals
    )
);

router.get("/:id",
    asyncHandler(
        animalController.getAnimalById
    )
);

router.patch("/:id",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        animalController.updateAnimal
    )
);

router.delete("/:id",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        animalController.deleteAnimal
    )
);

module.exports = router;