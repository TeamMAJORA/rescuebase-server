const express = require("express");
const router = express.Router();

const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");
const asyncHandler = require("../middleware/asyncHandler");

const ledgerController = require("../controllers/ledgerController");

router.get(
    "/",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(
        ledgerController.getLedgerEntries
    )
);

router.get(
    "/food-transactions",
    verifyToken,
    authorizeRoles("admin"),
    asyncHandler(ledgerController.getFoodTransactions)
);

module.exports = router;