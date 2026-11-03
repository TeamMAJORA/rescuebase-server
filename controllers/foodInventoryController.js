const mongoose = require("mongoose");
const FoodInventory = require("../models/FoodInventory");
const NeededSupply = require("../models/NeededSupply");


const MAX_FOOD_STOCK_KG = 100000;
const MAX_FOOD_RATE_KG = 50;
const FOR_ANIMALS = ["", "Dog", "Cat", "All"];
const getUserId = (req) =>
    req.user?._id || req.user?.id || req.user?.userId || null;

const getInventory = async (req, res) => {
    const inventory = await FoodInventory.find()
        .select("-adjustmentHistory")
        .sort({ name: 1 })
        .lean();

    return res.status(200).json({
        success: true,
        inventory,
    });
};

const createInventory = async (req, res) => {
    const {
        name,
        quantityInStock,
        unit = "kg",
        foodRatePerAnimalPerDay = 0.5,
        forecastDays = 30,
        forAnimals = "",
    } = req.body;

    if (!FOR_ANIMALS.includes(forAnimals)) {
        return res.status(400).json({
            message: "Choose who eats this food: Dogs, Cats or All animals.",
        });
    }

    if (!name || !name.trim()) {
        return res.status(400).json({
            message: "Food item name is required.",
        });
    }

    const stock = Number(quantityInStock ?? 0);
    const rate = Number(foodRatePerAnimalPerDay);
    const days = Number(forecastDays);

    if (
        !Number.isFinite(stock) ||
        stock < 0 ||
        stock > MAX_FOOD_STOCK_KG ||
        !Number.isFinite(rate) ||
        rate < 0 ||
        rate > MAX_FOOD_RATE_KG ||
        !Number.isFinite(days) ||
        days < 1 ||
        !Number.isInteger(days)
    ) {
        return res.status(400).json({
            message: "Please provide valid stock and forecast settings.",
        });
    }

    if (unit !== "kg") {
        return res.status(400).json({
            message: "The supported inventory unit is kg.",
        });
    }

    try {
        const item = await FoodInventory.create({
            name: name.trim(),
            quantityInStock: stock,
            unit,
            foodRatePerAnimalPerDay: rate,
            forecastDays: days,
            forAnimals,
        });

        return res.status(201).json({
            success: true,
            message: "Food inventory item created successfully.",
            item,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "A food inventory item with that name already exists.",
            });
        }

        throw error;
    }
};

const updateInventory = async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
            message: "Invalid inventory item ID.",
        });
    }

    const allowedFields = [
        "name",
        "foodRatePerAnimalPerDay",
        "forecastDays",
        "forAnimals",
    ];

    const updates = {};

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            updates[field] = req.body[field];
        }
    }

    if (updates.forAnimals !== undefined && !FOR_ANIMALS.includes(updates.forAnimals)) {
        return res.status(400).json({
            message: "Choose who eats this food: Dogs, Cats or All animals.",
        });
    }

    if (updates.name !== undefined) {
        if (
            typeof updates.name !== "string" ||
            !updates.name.trim()
        ) {
            return res.status(400).json({
                message: "Food item name cannot be empty.",
            });
        }

        updates.name = updates.name.trim();
    }

    if (updates.foodRatePerAnimalPerDay !== undefined) {
        updates.foodRatePerAnimalPerDay = Number(
            updates.foodRatePerAnimalPerDay
        );

        if (
            !Number.isFinite(updates.foodRatePerAnimalPerDay) ||
            updates.foodRatePerAnimalPerDay < 0 ||
            updates.foodRatePerAnimalPerDay > MAX_FOOD_RATE_KG
        ) {
            return res.status(400).json({
                message: `Food rate must be between 0 and ${MAX_FOOD_RATE_KG} kg.`,
            });
        }
    }

    if (updates.forecastDays !== undefined) {
        updates.forecastDays = Number(updates.forecastDays);

        if (
            !Number.isInteger(updates.forecastDays) ||
            updates.forecastDays < 1
        ) {
            return res.status(400).json({
                message: "Forecast days must be a positive whole number.",
            });
        }
    }

    if (Object.keys(updates).length === 0) {
        return res.status(400).json({
            message: "No valid fields were provided for updating.",
        });
    }

    try {
        const item = await FoodInventory.findByIdAndUpdate(
            id,
            { $set: updates },
            {
                returnDocument: "after",
                runValidators: true,
            }
        );

        if (!item) {
            return res.status(404).json({
                message: "Food inventory item not found.",
            });
        }

        return res.status(200).json({
            success: true,
            message: "Food inventory item updated successfully.",
            item,
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "A food inventory item with that name already exists.",
            });
        }

        throw error;
    }
};

