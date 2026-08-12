const LostFoundReport = require("../models/LostFoundReport");
const LedgerEntry = require("../models/LedgerEntry");

function getActorName(req) {
    return String(req.user?.name || req.user?.username || "User").trim();
}

function getActorEmail(req) {
    return String(req.user?.email || "").trim().toLowerCase();
}

exports.createReport = async (req, res) => {
    const reportType = String(req.body.reportType || "").trim().toLowerCase();
    const species = String(req.body.species || "").trim();
    const description = String(req.body.description || "").trim();
    const location = String(req.body.location || "").trim();

    if (!["lost", "found"].includes(reportType)) {
        const e = new Error("Report type must be either lost or found.");
        e.statusCode = 400;
        throw e;
    }

    if (!species) {
        const e = new Error("Pet species is required.");
        e.statusCode = 400;
        throw e;
    }

    if (!description) {
        const e = new Error("Description is required.");
        e.statusCode = 400;
        throw e;
    }

    if (!location) {
        const e = new Error("Location is required.");
        e.statusCode = 400;
        throw e;
    }

    const reporterName = getActorName(req);
    const reporterEmail = getActorEmail(req);

    if (!reporterEmail) {
        const e = new Error("Authenticated user email is missing.");
        e.statusCode = 401;
        throw e;
    }

    const report = await LostFoundReport.create({
        reporterName,
        reporterEmail,
        reportType,
        petName: String(
            req.body.petName || ""
        ).trim(),
        species,
        breed: String(
            req.body.breed || ""
        ).trim(),
        description,
        location,
        dateReported:
            req.body.dateReported ||
            new Date(),
        photoUrl: String(
            req.body.photoUrl || ""
        ).trim(),
        status: "open",
        matchStatus: "none",
        claimStatus: "none",
    });

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_report_submitted",
        actorName: reporterName,
        actorEmail: reporterEmail,
        targetType: "LostFoundReport",
        targetId: report._id.toString(),
        description:
            `${reporterName} submitted a ${report.reportType} pet report.`,
        status: report.status,
        metadata: {
            reportType: report.reportType,
            petName: report.petName,
            species: report.species,
            location: report.location,
        },
    });

    return res.status(201).json({
        success: true,
        message:
            `${report.reportType === "lost" ? "Lost" : "Found"} pet report submitted successfully.`,
        report,
    });
};

exports.getAllReports = async (req, res) => {
    const reports = await LostFoundReport.find()
        .sort({ createdAt: -1 });

    return res.json({
        success: true,
        reports,
    });
};

exports.getMyReports = async (req, res) => {
    const email = getActorEmail(req);

    if (!email) {
        const error = new Error(
            "Authenticated user email is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    const reports = await LostFoundReport.find({
        reporterEmail: email,
    }).sort({
        createdAt: -1,
    });

    return res.json({
        success: true,
        reports,
    });
};

exports.getReportById = async (req, res) => {
    const report = await LostFoundReport.findById(
        req.params.id
    );

    if (!report) {
        const error = new Error(
            "Lost and found report not found."
        );

        error.statusCode = 404;
        throw error;
    }

    return res.json({
        success: true,
        report,
    });
};

exports.deleteReport = async (req, res) => {
    const { reportId } = req.params;

    const report = await LostFoundReport.findById(reportId);

    if (!report) {
        const e = new Error("Lost and found report not found.");
        e.statusCode = 404;
        throw e;
    }

    await LostFoundReport.findByIdAndDelete(reportId);

    return res.status(200).json({
        success: true,
        message: "Lost and found report deleted successfully.",
    });
};

