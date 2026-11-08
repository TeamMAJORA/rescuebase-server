// One-time move from the old single-claim fields to the claims list.
// Run once after updating: node scripts/migrateLostFoundClaims.js
// Safe to run again: reports that already have claims are skipped.

const dotenv = require("dotenv");
const mongoose = require("mongoose");

dotenv.config();

const OLD_CLAIM_FIELDS = {
    claimedByName: "",
    claimedByEmail: "",
    claimNotes: "",
    claimContactNumber: "",
    claimProofPhotoUrl: "",
    reviewedByName: "",
    reviewedByEmail: "",
    reviewedAt: "",
};

async function migrateLostFoundClaims() {
    await mongoose.connect(process.env.MONGO_URI);

    const reports = mongoose.connection.db.collection("lostfoundreports");
    const legacyReports = await reports
        .find({
            "claims.0": { $exists: false },
            $or: Object.keys(OLD_CLAIM_FIELDS).map((field) => ({ [field]: { $exists: true } })),
        })
        .toArray();

    let claimsMoved = 0;

    for (const report of legacyReports) {
        // Only live claims are kept: rejected/cancelled ones were already cleared before
        const hasLiveClaim =
            ["pending", "approved"].includes(report.claimStatus) && report.claimedByEmail;

        const claims = hasLiveClaim
            ? [{
                _id: new mongoose.Types.ObjectId(),
                claimantName: report.claimedByName || report.claimedByEmail,
                claimantEmail: String(report.claimedByEmail).toLowerCase(),
                contactNumber: report.claimContactNumber || "",
                proofNotes: report.claimNotes || "",
                proofPhotoUrl: report.claimProofPhotoUrl || "",
                status: report.claimStatus,
                claimedAt: report.claimedAt || report.updatedAt || new Date(),
                reviewedByName: report.reviewedByName || "",
                reviewedByEmail: report.reviewedByEmail || "",
                reviewedAt: report.reviewedAt || null,
            }]
            : [];

        await reports.updateOne(
            { _id: report._id },
            {
                $set: {
                    claims,
                    claimStatus: hasLiveClaim ? report.claimStatus : "none",
                },
                $unset: OLD_CLAIM_FIELDS,
            }
        );

        claimsMoved += claims.length;
    }

    console.log(`Updated ${legacyReports.length} report(s), moved ${claimsMoved} claim(s).`);
    await mongoose.disconnect();
}

migrateLostFoundClaims().catch((error) => {
    console.error("Lost & Found claim migration failed:", error);
    process.exit(1);
});
