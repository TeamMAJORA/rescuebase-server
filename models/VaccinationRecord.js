const mongoose = require("mongoose");

const vaccinationRecordSchema =
    new mongoose.Schema(
        {
            animal_id: {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Animal",
                required: true,
            },

            vaccine_name: {
                type: String,
                required: true,
                trim: true,
            },

            vaccination_date: {
                type: Date,
                required: true,
            },

            next_due_date: {
                type: Date,
                default: null,
            },

            // Due date we last reminded staff about (prevents repeats)
            reminder_sent_for: {
                type: Date,
                default: null,
            },

            // Due date we last reminded the foster about. Separate from staff, so a pet
            // placed in foster care after staff were reminded still gets its foster reminded.
            foster_reminder_sent_for: {
                type: Date,
                default: null,
            },

            veterinarian: {
                type: String,
                trim: true,
                default: null,
            },
            
            status: {
                type: String,
                enum: ["Completed", "Pending", "Overdue"],
                default: "Completed",
            },

            notes: {
                type: String,
                trim: true,
                default: "",
            },
        },
        {
            timestamps: true,
        }
    );

module.exports = mongoose.model(
    "VaccinationRecord",
    vaccinationRecordSchema
);