exports.claimReport = async (req, res) => {
    const report = await LostFoundReport.findById(
        req.params.id
    );

    if (!report) {
        const error = new Error(
            "Lost and found report not found."
        );

        error.statusCode = 404;
        throw error;
    }

    const claimantName = getActorName(req);
    const claimantEmail = getActorEmail(req);

    if (!claimantEmail) {
        const error = new Error(
            "Authenticated user email is missing."
        );

        error.statusCode = 401;
        throw error;
    }

    // A reporter cannot claim their own report.
    if (
        report.reporterEmail === claimantEmail
    ) {
        const error = new Error(
            "You cannot claim your own lost and found report."
        );

        error.statusCode = 400;
        throw error;
    }

    if (
        report.status === "reunited" ||
        report.status === "rejected"
    ) {
        const error = new Error(
            "This report is no longer available for claims."
        );

        error.statusCode = 400;
        throw error;
    }

    if (report.claimStatus === "pending") {
        const error = new Error(
            "This report already has a pending claim."
        );

        error.statusCode = 400;
        throw error;
    }

    report.claimStatus = "pending";
    report.claimedByName = claimantName;
    report.claimedByEmail = claimantEmail;
    report.claimNotes = String(
        req.body.claimNotes || ""
    ).trim();

    report.status = "claimed";

    await report.save();

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_claim_submitted",

        actorName: claimantName,
        actorEmail: claimantEmail,

        targetType: "LostFoundReport",
        targetId: report._id.toString(),

        description:
            `${claimantName} submitted a claim for ${report.petName || report.species}.`,

        status: report.status,

        metadata: {
            petName: report.petName,
            species: report.species,
            reporterEmail: report.reporterEmail,
            claimNotes: report.claimNotes,
        },
    });

    return res.json({
        success: true,
        message:
            "Claim submitted for verification.",
        report,
    });
};

exports.reviewClaim = async (req, res) => {
    const allowedStatuses = [
        "approved",
        "rejected",
    ];

    const claimStatus = String(
        req.body.claimStatus || ""
    ).trim().toLowerCase();

    if (!allowedStatuses.includes(claimStatus)) {
        const error = new Error(
            "Invalid claim status."
        );

        error.statusCode = 400;
        throw error;
    }

    const report = await LostFoundReport.findById(
        req.params.id
    );

    if (!report) {
        const error = new Error(
            "Lost and found report not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (report.claimStatus !== "pending") {
        const error = new Error(
            "This report does not have a pending claim."
        );

        error.statusCode = 400;
        throw error;
    }

    const reviewerName = getActorName(req);
    const reviewerEmail = getActorEmail(req);

    report.claimStatus = claimStatus;

    report.reviewedByName = reviewerName;
    report.reviewedByEmail = reviewerEmail;
    report.reviewedAt = new Date();

    report.claimNotes = String(
        req.body.reviewNotes ||
        report.claimNotes ||
        ""
    ).trim();

    if (claimStatus === "approved") {
        report.status = "claimed";
    } else {
        report.status =
            report.matchStatus === "suggested"
                ? "matched"
                : "open";

        report.claimedByName = "";
        report.claimedByEmail = "";
    }

    await report.save();

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_claim_reviewed",

        actorName: reviewerName,
        actorEmail: reviewerEmail,

        targetType: "LostFoundReport",
        targetId: report._id.toString(),

        description:
            `${report.petName || report.species} claim was ${claimStatus}.`,

        status: report.status,

        metadata: {
            claimStatus,
            claimedByEmail:
                report.claimedByEmail,
            reviewNotes:
                report.claimNotes,
        },
    });

    return res.json({
        success: true,
        message:
            `Lost and found claim ${claimStatus}.`,
        report,
    });
};

exports.markReunited = async (req, res) => {
    const report = await LostFoundReport.findById(
        req.params.id
    );

    if (!report) {
        const error = new Error(
            "Lost and found report not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (
        report.claimStatus !== "approved"
    ) {
        const error = new Error(
            "A claim must be approved before marking this case as reunited."
        );

        error.statusCode = 400;
        throw error;
    }

    if (report.status === "reunited") {
        const error = new Error(
            "This case is already marked as reunited."
        );

        error.statusCode = 400;
        throw error;
    }

    const reviewerName = getActorName(req);
    const reviewerEmail = getActorEmail(req);

    report.status = "reunited";
    report.reunitedAt = new Date();

    report.reviewedByName = reviewerName;
    report.reviewedByEmail = reviewerEmail;
    report.reviewedAt = new Date();

    await report.save();

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_case_reunited",

        actorName: reviewerName,
        actorEmail: reviewerEmail,

        targetType: "LostFoundReport",
        targetId: report._id.toString(),

        description:
            `${report.petName || report.species} was marked as reunited.`,

        status: "reunited",

        metadata: {
            petName: report.petName,
            species: report.species,
            reporterEmail: report.reporterEmail,
            claimedByEmail: report.claimedByEmail,
            reunitedAt: report.reunitedAt,
        },
    });

    return res.json({
        success: true,
        message:
            "Lost and found case marked as reunited.",
        report,
    });
};