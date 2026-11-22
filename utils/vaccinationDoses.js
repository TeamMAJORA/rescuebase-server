const VaccinationRecord = require("../models/VaccinationRecord");

// Staff and fosters are reminded this many days before a dose is due
const VACCINE_REMINDER_DAYS = 3;

function escapeRegex(text) {
    return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// A later shot of the same vaccine was recorded, so this record's due date is already handled
function hasNewerDose(record) {
    return VaccinationRecord.exists({
        _id: { $ne: record._id },
        animal_id: record.animal_id?._id || record.animal_id,
        vaccine_name: new RegExp(`^${escapeRegex(record.vaccine_name)}$`, "i"),
        vaccination_date: { $gt: record.vaccination_date },
    });
}

// Vaccinations due on or before `dueBy` (overdue included) that no later shot replaced,
// soonest first. Used by the daily reminders and the foster dashboard.
async function findDueVaccinations(animalIds, dueBy) {
    const records = await VaccinationRecord.find({
        animal_id: { $in: animalIds },
        next_due_date: { $ne: null, $lte: dueBy },
    })
        .sort({ next_due_date: 1 })
        .lean();

    const current = [];
    for (const record of records) {
        if (!(await hasNewerDose(record))) current.push(record);
    }
    return current;
}

module.exports = { VACCINE_REMINDER_DAYS, hasNewerDose, findDueVaccinations };
