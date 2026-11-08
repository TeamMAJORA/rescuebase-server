const cron = require("node-cron");
const mongoose = require("mongoose");

const { sendDueWeeklyUpdateReminders } = require("../controllers/fosterController");

// Reminds fosters with 30+ day assignments to send a weekly update
async function runFosterUpdateReminders() {
    if (mongoose.connection.readyState !== 1) return;

    const sent = await sendDueWeeklyUpdateReminders();
    if (sent > 0) {
        console.log(`[Foster update reminders] reminded ${sent} foster(s)`);
    }
}

function startFosterUpdateReminders() {
    // Every day at 9:00 AM Manila time
    cron.schedule(
        "0 9 * * *",
        () => {
            runFosterUpdateReminders().catch((error) =>
                console.error("[Foster update reminders] failed:", error.message)
            );
        },
        { timezone: "Asia/Manila" }
    );

    // Also check once shortly after the server starts
    setTimeout(() => {
        runFosterUpdateReminders().catch((error) =>
            console.error("[Foster update reminders] failed:", error.message)
        );
    }, 20000);
}

module.exports = startFosterUpdateReminders;
