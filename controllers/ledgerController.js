const LedgerEntry = require("../models/LedgerEntry");

exports.getLedgerEntries = async (req, res) => {
    const limit = Number(req.query.limit) || 10;

    const entries = await LedgerEntry.find()
        .sort({ createdAt: -1 })
        .limit(limit);

    return res.status(200).json({
        success: true,
        entries,
    });
};