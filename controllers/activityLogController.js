const mongoose = require("mongoose");

const ActivityLog = require("../models/ActivityLog");

exports.getActivityLogs = async (req, res) => {
    const userId = String(
        req.query.userId || ""
    ).trim();

    const startDate = String(
        req.query.startDate || ""
    ).trim();

    const endDate = String(
        req.query.endDate || ""
    ).trim();

    const filter = {};

    if (userId) {
        if (!mongoose.isValidObjectId(userId)) {
            const error = new Error(
                "Invalid user ID."
            );

            error.statusCode = 400;

            throw error;
        }

        filter.user = userId;
    }

    if (startDate || endDate) {
        filter.activityDate = {};

        if (startDate) {
            const parsedStartDate = new Date(
                `${startDate}T00:00:00`
            );

            if (Number.isNaN(parsedStartDate.getTime())) {
                const error = new Error(
                    "Invalid start date."
                );

                error.statusCode = 400;

                throw error;
            }

            filter.activityDate.$gte =
                parsedStartDate;
        }

        if (endDate) {
            const parsedEndDate = new Date(
                `${endDate}T23:59:59.999`
            );

            if (Number.isNaN(parsedEndDate.getTime())) {
                const error = new Error(
                    "Invalid end date."
                );

                error.statusCode = 400;

                throw error;
            }

            filter.activityDate.$lte =
                parsedEndDate;
        }
    }

    const logs = await ActivityLog.find(filter)
        .populate(
            "user",
            "username name email role"
        )
        .sort({
            activityDate: -1,
        });

    return res.status(200).json({
        success: true,
        logs,
    });
};