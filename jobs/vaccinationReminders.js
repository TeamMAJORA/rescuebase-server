const cron = require("node-cron");
const mongoose = require("mongoose");

const VaccinationRecord = require("../models/VaccinationRecord");
const FosterAssignment = require("../models/FosterAssignment");
const Notification = require("../models/Notifications");
const User = require("../models/User");
const { getGlobalSettings } = require("../utils/globalSettings");
const { sendVaccinationReminderEmail } = require("../services/emailService");

// Remind this many days before the next dose is due
const DAYS_AHEAD = 3;

function formatDate(date) {
    return new Date(date).toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Manila",
    });
}

async function runVaccinationReminders() {
    if (mongoose.connection.readyState !== 1) return;

    const settings = await getGlobalSettings();
    if (settings?.notifications?.medicalAlerts === false) return;

    const limit = new Date(Date.now() + DAYS_AHEAD * 24 * 60 * 60 * 1000);

    // Due soon or overdue, and not yet reminded for this due date
    const records = await VaccinationRecord.find({
        next_due_date: { $ne: null, $lte: limit },
        $expr: { $ne: ["$reminder_sent_for", "$next_due_date"] },
    }).populate("animal_id", "name");

    if (records.length === 0) return;

    const staff = await User.find({ role: { $in: ["admin", "staff"] } }).select("_id");
    const now = new Date();
    let sent = 0;

    for (const record of records) {
        const petName = record.animal_id?.name || "An animal";
        const dueText = formatDate(record.next_due_date);
        const overdue = record.next_due_date < now;
        const title = overdue ? "Vaccination overdue" : "Vaccination due soon";
        const message = `${petName}: ${record.vaccine_name} ${overdue ? "was due" : "is due"} on ${dueText}.`;

        if (staff.length > 0) {
            await Notification.insertMany(
                staff.map((user) => ({ user: user._id, title, message, type: "vaccination" }))
            );
        }

        // Email the foster if the animal is in an active foster home
        if (record.animal_id?._id) {
            const assignment = await FosterAssignment.findOne({
                animalId: record.animal_id._id,
                status: "active",
            }).select("fosterEmail");

            if (assignment?.fosterEmail) {
                try {
                    await sendVaccinationReminderEmail(assignment.fosterEmail, petName, dueText);
                } catch (error) {
                    console.error("[Vaccination reminders] email failed:", error.message);
                }
            }
        }

        await VaccinationRecord.updateOne(
            { _id: record._id },
            { $set: { reminder_sent_for: record.next_due_date } }
        );
        sent += 1;
    }

    console.log(`[Vaccination reminders] sent ${sent} reminder(s)`);
}

function startVaccinationReminders() {
    // Every day at 8:00 AM Manila time
    cron.schedule(
        "0 8 * * *",
        () => {
            runVaccinationReminders().catch((error) =>
                console.error("[Vaccination reminders] failed:", error.message)
            );
        },
        { timezone: "Asia/Manila" }
    );

    // Also check once shortly after the server starts
    setTimeout(() => {
        runVaccinationReminders().catch((error) =>
            console.error("[Vaccination reminders] failed:", error.message)
        );
    }, 15000);
}

module.exports = startVaccinationReminders;
module.exports.runVaccinationReminders = runVaccinationReminders;
