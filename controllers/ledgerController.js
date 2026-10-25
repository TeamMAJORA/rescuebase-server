const LedgerEntry = require("../models/LedgerEntry");
const FoodInventoryTransaction = require("../models/FoodInventoryTransaction");

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

exports.getFoodTransactions = async (req, res) => {
    try {
        const parsedLimit = Number.parseInt(req.query.limit, 10);
        const limit = Number.isFinite(parsedLimit)
            ? Math.min(Math.max(parsedLimit, 1), 100)
            : 25;

        const filter = {};

        if (req.query.inventoryId) {
            if (!/^[a-f\d]{24}$/i.test(req.query.inventoryId)) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid inventory ID.",
                });
            }

            filter.inventoryId = req.query.inventoryId;
        }

        const transactions = await FoodInventoryTransaction.find(filter)
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        return res.status(200).json({
            success: true,
            count: transactions.length,
            transactions,
        });
    } catch (error) {
        console.error("[Food Ledger] Failed to fetch:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to retrieve food transactions.",
        });
    }
};