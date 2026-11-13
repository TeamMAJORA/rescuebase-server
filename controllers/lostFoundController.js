const mongoose = require("mongoose");
const LostFoundReport = require("../models/LostFoundReport");
const LedgerEntry = require("../models/LedgerEntry");
const LostFoundMatch = require("../models/LostFoundMatch");
const User = require("../models/User");
const Animal = require("../models/Animal");
const Notification = require("../models/Notifications");
const {
    sendLostFoundClaimEmail,
    sendLostFoundReunitedEmail,
    sendLostFoundMatchEmail,
    sendLostFoundStaffAlertEmail,
} = require("../services/emailService");
const { generateMatches } = require("../services/lostFoundMatchingService");
const stripLegacyContact = require("../utils/stripLegacyContact");

// In-app notification for one user, found by email. Never throws.
async function notifyUserInApp(email, title, message) {
    try {
        const recipient = await User.findOne({ email: String(email || "").trim().toLowerCase() }).select("_id");

        if (recipient) {
            await Notification.create({ user: recipient._id, title, message, type: "lost_found_update" });
        }
    } catch (error) {
        console.error(`Lost & Found in-app notification failed for ${email}:`, error);
    }
}

// In-app notification + email to every admin and staff account. Never throws.
async function notifyShelterStaff(title, message) {
    try {
        const shelterStaff = await User.find({ role: { $in: ["admin", "staff"] } }).select("_id email");

        if (shelterStaff.length) {
            await Notification.insertMany(
                shelterStaff.map((user) => ({ user: user._id, title, message, type: "lost_found_update" }))
            );
        }

        await Promise.allSettled(
            shelterStaff.map((user) => sendLostFoundStaffAlertEmail(user.email, title, message))
        );
    } catch (error) {
        console.error(`Shelter staff notification failed (${title}):`, error);
    }
}

// The shelter is in Cebu: "today" is the calendar day there, whatever the server's time zone
const SHELTER_TIME_ZONE = "Asia/Manila";

function shelterDay(date) {
    return date.toLocaleDateString("en-CA", { timeZone: SHELTER_TIME_ZONE }); // "YYYY-MM-DD"
}

// Date lost/found: required, a real date, and not in the future
function readPastDate(value, label) {
    const date = new Date(value);

    if (!value || Number.isNaN(date.getTime())) {
        const e = new Error(`A valid ${label} is required.`);
        e.statusCode = 400;
        throw e;
    }

    // "YYYY-MM-DD" from the form is compared as a calendar day, not a UTC instant
    const day = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : shelterDay(date);

    if (day > shelterDay(new Date())) {
        const e = new Error(`The ${label} can't be in the future.`);
        e.statusCode = 400;
        throw e;
    }

    return date;
}

function getActorName(req) {
    return String(req.user?.name || req.user?.username || "User").trim();
}

function getActorEmail(req) {
    return String(req.user?.email || "").trim().toLowerCase();
}

function preventStaffAdmin(req) {
    const role = String(req.user?.role || "")
        .trim()
        .toLowerCase();

    if (role === "admin" || role === "staff") {
        const error = new Error(
            "Staff and Admin accounts cannot submit Lost & Found reports or claims."
        );

        error.statusCode = 403;
        throw error;
    }
}

// A shelter intake gets its own wording so owners know the pet is at the shelter.
function describeMatchForOwner(owner, other, isConfirmedByStaff) {
    if (other.linkedAnimal) {
        const species = String(other.species || "animal").toLowerCase();
        const ownPetName = owner.petName || "your pet";

        return isConfirmedByStaff
            ? {
                title: "Shelter Animal Confirmed as a Match",
                message: `Shelter staff confirmed that a ${species} at the shelter matches ${ownPetName}. Open Lost & Found to claim it.`,
            }
            : {
                title: "A Shelter Animal May Be Your Pet",
                message: `A ${species} admitted to the shelter may be ${ownPetName}. Open Lost & Found to check it and claim it if it's yours.`,
            };
    }

    const petName = owner.petName || other.petName || "your reported pet";

    return isConfirmedByStaff
        ? {
            title: "Lost & Found Match Confirmed",
            message: `Shelter staff confirmed a matching ${other.reportType} report for ${petName}. Open Lost & Found to check it.`,
        }
        : {
            title: "Possible Lost & Found Match",
            message: `RescueBase found a possible matching ${other.reportType} report for ${petName}. Open Lost & Found to check it.`,
        };
}

