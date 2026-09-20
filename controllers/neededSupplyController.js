const mongoose = require("mongoose");

const NeededSupply = require("../models/NeededSupply");

function updateSupplyStatus(supply) {
    if (supply.quantityReceived >= supply.quantityNeeded) {
        supply.status = "fulfilled";
    } else if (supply.quantityReceived > 0) {
        supply.status = "partially_fulfilled";
    } else {
        supply.status = "needed";
    }
}

exports.getAllSupplies = async (req, res) => {
    const supplies = await NeededSupply.find()
        .sort({ createdAt: -1 });

    return res.status(200).json({
        success: true,
        supplies,
    });
};

exports.createSupply = async (req, res) => {
    const {
        name,
        item,
        category,
        quantityNeeded,
        quantityReceived,
        priority,
        description,
        notes,
        status,
    } = req.body;

    const supplyName = name || item;

    const supplyCategory =
        category || req.body.donationType;

    const supplyStatus =
        status === "needed"
            ? "active"
            : status === "fulfilled"
                ? "fulfilled"
                : status === "inactive"
                    ? "inactive"
                    : "active";

    if (!supplyName) {
        return res.status(400).json({
            success: false,
            message: "Supply name is required",
        });
    }

    if (!supplyCategory) {
        return res.status(400).json({
            success: false,
            message: "Supply category is required",
        });
    }

    const supply = await NeededSupply.create({
        name: supplyName,
        category: supplyCategory,
        quantityNeeded,
        quantityReceived: quantityReceived || 0,
        priority: priority || "Medium",
        description: description || notes || "",
        status: supplyStatus,
        createdByName: req.user?.name || "",
        createdByEmail: req.user?.email || "",
    });

    res.status(201).json({
        success: true,
        message: "Needed supply created successfully",
        supply,
    });
};

exports.updateSupply = async (req, res) => {
    const supplyId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(supplyId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid supply ID.",
        });
    }

    const supply = await NeededSupply.findById(
        supplyId
    );

    if (!supply) {
        return res.status(404).json({
            success: false,
            message: "Supply requirement not found.",
        });
    }

    const allowedFields = [
        "shelter",
        "item",
        "quantityNeeded",
        "quantityReceived",
        "notes",
        "status",
    ];

    for (const field of allowedFields) {
        if (req.body[field] !== undefined) {
            supply[field] = req.body[field];
        }
    }

    if (
        supply.quantityNeeded < 1 ||
        supply.quantityReceived < 0
    ) {
        return res.status(400).json({
            success: false,
            message: "Invalid supply quantities.",
        });
    }

    if (
        req.body.status === undefined ||
        req.body.status !== "cancelled"
    ) {
        updateSupplyStatus(supply);
    }

    await supply.save();

    return res.status(200).json({
        success: true,
        message: "Supply requirement updated successfully.",
        supply,
    });
};

exports.deleteSupply = async (req, res) => {
    const supplyId = String(
        req.params.id || ""
    ).trim();

    if (!mongoose.isValidObjectId(supplyId)) {
        return res.status(400).json({
            success: false,
            message: "Invalid supply ID.",
        });
    }

    const supply = await NeededSupply.findByIdAndDelete(
        supplyId
    );

    if (!supply) {
        return res.status(404).json({
            success: false,
            message: "Supply requirement not found.",
        });
    }

    return res.status(200).json({
        success: true,
        message: "Supply requirement deleted successfully.",
    });
};