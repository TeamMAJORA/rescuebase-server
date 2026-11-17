const express = require("express");
const mongoose = require("mongoose");
const router = express.Router();

const FosterNotification = require("../models/FosterNotifications");
const verifyToken = require("../middleware/verifyToken");
const authorizeRoles = require("../middleware/authoriseRoles");

// Every route needs a login. Staff/admin may manage anyone's notifications;
// everyone else only their own (matched by the email in their login token).
router.use(verifyToken);

const isStaffOrAdmin = (req) => ["admin", "staff"].includes(req.user.role);
const canAccessEmail = (req, email) =>
    isStaffOrAdmin(req) || String(req.user.email || "").trim().toLowerCase() === email;
const forbidden = (res) =>
    res.status(403).json({ success: false, message: "You can only access your own notifications." });

router.post("/", authorizeRoles("admin", "staff"), async (req, res) => {
    const missingFields = ["email", "title", "message"].filter((field) => !String(req.body[field] || "").trim());
    if (missingFields.length > 0) {
        return res.status(400).json({
            success: false,
            message: `Missing required field(s): ${missingFields.join(", ")}.`,
        });
    }

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
    if (!canAccessEmail(req, String(req.params.email).trim().toLowerCase())) return forbidden(res);

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
    if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({ success: false, message: "Invalid ID." });
    }

    try {
        const existing = await FosterNotification.findById(req.params.id).select("email").lean();
        if (!existing) {
            return res.status(404).json({ success: false, message: "Notification not found." });
        }
        if (!canAccessEmail(req, existing.email)) return forbidden(res);

        const notification = await FosterNotification.findByIdAndUpdate(req.params.id, {
            read: true,
            readAt: new Date(),
        }, {
            returnDocument: "after",
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
    if (!canAccessEmail(req, String(req.params.email).trim().toLowerCase())) return forbidden(res);

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