async function notifyLostFoundMatchOwners(reportA, reportB, isConfirmedByStaff = false) {
    const reports = [
        { owner: reportA, other: reportB },
        { owner: reportB, other: reportA },
    ];

    for (const { owner, other } of reports) {
        // Shelter-listed animals: staff already see claims, skip match alerts to them
        if (owner.linkedAnimal) continue;

        const email = String(owner.reporterEmail || "")
            .trim()
            .toLowerCase();

        if (!email) continue;

        const petName =
            owner.petName || other.petName || "your reported pet";

        // In-app notification
        try {
            const user = await User.findOne({ email }).select("_id email");

            if (user) {
                await Notification.create({
                    user: user._id,
                    ...describeMatchForOwner(owner, other, isConfirmedByStaff),
                    type: "lost_found_update",
                });
            } else {
                console.warn(
                    `Lost & Found notification skipped: no user found for ${email}`
                );
            }
        } catch (error) {
            console.error(
                `Lost & Found in-app notification failed for ${email}:`,
                error
            );
        }

        // Email notification
        try {
            await sendLostFoundMatchEmail(
                email,
                petName,
                other.reportType,
                other.location
            );
        } catch (error) {
            console.error(
                `Lost & Found match email failed for ${email}:`,
                error
            );
        }
    }
}

// Tell every adopter about a new lost or found pet so the community can help.
// Skips the reporter and anyone already told about a match. Never throws.
async function announceReportToAdopters(report, matchingResult) {
    try {
        const alreadyNotifiedEmails = [
            report.reporterEmail,
            ...(matchingResult.newlyMatchedReports || []).map((matched) => matched.reporterEmail),
        ].filter(Boolean);

        const adopters = await User.find({
            role: "adopter",
            email: { $nin: alreadyNotifiedEmails },
        }).select("_id");

        if (!adopters.length) return;

        const species = String(report.species || "pet").toLowerCase();
        const place = report.location || "Cebu";

        const announcement = report.linkedAnimal
            ? {
                title: "Found Pet at the Shelter",
                message: `A ${species} found near ${place} was brought to the shelter. If it's yours, open Lost & Found to claim it.`,
            }
            : report.reportType === "lost"
                ? {
                    title: "Lost Pet Reported",
                    message: `${report.petName ? `${report.petName}, a ${species},` : `A ${species}`} was reported lost near ${place}. If you see it, open Lost & Found.`,
                }
                : {
                    title: "Found Pet Reported",
                    message: `A ${species} was found near ${place}. If it's yours, open Lost & Found to claim it.`,
                };

        await Notification.insertMany(
            adopters.map((adopter) => ({
                user: adopter._id,
                ...announcement,
                type: "lost_found_update",
            }))
        );
    } catch (error) {
        console.error(`Lost & Found announcement failed for report ${report._id}:`, error);
    }
}

async function notifyNewMatches(report, matchingResult) {
    for (const matchedReport of matchingResult.newlyMatchedReports || []) {
        await notifyLostFoundMatchOwners(report, matchedReport);
    }
}

// When a claim is approved, the owner's lost report that was matched to it is reunited too.
async function closeOwnersMatchedLostReports(foundReport, ownerEmail) {
    const pairedMatches = await LostFoundMatch.find({
        $or: [{ reportA: foundReport._id }, { reportB: foundReport._id }],
    }).select("reportA reportB");

    const pairedReportIds = pairedMatches.map((match) =>
        String(match.reportA) === String(foundReport._id) ? match.reportB : match.reportA
    );

    await LostFoundReport.updateMany(
        {
            _id: { $in: pairedReportIds },
            reportType: "lost",
            reporterEmail: ownerEmail,
            status: { $in: ["open", "matched"] },
        },
        { $set: { status: "reunited", reunitedAt: new Date() } }
    );
}

// Shelter animals linked to a found report follow its claim status.
async function updateLinkedAnimal(report, animalChanges) {
    if (!report.linkedAnimal) return;

    await Animal.findByIdAndUpdate(report.linkedAnimal, animalChanges);
}

// Called by animalController when an intake is saved by staff or approved.
// Only intakes ticked "List on Lost & Found" become found reports owners can match and claim.
// The animal left the shelter (adopted or profile deleted): take its found
// listing and match suggestions down. Reunited listings stay as history.
exports.removeShelterListing = async (animalId) => {
    const listingIds = await LostFoundReport.find({
        linkedAnimal: animalId,
        status: { $ne: "reunited" },
    }).distinct("_id");

    if (!listingIds.length) return;

    await LostFoundMatch.deleteMany({
        $or: [{ reportA: { $in: listingIds } }, { reportB: { $in: listingIds } }],
    });
    await LostFoundReport.deleteMany({ _id: { $in: listingIds } });
};

