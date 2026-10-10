const Animal = require("../models/Animal");
const AdoptionApplication = require("../models/AdoptionApplication");
const FosterAssignment = require("../models/FosterAssignment");
const LostFoundReport = require("../models/LostFoundReport");

exports.getOverview = async (req, res) => {
    const now = new Date();

    // Current month plus the previous five months.
    const firstMonth = new Date(
        now.getFullYear(),
        now.getMonth() - 5,
        1
    );

    const months = Array.from({ length: 6 }, (_, index) => {
        const date = new Date(
            firstMonth.getFullYear(),
            firstMonth.getMonth() + index,
            1
        );

        return {
            key: `${date.getFullYear()}-${String(
                date.getMonth() + 1
            ).padStart(2, "0")}`,
            month: date.toLocaleString("en-US", {
                month: "short",
            }),
            adoptions: 0,
            rescues: 0,
            lostFound: 0,
            foster: 0,
        };
    });

    const monthMap = new Map(
        months.map((month) => [month.key, month])
    );

    function addToMonth(dateValue, metric) {
        if (!dateValue) return;

        const date = new Date(dateValue);

        if (Number.isNaN(date.getTime())) return;

        const key = `${date.getFullYear()}-${String(
            date.getMonth() + 1
        ).padStart(2, "0")}`;

        const month = monthMap.get(key);

        if (month) month[metric]++;
    }

    const [
        totalAdoptions,
        totalRescues,
        totalLostFound,
        activeFosters,
        completedFosters,
        pendingApplications,
        adoptionAnimals,
        rescuedAnimals,
        lostFoundReports,
        fosterAssignments,
        openLostFound,
    ] = await Promise.all([
        Animal.countDocuments({
            adoptionStatus: "adopted",
        }),

        Animal.countDocuments({
            intakeType: "Rescued",
        }),

        LostFoundReport.countDocuments(),

        FosterAssignment.countDocuments({
            status: "active",
        }),

        FosterAssignment.countDocuments({
            status: "completed",
        }),

        AdoptionApplication.countDocuments({
            status: "pending",
        }),

        Animal.find({
            adoptionStatus: "adopted",
            updatedAt: { $gte: firstMonth },
        }).select("updatedAt"),

        Animal.find({
            intakeType: "Rescued",
            intakeDate: { $gte: firstMonth },
        }).select("intakeDate"),

        LostFoundReport.find({
            dateReported: { $gte: firstMonth },
        }).select("dateReported"),

        FosterAssignment.find({
            startDate: { $gte: firstMonth },
        }).select("startDate"),

        LostFoundReport.countDocuments({
            status: "open",
        }),
    ]);

    adoptionAnimals.forEach((animal) =>
        addToMonth(animal.updatedAt, "adoptions")
    );

    rescuedAnimals.forEach((animal) =>
        addToMonth(animal.intakeDate, "rescues")
    );

    lostFoundReports.forEach((report) =>
        addToMonth(report.dateReported, "lostFound")
    );

    fosterAssignments.forEach((assignment) =>
        addToMonth(assignment.startDate, "foster")
    );

    const totals = {
        adoptions: totalAdoptions,
        rescues: totalRescues,
        lostFound: totalLostFound,
        foster: activeFosters + completedFosters,
    };

    const highestAdoptionMonth = [...months].sort(
        (a, b) => b.adoptions - a.adoptions
    )[0];

    const insights = [
        {
            id: "adoptions",
            title: "Adoption activity",
            detail: `${totalAdoptions} animals currently have adopted status.`,
            type: "info",
        },
        {
            id: "lost-found",
            title: "Lost & Found follow-up",
            detail: `${openLostFound} reports currently remain open.`,
            type: openLostFound > 0 ? "warning" : "positive",
        },
        {
            id: "foster",
            title: "Foster care",
            detail: `${activeFosters} active and ${completedFosters} completed foster assignments.`,
            type: "info",
        },
    ];

    if (highestAdoptionMonth?.adoptions > 0) {
        insights.unshift({
            id: "monthly-adoptions",
            title: "Monthly adoption activity",
            detail: `${highestAdoptionMonth.month} has the highest recorded adoption activity in the displayed six-month period.`,
            type: "positive",
        });
    }

    return res.status(200).json({
        success: true,
        generatedAt: now,
        totals,
        details: {
            pendingApplications,
            activeFosters,
            completedFosters,
            openLostFound,
        },
        monthlyStats: months,
        insights,
        notes: {
            adoptions:
                "Monthly adoption activity uses Animal.updatedAt because the Animal schema does not have a dedicated adoption date.",
            foster:
                "Monthly foster activity counts assignments by startDate.",
        },
    });
};