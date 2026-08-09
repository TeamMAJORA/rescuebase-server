const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const AdoptionApplication = require("../models/AdoptionApplication");
const Animal = require("../models/Animal");
const LedgerEntry = require("../models/LedgerEntry");

const adoptionController = require("../controllers/adoptionController");
const asyncHandler = require("../middleware/asyncHandler");
const validateRequest = require("../middleware/validateRequest");
const verifyToken = require("../middleware/verifyToken");
const authoriseRoles = require("../middleware/authoriseRoles");

router.post("/", 
    verifyToken,
    authoriseRoles("adopter"),
    validateRequest([
        "fullName",
        "animalId",
    ]),
    asyncHandler(
        adoptionController.submitApplication
    )
);

router.get("/", 
    verifyToken,
    authoriseRoles(
        "admin",
        "staff",
    ),
    asyncHandler(adoptionController.getAllApplications)
);

router.get("/user/latest",
    verifyToken,
    authoriseRoles("adopter"),

    asyncHandler(adoptionController.getLatestUserApplication)
);

router.patch("/:id/status",
    verifyToken,
    authoriseRoles("admin", "staff"),
    validateRequest(["status"]),
    asyncHandler(adoptionController.updateApplicationStatus),
);

module.exports = router;