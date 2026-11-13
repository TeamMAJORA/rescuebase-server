const express = require("express");
const { runVaccinationReminders } = require("../jobs/vaccinationReminders");
const { runFosterUpdateReminders } = require("../jobs/fosterUpdateReminders");

const router = express.Router();

// Vercel Cron sends "Authorization: Bearer <CRON_SECRET>" on every scheduled call.
// Schedules are in vercel.json (UTC): 00:00 UTC = 8 AM Manila, 01:00 UTC = 9 AM Manila.
function requireVercelCronSecret(req, res, next) {
    const expectedSecret = process.env.CRON_SECRET;

    if (!expectedSecret || req.headers.authorization !== `Bearer ${expectedSecret}`) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    next();
}

router.get("/vaccination-reminders", requireVercelCronSecret, async (req, res) => {
    await runVaccinationReminders();
    res.json({ success: true, job: "vaccination-reminders" });
});

router.get("/foster-update-reminders", requireVercelCronSecret, async (req, res) => {
    await runFosterUpdateReminders();
    res.json({ success: true, job: "foster-update-reminders" });
});

module.exports = router;
