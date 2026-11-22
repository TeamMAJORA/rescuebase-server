const cron = require("node-cron");
const mongoose = require("mongoose");

const VaccinationRecord = require("../models/VaccinationRecord");
const FosterAssignment = require("../models/FosterAssignment");
const Notification = require("../models/Notifications");
const User = require("../models/User");
const { getGlobalSettings } = require("../utils/globalSettings");
const { sendVaccinationReminderEmail } = require("../services/emailService");
const { VACCINE_REMINDER_DAYS, hasNewerDose } = require("../utils/vaccinationDoses");

function formatDate(date) {
    return new Date(date).toLocaleDateString("en-PH", {
        month: "long",
        day: "numeric",
        year: "numeric",
        timeZone: "Asia/Manila",
    });
}

function isSameDate(first, second) {
    return Boolean(first && second) && new Date(first).getTime() === new Date(second).getTime();
}

async function findActiveFoster(animalId) {
    const assignment = await FosterAssignment.findOne({ animalId, status: "active" }).select("fosterEmail");
    if (!assignment?.fosterEmail) return null;

    const email = assignment.fosterEmail.toLowerCase();
    const user = await User.findOne({ email }).select("_id");
    return { email, userId: user?._id || null };
}

function reminderText(record, petName) {
    const overdue = new Date(record.next_due_date) < new Date();
    return {
        title: overdue ? "Vaccination overdue" : "Vaccination due soon",
        message: `${petName}: ${record.vaccine_name} ${overdue ? "was due" : "is due"} on ${formatDate(record.next_due_date)}.`,
    };
}

// Bell + email to the foster, once per due date. Used by the daily run and when the
// foster opens their dashboard. Claims the mark first, so two requests at once can't both send.
// Returns true if this call sent the reminder.
async function remindFoster({ record, petName, fosterEmail, fosterUserId }) {
    const claim = await VaccinationRecord.updateOne(
        { _id: record._id, foster_reminder_sent_for: { $ne: record.next_due_date } },
        { $set: { foster_reminder_sent_for: record.next_due_date } }
    );
    if (claim.modifiedCount !== 1) return false;

    const { title, message } = reminderText(record, petName);

    if (fosterUserId) {
        await Notification.create({
            user: fosterUserId,
            title,
            message: `${message} Please contact the shelter to arrange the shot.`,
            type: "vaccination",
        });
    }

    try {
        await sendVaccinationReminderEmail(fosterEmail, petName, formatDate(record.next_due_date));
    } catch (error) {
        console.error("[Vaccination reminders] email failed:", error.message);
    }

    return true;
}

async function vaccinationAlertsEnabled() {
    const settings = await getGlobalSettings();
    return settings?.notifications?.medicalAlerts !== false;
}

async function runVaccinationReminders() {
    if (mongoose.connection.readyState !== 1) return;

    if (!(await vaccinationAlertsEnabled())) return;

    const limit = new Date(Date.now() + VACCINE_REMINDER_DAYS * 24 * 60 * 60 * 1000);

    // Due soon or overdue, and staff or the foster not yet reminded for this due date
    const records = await VaccinationRecord.find({
        next_due_date: { $ne: null, $lte: limit },
        $expr: {
            $or: [
                { $ne: ["$reminder_sent_for", "$next_due_date"] },
                { $ne: ["$foster_reminder_sent_for", "$next_due_date"] },
            ],
        },
    }).populate("animal_id", "name");

    if (records.length === 0) return;

    const staff = await User.find({ role: { $in: ["admin", "staff"] } }).select("_id");
    let staffReminders = 0;
    let fosterReminders = 0;

    for (const record of records) {
        const dueDate = record.next_due_date;

        if (await hasNewerDose(record)) {
            await VaccinationRecord.updateOne(
                { _id: record._id },
                { $set: { reminder_sent_for: dueDate, foster_reminder_sent_for: dueDate } }
            );
            continue;
        }

        const petName = record.animal_id?.name || "An animal";
        const { title, message } = reminderText(record, petName);

        if (!isSameDate(record.reminder_sent_for, dueDate)) {
            if (staff.length > 0) {
                await Notification.insertMany(
                    staff.map((user) => ({ user: user._id, title, message, type: "vaccination" }))
                );
            }
            await VaccinationRecord.updateOne({ _id: record._id }, { $set: { reminder_sent_for: dueDate } });
            staffReminders += 1;
        }

        // The foster (bell + email) if the animal is in an active foster home.
        // No foster yet: checked again tomorrow, so a later placement still gets reminded.
        const foster = !isSameDate(record.foster_reminder_sent_for, dueDate) && record.animal_id?._id
            ? await findActiveFoster(record.animal_id._id)
            : null;

        if (foster) {
            if (await remindFoster({ record, petName, fosterEmail: foster.email, fosterUserId: foster.userId })) fosterReminders += 1;
        }
    }

    if (staffReminders || fosterReminders) {
        console.log(`[Vaccination reminders] staff: ${staffReminders}, fosters: ${fosterReminders}`);
    }
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
module.exports.remindFoster = remindFoster;
module.exports.vaccinationAlertsEnabled = vaccinationAlertsEnabled;
