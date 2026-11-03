const express = require("express");

const router = express.Router();

const asyncHandler = require("../middleware/asyncHandler");
const verifyToken = require("../middleware/verifyToken");
const authoriseRoles = require("../middleware/authoriseRoles");

const neededSupplyController = require(
    "../controllers/neededSupplyController"
);

// Public (landing page): active needs, only what visitors should see
const NeededSupply = require("../models/NeededSupply");
const PRIORITY_ORDER = { Urgent: 0, High: 1, Medium: 2, Low: 3 };

router.get(
    "/public",
    asyncHandler(async (req, res) => {
        const supplies = await NeededSupply.find({ status: "active" })
            .select("name category quantityNeeded quantityReceived priority description foodInventoryId createdAt")
            .lean();

        const sorted = supplies
            .filter((supply) => supply.quantityReceived < supply.quantityNeeded)
            .sort(
                (a, b) =>
                    (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9) ||
                    new Date(b.createdAt) - new Date(a.createdAt)
            )
            .map((supply) => ({
                _id: supply._id,
                name: supply.name,
                category: supply.category,
                quantityNeeded: supply.quantityNeeded,
                quantityReceived: supply.quantityReceived,
                priority: supply.priority,
                description: supply.description,
                unit: supply.foodInventoryId ? "kg" : "",
            }));

        res.set("Cache-Control", "no-store");
        return res.status(200).json({ success: true, total: sorted.length, supplies: sorted.slice(0, 4) });
    })
);

router.get(
    "/",
    verifyToken,
    authoriseRoles("admin", "staff", "foster", "adopter", "volunteer"),
    asyncHandler(
        neededSupplyController.getAllSupplies
    )
);

router.post(
    "/",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        neededSupplyController.createSupply
    )
);

router.patch(
    "/:id",
    verifyToken,
    authoriseRoles("admin", "staff"),
    asyncHandler(
        neededSupplyController.updateSupply
    )
);

router.delete(
    "/:id",
    verifyToken,
    authoriseRoles("admin"),
    asyncHandler(
        neededSupplyController.deleteSupply
    )
);

module.exports = router;