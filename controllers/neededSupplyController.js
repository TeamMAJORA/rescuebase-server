const mongoose = require("mongoose");

const NeededSupply = require("../models/NeededSupply");

exports.createNeededSupply = async (req, res) => {
    try {
        const {
            name, category, quantityNeeded, quantityReceived, priority, descriptiom, status
        } = req.body;

        if (!name || !category || quantityNeeded === undefined) {
            return res.status(400).json({
                message: "Name, category, and quantity needed are required."
            });
        }

        if (Number(quantityNeeded) < 1) {
            return res.status(400).json({
                message: "Quantity needed must be at least 1."
            });
        }

        if (quantityNeeded !== undefined && Number(quantityReceived) < 0) {
            return res.status(400).json({
                message: "Quantity received cannot be negative."
            });
        }

        const received = quantityReceived !== undefined ? Number(quantityReceived) : 0;

        const finalStatus = received >= needed ? "fulfilled" : status || "active";

        const supply = await NeededSupply.create({
            name,
            category,
            quantityNeeded: needed,
            quantityReceived: received,
            priority,
            description,
            status: finalStatus
        });

        return res.status(201).json({
            message: "Needed supply created successfully."
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to create needed supply.",
            error: error.message
        });
    }
}

exports.getPublicNeededSupplies = async (req, res) => {
    try {
        const supplies = await NeededSupply.find({
            status: {
                $in: ["active", "fulfilled"]
            }
        }).sort({
            priority: -1,
            createdAt: -1
        });

        return res.status(200).json(supplies);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch needed supplies.",
            error: error.message
        });
    }
};

exports.getAllNeededSupplies = async (req, res) => {
    try {
        const supplies = await NeededSupply.find()
            .sort({ createdAt: -1 });

        return res.status(200).json(supplies);
    } catch (error) {
        return res.status(500).json({
            message: "Failed to fetch needed supplies.",
            error: error.message
        });
    }
};

exports.updateNeededSupply = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid needed supply ID."
            });
        }

        const allowedFields = [
            "name",
            "category",
            "quantityNeeded",
            "quantityReceived",
            "priority",
            "description",
            "status"
        ];

        const updates = {};

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        });

        if (
            updates.quantityNeeded !== undefined &&
            Number(updates.quantityNeeded) < 1
        ) {
            return res.status(400).json({
                message: "Quantity needed must be at least 1."
            });
        }

        if (
            updates.quantityReceived !== undefined &&
            Number(updates.quantityReceived) < 0
        ) {
            return res.status(400).json({
                message: "Quantity received cannot be negative."
            });
        }

        if (updates.quantityNeeded !== undefined) {
            updates.quantityNeeded = Number(
                updates.quantityNeeded
            );
        }

        if (updates.quantityReceived !== undefined) {
            updates.quantityReceived = Number(
                updates.quantityReceived
            );
        }

        const currentSupply =
            await NeededSupply.findById(id);

        if (!currentSupply) {
            return res.status(404).json({
                message: "Needed supply not found."
            });
        }

        const finalNeeded =
            updates.quantityNeeded !== undefined
                ? updates.quantityNeeded
                : currentSupply.quantityNeeded;

        const finalReceived =
            updates.quantityReceived !== undefined
                ? updates.quantityReceived
                : currentSupply.quantityReceived;

        if (
            updates.status === undefined &&
            finalReceived >= finalNeeded
        ) {
            updates.status = "fulfilled";
        }

        const supply =
            await NeededSupply.findByIdAndUpdate(
                id,
                updates,
                {
                    new: true,
                    runValidators: true
                }
            );

        return res.status(200).json({
            message: "Needed supply updated successfully.",
            supply
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to update needed supply.",
            error: error.message
        });
    }
};

exports.deleteNeededSupply = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                message: "Invalid needed supply ID."
            });
        }

        const supply =
            await NeededSupply.findByIdAndDelete(id);

        if (!supply) {
            return res.status(404).json({
                message: "Needed supply not found."
            });
        }

        return res.status(200).json({
            message: "Needed supply deleted successfully."
        });
    } catch (error) {
        return res.status(500).json({
            message: "Failed to delete needed supply.",
            error: error.message
        });
    }
}