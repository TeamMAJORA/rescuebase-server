const mongoose = require("mongoose");

const Report = require("../models/Reports");
const User = require("../models/User");


exports.createReport = async (
    req,
    res
) => {
    const userId = req.user?.id;

    if (!userId) {
        const error = new Error(
            "Authenticated user is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const user =
        await User.findById(
            userId
        ).select(
            "_id name username email role"
        );

    if (!user) {
        const error = new Error(
            "Authenticated user account was not found."
        );

        error.statusCode = 401;
        throw error;
    }

    const title = String(
        req.body.title || ""
    ).trim();

    const type = String(
        req.body.type || ""
    )
        .trim()
        .toLowerCase();

    const period = String(
        req.body.period || ""
    ).trim();

    const summary = String(
        req.body.summary || ""
    ).trim();

    const status = String(
        req.body.status || "draft"
    )
        .trim()
        .toLowerCase();


    if (!title) {
        const error = new Error(
            "Report title is required."
        );

        error.statusCode = 400;
        throw error;
    }


    if (!type) {
        const error = new Error(
            "Report type is required."
        );

        error.statusCode = 400;
        throw error;
    }


    if (!period) {
        const error = new Error(
            "Report period is required."
        );

        error.statusCode = 400;
        throw error;
    }


    if (!summary) {
        const error = new Error(
            "Report summary is required."
        );

        error.statusCode = 400;
        throw error;
    }


    const allowedTypes = [
        "adoption",
        "foster",
        "lost-found",
        "gis",
        "feedback",
        "analytics",
    ];

    if (
        !allowedTypes.includes(type)
    ) {
        const error = new Error(
            "Invalid report type."
        );

        error.statusCode = 400;
        throw error;
    }


    if (
        ![
            "draft",
            "finalized",
        ].includes(status)
    ) {
        const error = new Error(
            "Invalid report status."
        );

        error.statusCode = 400;
        throw error;
    }


    const report =
        await Report.create({
            title,
            type,
            period,
            summary,
            status,

            createdBy:
                user._id,

            createdByName:
                user.name ||
                user.username ||
                "User",

            createdByEmail:
                user.email ||
                "",

            finalizedAt:
                status === "finalized"
                    ? new Date()
                    : null,
        });


    return res.status(201).json({
        success: true,
        message:
            "Report created successfully.",
        report,
    });
};



exports.getAllReports = async (
    req,
    res
) => {
    const reports =
        await Report.find()
            .sort({
                createdAt: -1,
            });

    return res.status(200).json({
        success: true,
        reports,
    });
};



exports.finalizeReport = async (
    req,
    res
) => {
    const reportId = String(
        req.params.id || ""
    ).trim();


    if (
        !mongoose.isValidObjectId(
            reportId
        )
    ) {
        const error = new Error(
            "Invalid report ID."
        );

        error.statusCode = 400;
        throw error;
    }


    const report =
        await Report.findByIdAndUpdate(
            reportId,
            {
                $set: {
                    status: "finalized",
                    finalizedAt:
                        new Date(),
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );


    if (!report) {
        const error = new Error(
            "Report not found."
        );

        error.statusCode = 404;
        throw error;
    }


    return res.status(200).json({
        success: true,
        message:
            "Report finalized successfully.",
        report,
    });
};



exports.downloadReport = async (
    req,
    res
) => {
    const reportId = String(
        req.params.id || ""
    ).trim();


    if (
        !mongoose.isValidObjectId(
            reportId
        )
    ) {
        const error = new Error(
            "Invalid report ID."
        );

        error.statusCode = 400;
        throw error;
    }


    const report =
        await Report.findById(
            reportId
        );


    if (!report) {
        const error = new Error(
            "Report not found."
        );

        error.statusCode = 404;
        throw error;
    }


    const reportText = `
RESCUEBASE REPORT

Title        : ${report.title}
Type         : ${report.type}
Period       : ${report.period}
Created By   : ${report.createdByName}
Created Email: ${report.createdByEmail}
Created At   : ${report.createdAt}
Status       : ${report.status}
Finalized At : ${report.finalizedAt ||
        "Not finalized"
        }

Summary:
${report.summary}
    `.trim();


    const filename =
        report.title
            .replace(
                /[^a-z0-9]+/gi,
                "_"
            )
            .replace(
                /^_+|_+$/g,
                ""
            ) ||
        "rescuebase_report";


    res.setHeader(
        "Content-Type",
        "text/plain; charset=utf-8"
    );

    res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}.txt"`
    );


    return res
        .status(200)
        .send(reportText);
};



exports.deleteReport = async (
    req,
    res
) => {
    const reportId = String(
        req.params.id || ""
    ).trim();


    if (
        !mongoose.isValidObjectId(
            reportId
        )
    ) {
        const error = new Error(
            "Invalid report ID."
        );

        error.statusCode = 400;
        throw error;
    }


    const report =
        await Report.findByIdAndDelete(
            reportId
        );


    if (!report) {
        const error = new Error(
            "Report not found."
        );

        error.statusCode = 404;
        throw error;
    }


    return res.status(200).json({
        success: true,
        message:
            "Report deleted successfully.",
    });
};