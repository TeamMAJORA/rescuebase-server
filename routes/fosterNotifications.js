const express = require("express");
const router = express.Router();

const FosterNotification = require("../models/FosterNotifications");

router.post("/", async (req, res) => {
    try {
        const notification = await FosterNotification.create({
            email: String(req.body.email || "")
                .trim()
                .toLowerCase(),
            title: req.body.title,
            message: req.body.message,
            type: req.body.type || "general",
            relatedId: req.body.relatedId || null,
        });

        res.json({
            success: true,
            notification,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to create notification.",
        });
    }
});

router.get("/:email", async (req, res) => {
    try {
        const notifications = await FosterNotification.find({
            email: String(req.params.email)
                .trim()
                .toLowerCase(),
        }).sort({
            createdAt: -1,
        });

        res.json({
            success: true,
            notifications,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to load notifications.",
        });
    }
});

router.patch("/:id/read", async (req, res) => {
    try {
        const notification = await FosterNotification.findByIdAndUpdate(req.params.id, {
            read: true,
            readAt: new Date(),
        }, {
            new: true,
        });
        

        res.json({
            success: true,
            notification,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to mark notification as read."
        });
    }
});

router.patch("/read-all/:email", async (req, res) => {
    try {
        await FosterNotification.updateMany({
            email: String(req.params.email)
                .trim()
                .toLowerCase(),
            read: false,
        }, {
            read: true,
            readAt: new Date(),
        });

        res.json({
            success: true,
        });
    } catch (error) {
        console.error(error);

        res.status(500).json({
            success: false,
            message: "Failed to mark all notifications as read."
        });
    }
});

module.exports = router;