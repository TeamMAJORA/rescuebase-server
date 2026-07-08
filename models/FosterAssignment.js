const mongoose = require('mongoose');

const fosterUpdateSchema = new mongoose.Schema(
    {
        note : String,
        photoUrl : String,
        submittedBy : String,
        submittedByEmail : String,
    },
    { timestamps : true }
);

const fosterAssignmentSchema = new mongoose.Schema(
    {
        petName : {
            type : String,
            required : true,
        },

        petBreed : String,
        petImage : String,

        fosterName : {
            type : String,
            required : true,
        },

        fosterEmail : {
            type : String,
            required : true,
        },

        fosterApplicationId : {
            type : mongoose.Schema.Types.ObjectId,
            ref : "FosterApplication",
            default : null,
        },

        shelterName : {
            type : String,
            default : "RescueBase Shelter",
        },

        careInstructions : {
            type : String,
            default : "Provide food, water, shelter, and weekly updates.",
        },

        status : {
            type : String,
            enum : ["active", "completed", "cancelled"],
            default : "active",
        },

        startDate : {
            type : Date,
            default : Date.now,
        },

        endDate : Date,

        updates : [fosterUpdateSchema],
    },
    { timestamps: true }
);

module.exports = mongoose.model("FosterAssignment", fosterAssignmentSchema);