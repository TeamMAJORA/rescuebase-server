const express = require("express");
const router = express.Router();

const User = require("../models/user");
// const LedgerEntry = require("../models/LedgerEntry"); // we will not use this one yet for now

router.get("/", async (req, res) => {
    try {
        const users = await User.find()
            .select("-password")
            .sort({ createdAt : -1 });

        res.json({
            success : true,
            users,
        });
    } catch (error) {
        console.log("Fetching users error: ", error);

        res.status(500).json({
            success : false,
            message : "Failed to fetch users",
            error : error.message,
        });
    }
});

router.patch("/:id", async (req, res) => {
    try {

        const allowedFields = [
            "username", "role", "status", "verified"
        ]

        const allowedUpdates = {};

        allowedFields.forEach((field) => {
            if (req.body[field] !== undefined) {
                allowedUpdates[field] = req.body[field];
            }
        });

        if (Object.keys(allowedUpdates).length === 0) {
            return res.status(400).json({
                success : false,
                message : "No valid fields provided for this update",
            });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { $set : allowedUpdates },
            {
                new : true,
                runValidators : true,
            }
        ).select("-password");

        if (!user) {
            return res.status(404).json({
                success : false,
                message  : "User not found."
            });
        }

        res.json({
            success : true,
            message : "User updated successfully.",
            user,
        });

    } catch (error) {
        console.log("Update user error: ", error)

        res.status(500).json({
            success : false,
            message : "Failed to update user.",
            error : error.message
        })
    }
})