const adjustStock = async (req, res) => {
    const { id } = req.params;
    const { action, quantity, reason, note } = req.body;

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
            message: "Invalid inventory item ID.",
        });
    }

    const amount = Number(quantity);

    if (!["add", "remove"].includes(action)) {
        return res.status(400).json({
            message: 'Action must be either "add" or "remove".',
        });
    }

    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_FOOD_STOCK_KG) {
        return res.status(400).json({
            message: `Adjustment quantity must be between 0 and ${MAX_FOOD_STOCK_KG.toLocaleString()} kg.`,
        });
    }

    if (
        (reason !== undefined && typeof reason !== "string") ||
        (note !== undefined && typeof note !== "string")
    ) {
        return res.status(400).json({
            message: "Reason and note must be text.",
        });
    }

    const adjustment = action === "add" ? amount : -amount;

    // Adding must not push the stock past the limit
    const stockLimitFilter =
        action === "add"
            ? { quantityInStock: { $lte: MAX_FOOD_STOCK_KG - amount } }
            : { quantityInStock: { $gte: amount } };

    const item = await FoodInventory.findOneAndUpdate(
        {
            _id: id,
            ...stockLimitFilter,
        },
        {
            $inc: { quantityInStock: adjustment },
        },
        {
            returnDocument: "after",
            runValidators: true,
        }
    );

    if (!item) {
        const exists = await FoodInventory.exists({ _id: id });

        if (!exists) {
            return res.status(404).json({
                message: "Food inventory item not found.",
            });
        }

        return res.status(400).json({
            message:
                action === "add"
                    ? `Stock cannot go above ${MAX_FOOD_STOCK_KG.toLocaleString()} kg.`
                    : "Insufficient stock for this removal.",
        });
    }

    const newStock = item.quantityInStock;
    const previousStock = newStock - adjustment;

    item.adjustmentHistory.push({
        action,
        quantity: amount,
        previousStock,
        newStock,
        reason:
            typeof reason === "string" && reason.trim()
                ? reason.trim()
                : "Manual adjustment",
        note: typeof note === "string" ? note.trim() : "",
        adjustedBy: getUserId(req),
        adjustedAt: new Date(),
    });

    await item.save();

    return res.status(200).json({
        success: true,
        message: `Stock ${action === "add" ? "added" : "removed"} successfully.`,
        item,
    });
};

const getAdjustmentHistory = async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
            message: "Invalid inventory item ID.",
        });
    }

    const item = await FoodInventory.findById(id)
        .select("name quantityInStock unit adjustmentHistory");

    if (!item) {
        return res.status(404).json({
            message: "Food inventory item not found.",
        });
    }

    return res.status(200).json({
        success: true,
        item: {
            _id: item._id,
            name: item.name,
            quantityInStock: item.quantityInStock,
            unit: item.unit,
        },
        history: [...item.adjustmentHistory].reverse(),
    });
};

// Remove a food item (e.g. added by mistake). Needed-supply requests made for it
// stay, but are unlinked so received donations no longer change any stock.
const deleteInventory = async (req, res) => {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({
            message: "Invalid inventory item ID.",
        });
    }

    const item = await FoodInventory.findByIdAndDelete(id);

    if (!item) {
        return res.status(404).json({
            message: "Food inventory item not found.",
        });
    }

    await NeededSupply.updateMany(
        { foodInventoryId: item._id },
        { $set: { foodInventoryId: null } }
    );

    return res.status(200).json({
        success: true,
        message: `${item.name} was deleted.`,
    });
};

// Supplies > History: every food stock change and every supply request, newest first
const HISTORY_LIMIT = 300;

const getSuppliesHistory = async (req, res) => {
    const [foods, requests] = await Promise.all([
        FoodInventory.find()
            .select("name adjustmentHistory")
            .populate("adjustmentHistory.adjustedBy", "name username email")
            .lean(),
        NeededSupply.find()
            .select("name quantityNeeded foodInventoryId createdAt createdByName createdByEmail")
            .lean(),
    ]);

    const entries = [];

    foods.forEach((food) => {
        (food.adjustmentHistory || []).forEach((change) => {
            const by = change.adjustedBy;
            entries.push({
                _id: String(change._id),
                kind: "stock",
                date: change.adjustedAt,
                item: food.name,
                action: change.action,
                quantity: change.quantity,
                previousStock: change.previousStock,
                newStock: change.newStock,
                detail: [change.reason, change.note].filter(Boolean).join(" · "),
                by: by?.name || by?.username || by?.email || "",
            });
        });
    });

    requests.forEach((request) => {
        entries.push({
            _id: String(request._id),
            kind: "request",
            date: request.createdAt,
            item: request.name,
            quantity: request.quantityNeeded,
            unit: request.foodInventoryId ? "kg" : "",
            detail: "Added to Needed supplies",
            by: request.createdByName || request.createdByEmail || "",
        });
    });

    entries.sort((a, b) => new Date(b.date) - new Date(a.date));

    return res.status(200).json({
        success: true,
        total: entries.length,
        history: entries.slice(0, HISTORY_LIMIT),
    });
};

module.exports = {
    getSuppliesHistory,
    deleteInventory,
    getInventory,
    createInventory,
    updateInventory,
    adjustStock,
    getAdjustmentHistory,
};