exports.listShelterIntakeAsFoundReport = async (animal, approvingUser) => {
    try {
        if (!animal.listOnLostFound) return;

        const isAlreadyListed = await LostFoundReport.exists({ linkedAnimal: animal._id });
        if (isAlreadyListed) return;

        const animalColour = String(animal.color || "").toLowerCase();
        const reportColours = LostFoundReport.schema.path("colour").enumValues.filter(Boolean);
        const coloursInAnimalText = reportColours.filter((colour) =>
            animalColour.includes(colour.toLowerCase())
        );
        const reportColour = !animalColour
            ? ""
            : coloursInAnimalText.length > 1
                ? "Mixed"
                : coloursInAnimalText[0] || "Other";

        const hasCoordinates =
            Number.isFinite(animal.latitude) && Number.isFinite(animal.longitude);

        const report = await LostFoundReport.create({
            reporterName: approvingUser?.name || approvingUser?.username || "RescueBase Shelter",
            reporterEmail: approvingUser?.email,
            reportType: "found",
            petName: animal.name || "",
            species: animal.type,
            breed: animal.breed || "",
            colour: reportColour,
            size: animal.size === "Unknown" ? "" : animal.size || "",
            sex: animal.gender || "",
            description:
                animal.description ||
                animal.intakeNotes ||
                `Admitted to the shelter as a ${String(animal.intakeType).toLowerCase()} animal.`,
            location: animal.sourceLocation || animal.location || "RescueBase Shelter",
            coordinates: hasCoordinates
                ? { latitude: animal.latitude, longitude: animal.longitude }
                : { latitude: null, longitude: null },
            eventDate: animal.intakeDate || new Date(),
            photoUrl: animal.image || "",
            linkedAnimal: animal._id,
        });

        const matchingResult = await generateMatches(report._id);
        await notifyNewMatches(report, matchingResult);
        await announceReportToAdopters(report, matchingResult);
        console.log(
            `[LostFound] Shelter intake ${animal._id} listed as found report ${report._id} (${matchingResult.matchesCreated} suggestions)`
        );
    } catch (error) {
        console.error(
            `[LostFound] Shelter intake ${animal._id} could not be listed as a found report:`,
            error
        );
    }
};

