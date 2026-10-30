const GISLocation = require("../models/GISLocation");
const LostFoundReport = require("../models/LostFoundReport");
const LedgerEntry = require("../models/LedgerEntry");
const LostFoundMatch = require("../models/LostFoundMatch");
const { sendLostFoundClaimEmail, sendLostFoundReunitedEmail } = require("../services/emailService");
const { generatematches } = require("../services/lostFoundMatchingService");

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

    const latitude = Number(req.body.latitude);
    const longitude = Number(req.body.longitude);

    const hasValidCoordinates =
        Number.isFinite(latitude) &&
        Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 &&
        Math.abs(longitude) <= 180 &&
        (latitude !== 0 || longitude !== 0);

    const coordinates = hasValidCoordinates
        ? { latitude, longitude }
        : { latitude: null, longitude: null };

    const eventDateValue =
        req.body.eventDate ||
        req.body.dateLost ||
        req.body.dateFound ||
        null;

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
        colour: String(
            req.body.colour || req.body.color || ""
        ).trim(),

        size: String(
            req.body.size || ""
        ).trim(),

        sex: String(
            req.body.sex || ""
        ).trim(),

        coordinates,
        eventDate: eventDateValue,
        status: "open",
        matchStatus: "none",
        claimStatus: "none",
    });

    if (
        Number.isFinite(latitude) && Number.isFinite(longitude) &&
        Math.abs(latitude) <= 90 && Math.abs(longitude) <= 180 &&
        (latitude !== 0 || longitude !== 0)
    ) {
        try {
            const speciesKey = species.toLowerCase();

            await GISLocation.create({
                petName: report.petName || "Unknown",
                reportType,
                species: ["dog", "cat", "other"].includes(speciesKey) ? speciesKey : "unknown",
                locationName: location,
                latitude,
                longitude,
                status: "open",
                description: String(req.body.mapNote || description).slice(0, 500),
                createdBy: req.user?.id || req.user?._id || null,
                createdByName: reporterName || "",
                createdByEmail: reporterEmail || "",
            });
        } catch (gisError) {
            console.error("Lost & found map pin failed:", gisError.message);
        }
    }

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

    let matchingResult = {
        success: false,
        matchesCreated: 0,
    };

    try {
        matchingResult = await generateMatches(report._id);

        console.log(
            `[LostFound] Generated ${matchingResult.matchesCreated} suggestions for report ${report._id}`
        );
    } catch (matchingError) {
        console.error(
            "[LostFound] Automatic matching failed:",
            matchingError
        );
    }

    return res.status(201).json({
        success: true,
        message:
            `${report.reportType === "lost" ? "Lost" : "Found"} pet report submitted successfully.`,
        report,
        matching: matchingResult,
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

    if (report.claimStatus === "approved") {
        const error = new Error(
            "This report already has an approved claim."
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
    // "revoked" = take back an approved claim (claimant never came)
    const allowedStatuses = [
        "approved",
        "rejected",
        "revoked",
    ];

    const requested = String(
        req.body.claimStatus || ""
    ).trim().toLowerCase();

    if (!allowedStatuses.includes(requested)) {
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

    if (requested === "revoked") {
        if (report.claimStatus !== "approved" || report.status === "reunited") {
            const error = new Error(
                "Only an approved claim that isn't reunited yet can be revoked."
            );

            error.statusCode = 400;
            throw error;
        }
    } else if (report.claimStatus !== "pending") {
        const error = new Error(
            "This report does not have a pending claim."
        );

        error.statusCode = 400;
        throw error;
    }

    // A revoked claim is saved as rejected and the report opens again
    const claimStatus = requested === "revoked" ? "rejected" : requested;

    const reviewerName = getActorName(req);
    const reviewerEmail = getActorEmail(req);
    const claimantEmailForMail = report.claimedByEmail;
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

    await sendLostFoundClaimEmail(
        claimantEmailForMail,
        report.petName || report.species,
        claimStatus
    );

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

    await sendLostFoundReunitedEmail(
        report.reporterEmail,
        report.petName || report.species
    );

    return res.json({
        success: true,
        message:
            "Lost and found case marked as reunited.",
        report,
    });
};

exports.getPossibleMatches = async (req, res) => {
    const page = Math.max(
        1,
        parseInt(req.query.page, 10) || 1
    );

    const limit = Math.min(
        100,
        Math.max(1, parseInt(req.query.limit, 10) || 20)
    );

    const skip = (page - 1) * limit;

    const [matches, total] = await Promise.all([
        LostFoundMatch.find({
            status: "suggested",
        })
            .populate("reportA")
            .populate("reportB")
            .sort({
                score: -1,
                createdAt: -1,
            })
            .skip(skip)
            .limit(limit)
            .lean(),

        LostFoundMatch.countDocuments({
            status: "suggested",
        }),
    ]);

    return res.json({
        success: true,
        matches,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
};


exports.reviewPossibleMatch = async (req, res) => {
    const matchId = req.params.matchId;

    const decision = String(
        req.body.decision || ""
    )
        .trim()
        .toLowerCase()
        .replace(/\s+/g, "_");

    const allowedDecisions = [
        "confirm",
        "not_a_match",
    ];

    if (!allowedDecisions.includes(decision)) {
        const error = new Error(
            "Decision must be confirm or not_a_match."
        );

        error.statusCode = 400;
        throw error;
    }

    const match = await LostFoundMatch.findById(matchId);

    if (!match) {
        const error = new Error(
            "Possible match not found."
        );

        error.statusCode = 404;
        throw error;
    }

    if (match.status !== "suggested") {
        const error = new Error(
            `This match has already been ${match.status}.`
        );

        error.statusCode = 409;
        throw error;
    }

    const reportA = await LostFoundReport.findById(
        match.reportA
    );

    const reportB = await LostFoundReport.findById(
        match.reportB
    );

    if (!reportA || !reportB) {
        const error = new Error(
            "One or both reports associated with this match no longer exist."
        );

        error.statusCode = 404;
        throw error;
    }

    if (decision === "confirm") {
        const validPair =
            reportA.reportType === "lost" &&
            reportB.reportType === "found" ||
            reportA.reportType === "found" &&
            reportB.reportType === "lost";

        if (!validPair) {
            const error = new Error(
                "Only a Lost and Found report pair can be confirmed."
            );

            error.statusCode = 400;
            throw error;
        }

        const unavailableStatuses = [
            "matched",
            "reunited",
            "claimed",
            "rejected",
        ];

        if (
            unavailableStatuses.includes(reportA.status) ||
            unavailableStatuses.includes(reportB.status)
        ) {
            const error = new Error(
                "One or both reports are no longer available for matching."
            );

            error.statusCode = 409;
            throw error;
        }

        const speciesA = String(reportA.species || "")
            .trim()
            .toLowerCase();

        const speciesB = String(reportB.species || "")
            .trim()
            .toLowerCase();

        if (speciesA !== speciesB) {
            const error = new Error(
                "The reports have different animal species."
            );

            error.statusCode = 400;
            throw error;
        }

        const reviewerName = getActorName(req);
        const reviewerEmail = getActorEmail(req);

        const reviewerId =
            req.user?.id ||
            req.user?._id ||
            null;

        reportA.status = "matched";
        reportB.status = "matched";

        reportA.matchStatus = "confirmed";
        reportB.matchStatus = "confirmed";

        await Promise.all([
            reportA.save(),
            reportB.save(),
        ]);

        match.status = "confirmed";
        match.reviewedBy = reviewerId;
        match.reviewedAt = new Date();
        match.reviewNotes = String(
            req.body.reviewNotes || ""
        ).trim();

        await match.save();

        await LostFoundMatch.updateMany(
            {
                _id: { $ne: match._id },
                status: "suggested",
                $or: [
                    {
                        reportA: {
                            $in: [reportA._id, reportB._id],
                        },
                    },
                    {
                        reportB: {
                            $in: [reportA._id, reportB._id],
                        },
                    },
                ],
            },
            {
                $set: {
                    status: "not_a_match",
                    reviewedAt: new Date(),
                    reviewNotes:
                        "Closed because one of the reports was matched.",
                },
            }
        );

        await LedgerEntry.create({
            type: "lost_found",
            action: "lost_found_match_confirmed",
            actorName: reviewerName,
            actorEmail: reviewerEmail,
            targetType: "LostFoundMatch",
            targetId: match._id.toString(),
            description:
                `${reviewerName} confirmed a Lost & Found report match.`,
            status: "confirmed",
            metadata: {
                matchId: match._id,
                reportA: reportA._id,
                reportB: reportB._id,
                score: match.score,
            },
        });

        return res.json({
            success: true,
            message: "Possible match confirmed successfully.",
            match,
            reports: [
                reportA,
                reportB,
            ],
        });
    }

    match.status = "not_a_match";
    match.reviewedBy =
        req.user?.id ||
        req.user?._id ||
        null;

    match.reviewedAt = new Date();

    match.reviewNotes = String(
        req.body.reviewNotes || ""
    ).trim();

    await match.save();

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_match_rejected",
        actorName: getActorName(req),
        actorEmail: getActorEmail(req),
        targetType: "LostFoundMatch",
        targetId: match._id.toString(),
        description:
            `${getActorName(req)} marked a suggested Lost & Found pair as not a match.`,
        status: "not_a_match",
        metadata: {
            matchId: match._id,
            reportA: reportA._id,
            reportB: reportB._id,
            score: match.score,
        },
    });

    return res.json({
        success: true,
        message: "Candidate pair marked as not a match.",
        match,
    });
};