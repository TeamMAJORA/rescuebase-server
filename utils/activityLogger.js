const ActivityLog = require("../models/ActivityLog");

async function createActivityLog({
    user,
    activity,
    activityType,
}) {
    try {
        if (!user || !activity || !activityType) {
            return;
        }

        await ActivityLog.create({
            user,
            activity,
            activityType,
            activityDate: new Date(),
        });
    } catch (error) {
        console.error(
            "Activity log creation error:",
            error
        );
    }
}

module.exports = {
    createActivityLog,
};