exports.createReport = async (req, res) => {

    const allowedColours = [
        "Black",
        "White",
        "Brown",
        "Tan",
        "Gray",
        "Grey",
        "Cream",
        "Golden",
        "Orange",
        "Red",
        "Mixed",
        "Other",
    ];

    const allowedSizes = [
        "Small",
        "Medium",
        "Large",
        "Extra Large",
    ];

    const allowedSexes = [
        "Male",
        "Female",
        "Unknown",
    ];

    const reportType = String(req.body.reportType || "").trim().toLowerCase();
    const species = String(req.body.species || "").trim();
    const description = String(req.body.description || "").trim();
    const location = String(req.body.location || "").trim();
    const size = String(req.body.size || "").trim();
    const sex = String(req.body.sex || "").trim();
    const colour = String(
        req.body.colour || req.body.color || ""
    ).trim();

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

    if (colour && !allowedColours.includes(colour)) {
        const error = new Error("Invalid pet colour.");
        error.statusCode = 400;
        throw error;
    }

    if (size && !allowedSizes.includes(size)) {
        const error = new Error("Invalid pet size.");
        error.statusCode = 400;
        throw error;
    }

    if (sex && !allowedSexes.includes(sex)) {
        const error = new Error("Invalid pet sex.");
        error.statusCode = 400;
        throw error;
    }

    if (reportType === "found" && !String(req.body.photoUrl || "").trim()) {
        const error = new Error("A photo is required for found pet reports so the owner can recognize the pet.");
        error.statusCode = 400;
        throw error;
    }

    const reporterName = getActorName(req);
    const reporterEmail = getActorEmail(req);

    if (!reporterEmail) {
        const e = new Error("Authenticated user email is missing.");
        e.statusCode = 401;
        throw e;
    }

    const reporterContactNumber = String(req.body.contactNumber || "").trim();

    if (!/^9\d{9}$/.test(reporterContactNumber)) {
        const e = new Error("Please enter a valid mobile number: 10 digits starting with 9.");
        e.statusCode = 400;
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

    const dateLabel = reportType === "lost" ? "date lost" : "date found";
    const dateReported = readPastDate(req.body.dateReported, dateLabel);

    const eventDateInput = req.body.eventDate || req.body.dateLost || req.body.dateFound;
    const eventDateValue = eventDateInput ? readPastDate(eventDateInput, dateLabel) : null;

    const report = await LostFoundReport.create({
        reporterName,
        reporterEmail,
        reporterContactNumber,
        reportType,
        petName: String(req.body.petName || "").trim(),
        species,
        breed: String(req.body.breed || "").trim(),
        description,
        location,
        dateReported,
        photoUrl: String(req.body.photoUrl || "").trim(),
        colour,
        size,
        sex,
        coordinates,
        eventDate: eventDateValue,
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

    let matchingResult = {
        success: false,
        matchesCreated: 0,
    };

    try {
        matchingResult = await generateMatches(report._id);
        await notifyNewMatches(report, matchingResult);

        console.log(
            `[LostFound] Generated ${matchingResult.matchesCreated} suggestions for report ${report._id}`
        );
    } catch (matchingError) {
        console.error(
            "[LostFound] Automatic matching failed:",
            matchingError
        );
    }

    await announceReportToAdopters(report, matchingResult);

    return res.status(201).json({
        success: true,
        message:
            `${report.reportType === "lost" ? "Lost" : "Found"} pet report submitted successfully.`,
        report: reportForViewer(report, req),
        matching: matchingResult,
    });
};

// Who decides a report's claims: the person who filed it, or any staff/admin for a
// shelter intake listing (the shelter owns those).
function canReviewClaims(report, req) {
    const isMine = Boolean(getActorEmail(req)) && report.reporterEmail === getActorEmail(req);
    const isShelterStaff = ["admin", "staff"].includes(req.user?.role);

    return isMine || (isShelterStaff && Boolean(report.linkedAnimal));
}

// What each viewer may see:
// - the person who decides (above): every claim except cancelled ones, with "new" counts
// - other staff/admin: ownership claims only (read-only); found claims are private to the lost pet's owner
// - everyone else: their own claims; the reporter's mobile number once their claim is approved
const REPORTER_ONLY_FIELDS = ["reporterEmail", "reporterContactNumber"];

function reportForViewer(report, req) {
    const plain = typeof report.toObject === "function" ? report.toObject() : { ...report };
    const viewerEmail = getActorEmail(req);
    const isShelterStaff = ["admin", "staff"].includes(req.user?.role);
    const claims = plain.claims || [];
    const myClaims = claims.filter((claim) => Boolean(viewerEmail) && claim.claimantEmail === viewerEmail);
    const myLatestClaim = myClaims[myClaims.length - 1] || null;

    plain.isMine = Boolean(viewerEmail) && plain.reporterEmail === viewerEmail;
    plain.canReviewClaims = canReviewClaims(plain, req);
    plain.canDelete = canDeleteReport(plain, req);
    plain.myClaimStatus = myLatestClaim ? myLatestClaim.status : null;
    plain.myClaimType = myLatestClaim ? myLatestClaim.claimType : null;

    const visibleClaims = plain.canReviewClaims
        ? claims.filter((claim) => claim.status !== "cancelled")
        : isShelterStaff
            ? claims.filter((claim) => claim.claimType !== "found")
            : myClaims;

    plain.claims = visibleClaims;
    // Drives the staff "new activity" dot: only claims this viewer can see count
    plain.claimedAt = visibleClaims.reduce(
        (latest, claim) => (!latest || claim.claimedAt > latest ? claim.claimedAt : latest),
        null
    );
    plain.pendingClaimCount = visibleClaims.filter((claim) => claim.status === "pending").length;
    plain.newClaimCount = plain.canReviewClaims
        ? visibleClaims.filter((claim) => claim.status === "pending" && !claim.seenByReviewerAt).length
        : 0;
    // Others still see how many people claimed a found pet ("someone else has claimed it")
    plain.otherPendingClaimCount = claims.filter(
        (claim) => claim.claimType !== "found" && claim.status === "pending" && claim.claimantEmail !== viewerEmail
    ).length;

    // Found claims are private: to everyone but the owner, a lost report just looks open
    if (!plain.canReviewClaims && plain.reportType === "lost" && plain.claimStatus === "pending") {
        plain.claimStatus = "none";
        plain.status = plain.matchStatus === "confirmed" ? "matched" : "open";
    }

    if (isShelterStaff || plain.isMine) return plain;

    const myClaimWasApproved = myLatestClaim?.status === "approved" && !plain.linkedAnimal;

    for (const field of REPORTER_ONLY_FIELDS) {
        if (field === "reporterContactNumber" && myClaimWasApproved) continue;
        delete plain[field];
    }
    plain.description = stripLegacyContact(plain.description);

    return plain;
}

// Report status follows its pending claims, unless a claim was already approved.
function updateClaimSummary(report) {
    if (report.claimStatus === "approved") return;

    const hasPendingClaims = report.claims.some((claim) => claim.status === "pending");

    report.claimStatus = hasPendingClaims ? "pending" : "none";
    report.status = hasPendingClaims
        ? "claimed"
        : report.matchStatus === "confirmed" ? "matched" : "open";
}

function stampReview(claim, req) {
    claim.reviewedByName = getActorName(req);
    claim.reviewedByEmail = getActorEmail(req);
    claim.reviewedAt = new Date();
}

exports.getAllReports = async (req, res) => {
    const reports = await LostFoundReport.find().sort({ createdAt: -1 });

    return res.json({
        success: true,
        reports: reports.map((report) => reportForViewer(report, req)),
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
        reports: reports.map((report) => reportForViewer(report, req)),
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
        report: reportForViewer(report, req),
    });
};

// Admin can delete any report; everyone else only their own. Shelter intake listings
// are removed with their animal (removeShelterListing), not by hand.
function canDeleteReport(report, req) {
    if (req.user?.role === "admin") return true;

    const isMine = Boolean(getActorEmail(req)) && report.reporterEmail === getActorEmail(req);
    return isMine && !report.linkedAnimal;
}

exports.deleteReport = async (req, res) => {
    const { reportId } = req.params;

    const report = mongoose.isValidObjectId(reportId) ? await LostFoundReport.findById(reportId) : null;

    if (!report) {
        const e = new Error("Lost and found report not found.");
        e.statusCode = 404;
        throw e;
    }

    if (!canDeleteReport(report, req)) {
        const e = new Error("You can only delete your own Lost & Found reports.");
        e.statusCode = 403;
        throw e;
    }

    await LostFoundMatch.deleteMany({ $or: [{ reportA: report._id }, { reportB: report._id }] });
    await LostFoundReport.findByIdAndDelete(reportId);

    // People still waiting on a claim shouldn't be left hanging
    const petLabel = report.petName || `the ${String(report.species).toLowerCase()}`;
    for (const claim of report.claims.filter((each) => each.status === "pending")) {
        await notifyUserInApp(
            claim.claimantEmail,
            "Lost & Found Report Removed",
            `The report for ${petLabel} was deleted, so your claim on it was closed.`
        );
    }

    return res.status(200).json({
        success: true,
        message: "Lost and found report deleted successfully.",
    });
};

exports.claimReport = async (req, res) => {
    preventStaffAdmin(req);

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

    // "This is my pet" goes on found reports; "I found this pet" goes on lost reports
    const claimType = req.body.claimType === "found" ? "found" : "ownership";
    const expectedReportType = claimType === "found" ? "lost" : "found";

    if (report.reportType !== expectedReportType) {
        const error = new Error(
            claimType === "found"
                ? "You can only say you found a pet on a Lost report."
                : "Ownership claims can only be made on Found reports."
        );

        error.statusCode = 400;
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

    const hasMyPendingClaim = report.claims.some(
        (claim) => claim.claimantEmail === claimantEmail && claim.status === "pending"
    );

    if (hasMyPendingClaim) {
        const error = new Error(
            "You already have a pending claim on this report."
        );

        error.statusCode = 400;
        throw error;
    }

    const isFirstPendingClaim = report.claimStatus !== "pending";

    if (claimType === "ownership" && report.linkedAnimal) {
        const linkedAnimal = await Animal.findById(report.linkedAnimal).select("adoptionStatus availabilityStatus");

        if (!linkedAnimal || ["adopted", "returned_to_owner"].includes(linkedAnimal.adoptionStatus)) {
            const error = new Error(
                "This shelter animal is no longer available for claims."
            );

            error.statusCode = 400;
            throw error;
        }

        if (isFirstPendingClaim) {
            report.linkedAnimalAvailabilityBeforeClaim = linkedAnimal.availabilityStatus;
        }
    }

    const MINIMUM_CLAIM_PROOF_LENGTH = 20;
    const claimNotes = String(req.body.claimNotes || "").trim();
    const claimContactNumber = String(req.body.claimContactNumber || "").trim();

    if (claimNotes.length < MINIMUM_CLAIM_PROOF_LENGTH) {
        const error = new Error(
            claimType === "found"
                ? `Please describe the pet and how you found it in at least ${MINIMUM_CLAIM_PROOF_LENGTH} characters.`
                : `Please describe your proof of ownership in at least ${MINIMUM_CLAIM_PROOF_LENGTH} characters.`
        );
        error.statusCode = 400;
        throw error;
    }

    const proofPhotoUrl = String(req.body.claimProofPhotoUrl || "").trim();
    const foundLocation = String(req.body.foundLocation || "").trim();
    let foundDate = null;

    // The owner needs a photo, a place and a date to recognise their pet
    if (claimType === "found") {
        if (!foundLocation) {
            const error = new Error("Please say where you found the pet.");
            error.statusCode = 400;
            throw error;
        }

        foundDate = readPastDate(req.body.foundDate, "date found");

        if (!proofPhotoUrl) {
            const error = new Error("Please add a photo of the pet you found so the owner can recognise it.");
            error.statusCode = 400;
            throw error;
        }
    }

    if (!/^9\d{9}$/.test(claimContactNumber)) {
        const error = new Error("Please enter a valid mobile number: 10 digits starting with 9.");
        error.statusCode = 400;
        throw error;
    }

    const claim = {
        claimType,
        claimantName,
        claimantEmail,
        contactNumber: claimContactNumber,
        proofNotes: claimNotes,
        proofPhotoUrl,
        foundLocation,
        foundDate,
        claimedAt: new Date(),
    };

    report.claims.push(claim);
    report.claimedAt = claim.claimedAt;
    updateClaimSummary(report);

    await report.save();

    if (isFirstPendingClaim && claimType === "ownership") {
        await updateLinkedAnimal(report, { availabilityStatus: "unavailable" });
    }

    const pendingClaimCount = report.claims.filter((each) => each.status === "pending").length;

    const petLabel = report.petName || `the ${String(report.species).toLowerCase()}`;

    if (report.linkedAnimal) {
        // Shelter intake: staff decide
        await notifyShelterStaff(
            "New Ownership Claim",
            `${claimantName} claimed ${petLabel} (shelter animal)` +
                `${claim.proofPhotoUrl ? " with a proof photo" : ""}. ` +
                `${pendingClaimCount > 1 ? `It now has ${pendingClaimCount} claims to compare. ` : ""}` +
                "Review it in Lost & Found."
        );
    } else if (claimType === "found") {
        await notifyUserInApp(
            report.reporterEmail,
            "Someone Found Your Pet",
            `${claimantName} says they found ${petLabel}. Check their photo and details in Lost & Found → My Reports, ` +
                "then approve or reject it."
        );
    } else {
        await notifyUserInApp(
            report.reporterEmail,
            "Someone Claimed the Pet You Found",
            `${claimantName} says ${petLabel} you found is theirs. Check their proof in Lost & Found → My Reports, ` +
                "contact them, then approve or reject the claim."
        );
    }

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_claim_submitted",

        actorName: claimantName,
        actorEmail: claimantEmail,

        targetType: "LostFoundReport",
        targetId: report._id.toString(),

        description: claimType === "found"
            ? `${claimantName} said they found ${report.petName || report.species}.`
            : `${claimantName} submitted a claim for ${report.petName || report.species}.`,

        status: report.status,

        metadata: {
            petName: report.petName,
            species: report.species,
            reporterEmail: report.reporterEmail,
            claimNotes,
            claimType,
        },
    });

    return res.json({
        success: true,
        message: claimType === "found"
            ? "Sent to the owner. They'll see your details and can contact you."
            : report.linkedAnimal
                ? "Claim submitted. Shelter staff will review it."
                : "Claim sent to the finder. They'll review it and contact you.",
        report: reportForViewer(report, req),
    });
};


// The report's owner (or staff, for a shelter intake listing) decides one claim.
// Approving it rejects every other pending claim and marks the case reunited.
exports.reviewClaim = async (req, res) => {
    const requested = String(req.body.claimStatus || "").trim().toLowerCase();

    if (!["approved", "rejected"].includes(requested)) {
        const error = new Error("Invalid claim status.");
        error.statusCode = 400;
        throw error;
    }

    const report = await LostFoundReport.findById(req.params.id);

    if (!report) {
        const error = new Error("Lost and found report not found.");
        error.statusCode = 404;
        throw error;
    }

    if (!canReviewClaims(report, req)) {
        const error = new Error(
            "Only the person who filed this report can approve or reject its claims" +
                " (staff and admin: shelter intake listings only)."
        );
        error.statusCode = 403;
        throw error;
    }

    const claim = report.claims.id(String(req.body.claimId || ""));

    if (!claim) {
        const error = new Error("Claim not found on this report.");
        error.statusCode = 404;
        throw error;
    }

    if (claim.status !== "pending") {
        const error = new Error("This claim is no longer pending.");
        error.statusCode = 400;
        throw error;
    }

    claim.status = requested;
    stampReview(claim, req);

    const otherClaimsRejected = [];

    if (requested === "approved") {
        for (const otherClaim of report.claims) {
            if (otherClaim.status !== "pending") continue;

            otherClaim.status = "rejected";
            stampReview(otherClaim, req);
            otherClaimsRejected.push(otherClaim);
        }

        report.claimStatus = "approved";
        report.status = "reunited";
        report.reunitedAt = new Date();
    } else {
        updateClaimSummary(report);
    }

    await report.save();

    const stillHasPendingClaims = report.claimStatus === "pending";

    if (requested === "approved") {
        // An owner's approved ownership claim also closes their own lost report for this pet
        if (claim.claimType !== "found") await closeOwnersMatchedLostReports(report, claim.claimantEmail);
        await updateLinkedAnimal(report, { availabilityStatus: "unavailable", adoptionStatus: "returned_to_owner" });
    } else if (!stillHasPendingClaims) {
        await updateLinkedAnimal(report, {
            availabilityStatus: report.linkedAnimalAvailabilityBeforeClaim || "unavailable",
        });
    }

    const claimedPetName = report.petName || `the ${String(report.species).toLowerCase()}`;
    const isFoundClaim = claim.claimType === "found";
    const approvedMessage = report.linkedAnimal
        ? `Your claim for ${claimedPetName} was approved. The shelter will contact you to arrange the handover.`
        : isFoundClaim
            ? `${report.reporterName} confirmed the pet you found is ${claimedPetName}. Open Lost & Found to see their mobile number and arrange the handover.`
            : `${report.reporterName} approved your claim for ${claimedPetName}. Open Lost & Found to see their mobile number and arrange the handover.`;

    await notifyUserInApp(
        claim.claimantEmail,
        requested === "approved" ? "Claim Approved" : "Claim Not Approved",
        requested === "approved"
            ? approvedMessage
            : isFoundClaim
                ? `The owner says the pet you found is not ${claimedPetName}. Thank you for helping.`
                : `Your claim for ${claimedPetName} was not approved. You can still check other reports.`
    );

    for (const otherClaim of otherClaimsRejected) {
        await notifyUserInApp(
            otherClaim.claimantEmail,
            "Claim Not Approved",
            `Another claim for ${claimedPetName} was approved, so yours was closed. Thank you for helping.`
        );
    }

    await LedgerEntry.create({
        type: "lost_found",
        action: requested === "approved"
            ? "lost_found_case_reunited"
            : "lost_found_claim_reviewed",

        actorName: getActorName(req),
        actorEmail: getActorEmail(req),

        targetType: "LostFoundReport",
        targetId: report._id.toString(),

        description:
            requested === "approved"
                ? `${claim.claimantName}'s claim for ${report.petName || report.species} was approved and marked as reunited.`
                : `${claim.claimantName}'s claim for ${report.petName || report.species} was rejected.`,

        status: report.status,

        metadata: {
            claimStatus: requested,
            claimType: claim.claimType,
            claimantEmail: claim.claimantEmail,
            otherClaimsRejected: otherClaimsRejected.map((otherClaim) => otherClaim.claimantEmail),
            reunitedAt: report.reunitedAt,
        },
    });

    // Emails are best-effort: the decision is already saved.
    const petNameForEmail = report.petName || report.species;
    const decisionEmails =
        requested === "approved"
            ? [
                sendLostFoundReunitedEmail(report.reporterEmail, petNameForEmail),
                sendLostFoundReunitedEmail(claim.claimantEmail, petNameForEmail),
                ...otherClaimsRejected.map((otherClaim) =>
                    sendLostFoundClaimEmail(otherClaim.claimantEmail, petNameForEmail, "rejected")
                ),
            ]
            : [sendLostFoundClaimEmail(claim.claimantEmail, petNameForEmail, requested)];

    for (const emailResult of await Promise.allSettled(decisionEmails)) {
        if (emailResult.status === "rejected") {
            console.error("Lost & Found decision email failed:", emailResult.reason);
        }
    }

    return res.json({
        success: true,
        message:
            requested === "approved"
                ? "Claim approved. Lost and found case marked as reunited."
                : "Lost and found claim rejected.",
        report: reportForViewer(report, req),
    });
};

// The person who decides opened the report: its pending claims are no longer "New"
exports.markClaimsSeen = async (req, res) => {
    const report = await LostFoundReport.findById(req.params.id);

    if (!report) {
        const error = new Error("Lost and found report not found.");
        error.statusCode = 404;
        throw error;
    }

    if (!canReviewClaims(report, req)) {
        const error = new Error("Only the person who decides this report's claims can mark them as seen.");
        error.statusCode = 403;
        throw error;
    }

    const now = new Date();
    let changed = false;

    for (const claim of report.claims) {
        if (claim.status === "pending" && !claim.seenByReviewerAt) {
            claim.seenByReviewerAt = now;
            changed = true;
        }
    }

    if (changed) await report.save();

    return res.json({ success: true, report: reportForViewer(report, req) });
};

// Reporter: system suggestions for my own open reports.
exports.getMySuggestedMatches = async (req, res) => {
    const myOpenReportIds = await LostFoundReport.find({
        reporterEmail: getActorEmail(req),
        status: { $in: ["open", "matched", "claimed"] },
    }).distinct("_id");

    const myReportIdStrings = new Set(myOpenReportIds.map(String));

    const matches = await LostFoundMatch.find({
        status: { $in: ["suggested", "confirmed"] },
        $or: [
            { reportA: { $in: myOpenReportIds } },
            { reportB: { $in: myOpenReportIds } },
        ],
    })
        .sort({ score: -1 })
        .populate("reportA reportB");

    const suggestions = matches
        .filter((match) => match.reportA && match.reportB)
        .map((match) => {
            const myReportIsA = myReportIdStrings.has(String(match.reportA._id));

            return {
                matchId: match._id,
                score: match.score,
                isConfirmedByStaff: match.status === "confirmed",
                myReport: reportForViewer(myReportIsA ? match.reportA : match.reportB, req),
                matchedReport: reportForViewer(myReportIsA ? match.reportB : match.reportA, req),
            };
        })
        .filter(({ matchedReport }) => !["reunited", "rejected"].includes(matchedReport.status));

    return res.json({
        success: true,
        suggestions,
    });
};

// Reporter: "Not my pet" removes the suggestion for both reports.
exports.dismissSuggestedMatch = async (req, res) => {
    const match = await LostFoundMatch.findById(req.params.matchId).populate(
        "reportA reportB",
        "reporterEmail"
    );

    if (!match) {
        const error = new Error("Suggested match not found.");
        error.statusCode = 404;
        throw error;
    }

    const reporterEmail = getActorEmail(req);
    const isMySuggestion = [match.reportA, match.reportB].some(
        (report) => report?.reporterEmail === reporterEmail
    );

    if (!isMySuggestion) {
        const error = new Error("You can only dismiss suggestions for your own reports.");
        error.statusCode = 403;
        throw error;
    }

    if (match.status !== "suggested") {
        const error = new Error(`This suggestion has already been ${match.status}.`);
        error.statusCode = 409;
        throw error;
    }

    match.status = "not_a_match";
    match.reviewedBy = req.user.id;
    match.reviewedAt = new Date();
    match.reviewNotes = "Dismissed by the reporter: not their pet.";
    await match.save();

    return res.json({
        success: true,
        message: "Suggestion dismissed.",
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

        await notifyLostFoundMatchOwners(reportA, reportB, true);

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


exports.cancelClaim = async (req, res) => {
    preventStaffAdmin(req);

    const report = await LostFoundReport.findById(req.params.id);

    if (!report) {
        const error = new Error("Lost and found report not found.");
        error.statusCode = 404;
        throw error;
    }

    const claimantEmail = getActorEmail(req);

    if (!claimantEmail) {
        const error = new Error("Authenticated user email is missing.");
        error.statusCode = 401;
        throw error;
    }

    const myPendingClaim = report.claims.find(
        (claim) => claim.claimantEmail === claimantEmail && claim.status === "pending"
    );

    if (!myPendingClaim) {
        const error = new Error("You have no pending claim on this report.");
        error.statusCode = 409;
        throw error;
    }

    const claimantName = getActorName(req);

    myPendingClaim.status = "cancelled";
    updateClaimSummary(report);

    await report.save();

    if (report.claimStatus !== "pending") {
        await updateLinkedAnimal(report, {
            availabilityStatus: report.linkedAnimalAvailabilityBeforeClaim || "unavailable",
        });
    }

    await LedgerEntry.create({
        type: "lost_found",
        action: "lost_found_claim_cancelled",
        actorName: claimantName,
        actorEmail: claimantEmail,
        targetType: "LostFoundReport",
        targetId: report._id.toString(),
        description:
            `${claimantName} cancelled their pending claim for ` +
            `${report.petName || report.species}.`,
        status: report.status,
        metadata: {
            petName: report.petName,
            species: report.species,
            reportType: report.reportType,
            reporterEmail: report.reporterEmail,
        },
    });

    return res.json({
        success: true,
        message: "Your pending claim has been cancelled.",
        report: reportForViewer(report, req),
    });
};
