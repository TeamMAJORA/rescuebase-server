const express = require("express");
const router = express.Router();
const LedgerEntry = ("../models/LedgerEntry");

router.get("/", async (req, res) => {
    try {
        const limit = Number(req.query.list) || 10;

        const entries = await LedgerEntry.find()
            .sort({ createdAt : -1 })
            .limit(limit);

        res.json({
            success: true,
            entries,
        });
    } catch (error) {
        console.error("Fetcher ledger error:", error);

        res.status(500).json({
            success : false,
            message : "Failed to fetch ledger entries",
        });
    }
});

module.exports = router;