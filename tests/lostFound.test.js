// Table 35 - Lost-and-Found Module (CASE-131 to CASE-143)
// Real Lost & Found routes (login check, role check, controller, matching service) run with mocked models.
// The matching score itself is also covered by lostFoundMatching.test.js (U-22, U-23).
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, fakeDocument, callRoute, newId, sentEmails } = require("./helpers/http");

const LostFoundReport = require("../models/LostFoundReport");
const LostFoundMatch = require("../models/LostFoundMatch");
const LedgerEntry = require("../models/LedgerEntry");
const Notification = require("../models/Notifications");
const User = require("../models/User");

const lostFoundRoutes = require("../routes/lostFoundRoutes");

afterEach(() => {
    mock.restoreAll();
    sentEmails.length = 0;
});

const PHOTO = "https://img.test/pet.jpg";
const FINDER = "finder@test.rescuebase";
const OWNER = "owner@test.rescuebase";

const LOST_DOG = {
    reportType: "lost", species: "Dog", breed: "Aspin", colour: "Brown", size: "Medium", sex: "Male",
    description: "brown aspin with a red collar", location: "Cebu City Hall", contactNumber: "9171234567",
    latitude: 10.2931, longitude: 123.9029, dateReported: "2026-11-10", eventDate: "2026-11-10",
};

function stubReportCreation({ candidates = [] } = {}) {
    const created = [];
    mock.method(LostFoundReport, "create", async (data) => {
        const report = fakeDocument({ ...data });
        created.push(report);
        return report;
    });
    mock.method(LostFoundReport, "findById", async () => created[0]);
    mock.method(LostFoundReport, "find", () => query(candidates));
    mock.method(LostFoundReport, "updateMany", async () => ({}));
    mock.method(LostFoundMatch, "findOne", async () => null);
    const createMatch = mock.method(LostFoundMatch, "create", async (data) => data);
    mock.method(LedgerEntry, "create", async () => ({}));
    mock.method(User, "find", () => query([]));
    mock.method(User, "findOne", () => query({ _id: newId(), email: "someone@test.rescuebase" }));
    const notification = mock.method(Notification, "create", async () => ({}));
    mock.method(Notification, "insertMany", async () => []);
    return { created, createMatch, notification };
}

function foundDogCandidate(overrides = {}) {
    return {
        _id: newId(), reportType: "found", status: "open", species: "dog", breed: "Aspin", colour: "brown",
        size: "medium", sex: "male", description: "brown aspin with a red collar", eventDate: "2026-11-10",
        coordinates: { latitude: 10.2926, longitude: 123.9026 }, reporterEmail: FINDER, location: "Colon", ...overrides,
    };
}

describe("Table 35 - Lost-and-Found: Report Lost or Found Pets & Submit Ownership Claims", () => {
    test("CASE-131 | Description: User files a lost-pet report with details and a map pin | Expected: 201; report saved as open with the pin coordinates", async () => {
        const { created } = stubReportCreation();

        const result = await callRoute(lostFoundRoutes, "POST", "/reports", { role: "adopter", body: LOST_DOG });

        assert.equal(result.status, 201);
        assert.equal(created[0].reportType, "lost");
        assert.equal(created[0].status, "open");
        assert.deepEqual(created[0].coordinates, { latitude: 10.2931, longitude: 123.9029 });
    });

    test("CASE-132 | Description: User files a found-pet report with the required details | Expected: 201; report saved as open", async () => {
        const { created } = stubReportCreation();

        const result = await callRoute(lostFoundRoutes, "POST", "/reports", {
            role: "volunteer", body: { ...LOST_DOG, reportType: "found", photoUrl: PHOTO },
        });

        assert.equal(result.status, 201);
        assert.equal(created[0].reportType, "found");
        assert.equal(created[0].status, "open");
    });

    test("CASE-133 | Description: User leaves a required report field empty | Expected: 400 with a field message; nothing saved", async () => {
        const { created } = stubReportCreation();

        for (const [field, pattern] of [["species", /species is required/i], ["description", /description is required/i], ["location", /location is required/i]]) {
            const result = await callRoute(lostFoundRoutes, "POST", "/reports", { role: "adopter", body: { ...LOST_DOG, [field]: "" } });
            assert.equal(result.status, 400);
            assert.match(result.body.message, pattern);
        }
        assert.equal(created.length, 0);
    });

    test("CASE-134 | Description: A lost and a found report of the same species, similar details, nearby | Expected: 201; 1 suggested match (score 45 or more); both reporters notified", async () => {
        const { createMatch, notification } = stubReportCreation({ candidates: [foundDogCandidate()] });

        const result = await callRoute(lostFoundRoutes, "POST", "/reports", { role: "adopter", body: LOST_DOG });

        assert.equal(result.status, 201);
        assert.equal(result.body.matching.matchesCreated, 1);
        assert.equal(createMatch.mock.calls[0].arguments[0].status, "suggested");
        assert.ok(createMatch.mock.calls[0].arguments[0].score >= 45);
        assert.equal(notification.mock.callCount(), 2); // one for each reporter
        assert.equal(sentEmails.filter((mail) => mail.name === "sendLostFoundMatchEmail").length, 2);
    });

    test("CASE-135 | Description: A lost dog and a found cat are reported | Expected: 201; no match created; no notification", async () => {
        const { createMatch, notification } = stubReportCreation({ candidates: [foundDogCandidate({ species: "cat" })] });

        const result = await callRoute(lostFoundRoutes, "POST", "/reports", { role: "adopter", body: LOST_DOG });

        assert.equal(result.status, 201);
        assert.equal(result.body.matching.matchesCreated, 0);
        assert.equal(createMatch.mock.callCount(), 0);
        assert.equal(notification.mock.callCount(), 0);
    });

    function foundReport(overrides = {}) {
        const claims = [];
        claims.id = (id) => claims.find((claim) => String(claim._id) === String(id));
        const originalPush = claims.push.bind(claims);
        claims.push = (claim) => originalPush({ _id: newId(), status: "pending", ...claim });
        return fakeDocument({
            reportType: "found", status: "open", claimStatus: "none", matchStatus: "none",
            reporterName: "Finder Fran", reporterEmail: FINDER, petName: "", species: "Dog", claims, ...overrides,
        });
    }

    function stubClaimSideEffects() {
        mock.method(LedgerEntry, "create", async () => ({}));
        mock.method(User, "find", () => query([]));
        mock.method(User, "findOne", () => query({ _id: newId() }));
        mock.method(LostFoundMatch, "find", () => query([]));
        mock.method(LostFoundReport, "updateMany", async () => ({}));
        return mock.method(Notification, "create", async () => ({}));
    }

    const claimBody = { claimNotes: "She has a scar on her left ear and answers to Choco", claimContactNumber: "9181234567", claimProofPhotoUrl: PHOTO };

    test("CASE-136 | Description: Owner claims a found pet with proof notes | Expected: 200; claim saved on the report; claim status pending", async () => {
        const report = foundReport();
        mock.method(LostFoundReport, "findById", async () => report);
        const notification = stubClaimSideEffects();

        const result = await callRoute(lostFoundRoutes, "POST", `/reports/${report._id}/claim`, { role: "adopter", body: claimBody });

        assert.equal(result.status, 200);
        assert.equal(report.claims.length, 1);
        assert.equal(report.claims[0].claimType, "ownership");
        assert.match(report.claims[0].proofNotes, /scar on her left ear/);
        assert.equal(report.claimStatus, "pending");
        assert.equal(notification.mock.calls[0].arguments[0].title, "Someone Claimed the Pet You Found");
    });

    test("CASE-137 | Description: Owner claims a found pet without proof | Expected: 400 'proof of ownership'; no claim saved", async () => {
        const report = foundReport();
        mock.method(LostFoundReport, "findById", async () => report);
        stubClaimSideEffects();

        const result = await callRoute(lostFoundRoutes, "POST", `/reports/${report._id}/claim`, {
            role: "adopter", body: { ...claimBody, claimNotes: "mine" },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /proof of ownership/i);
        assert.equal(report.claims.length, 0);
    });
});

describe("Table 35 - Lost-and-Found: Review Ownership Claims & Matches", () => {
    function reportWithClaim(claimOverrides = {}, reportOverrides = {}) {
        const claim = {
            _id: newId(), claimType: "ownership", claimantName: "Owner Olga", claimantEmail: OWNER, status: "pending",
            proofNotes: "Scar on her left ear", proofPhotoUrl: PHOTO, ...claimOverrides,
        };
        const claims = [claim];
        claims.id = (id) => claims.find((each) => String(each._id) === String(id));
        const originalPush = claims.push.bind(claims);
        claims.push = (next) => originalPush({ _id: newId(), status: "pending", ...next });
        const report = fakeDocument({
            reportType: "found", status: "claimed", claimStatus: "pending", matchStatus: "none",
            reporterName: "Finder Fran", reporterEmail: FINDER, species: "Dog", claims, ...reportOverrides,
        });
        return { report, claim };
    }

    function stubReviewSideEffects() {
        mock.method(LedgerEntry, "create", async () => ({}));
        mock.method(User, "findOne", () => query({ _id: newId() }));
        mock.method(User, "find", () => query([]));
        const lostReport = newId();
        mock.method(LostFoundMatch, "find", () => query([]));
        const updateMany = mock.method(LostFoundReport, "updateMany", async () => ({}));
        mock.method(Notification, "create", async () => ({}));
        return { updateMany, lostReport };
    }

    test("CASE-138 | Description: Finder opens their found report | Expected: 200; claims shown with proof photo and notes", async () => {
        const { report } = reportWithClaim();
        mock.method(LostFoundReport, "findById", async () => report);

        const result = await callRoute(lostFoundRoutes, "GET", `/reports/${report._id}`, { role: "volunteer", user: { email: FINDER } });

        assert.equal(result.status, 200);
        assert.equal(result.body.report.claims.length, 1);
        assert.equal(result.body.report.claims[0].proofPhotoUrl, PHOTO);
        assert.match(result.body.report.claims[0].proofNotes, /Scar/);
    });

    test("CASE-139 | Description: Staff approves a claim | Expected: 200; report 'reunited'; owner's lost report closed", async () => {
        const { report, claim } = reportWithClaim();
        mock.method(LostFoundReport, "findById", async () => report);
        const { updateMany } = stubReviewSideEffects();
        const lostId = newId();
        mock.method(LostFoundMatch, "find", () => query([{ reportA: report._id, reportB: lostId }]));

        const result = await callRoute(lostFoundRoutes, "PATCH", `/reports/${report._id}/claim`, {
            role: "volunteer", user: { email: FINDER }, body: { claimId: claim._id, claimStatus: "approved" },
        });

        assert.equal(result.status, 200);
        assert.equal(claim.status, "approved");
        assert.equal(report.status, "reunited");
        assert.equal(report.claimStatus, "approved");
        const closeCall = updateMany.mock.calls.find((call) => call.arguments[1]?.$set?.status === "reunited");
        assert.ok(closeCall, "the matching lost report should be set to reunited");
        assert.equal(sentEmails.filter((mail) => mail.name === "sendLostFoundReunitedEmail").length, 2);
    });

    test("CASE-140 | Description: Staff rejects a claim | Expected: 200; claim rejected; report back to open", async () => {
        const { report, claim } = reportWithClaim();
        mock.method(LostFoundReport, "findById", async () => report);
        stubReviewSideEffects();

        const result = await callRoute(lostFoundRoutes, "PATCH", `/reports/${report._id}/claim`, {
            role: "volunteer", user: { email: FINDER }, body: { claimId: claim._id, claimStatus: "rejected" },
        });

        assert.equal(result.status, 200);
        assert.equal(claim.status, "rejected");
        assert.equal(report.status, "open");
        assert.equal(report.claimStatus, "none");
    });

    test("CASE-141 | Description: A second owner claims the same found report | Expected: 200; 2 claims listed; status pending", async () => {
        const { report } = reportWithClaim();
        mock.method(LostFoundReport, "findById", async () => report);
        mock.method(LedgerEntry, "create", async () => ({}));
        mock.method(User, "findOne", () => query({ _id: newId() }));
        mock.method(Notification, "create", async () => ({}));

        const result = await callRoute(lostFoundRoutes, "POST", `/reports/${report._id}/claim`, {
            role: "adopter",
            body: { claimNotes: "My dog Rex has a white patch on his chest", claimContactNumber: "9191234567", claimProofPhotoUrl: PHOTO },
        });

        assert.equal(result.status, 200);
        assert.equal(report.claims.length, 2);
        assert.equal(report.claimStatus, "pending");
    });

    test("CASE-142 | Description: Admin deletes a lost or found report | Expected: 200; report and its matches removed", async () => {
        const report = fakeDocument({ reporterEmail: FINDER, species: "Dog", claims: [] });
        mock.method(LostFoundReport, "findById", async () => report);
        const deleteMatches = mock.method(LostFoundMatch, "deleteMany", async () => ({}));
        const remove = mock.method(LostFoundReport, "findByIdAndDelete", async () => report);

        const result = await callRoute(lostFoundRoutes, "DELETE", `/reports/${report._id}`, { role: "admin" });

        assert.equal(result.status, 200);
        assert.equal(remove.mock.callCount(), 1);
        assert.equal(deleteMatches.mock.callCount(), 1);
    });

    test("CASE-143 | Description: Staff deletes a report filed by someone else | Expected: 403; nothing deleted", async () => {
        const report = fakeDocument({ reporterEmail: FINDER, species: "Dog", claims: [] });
        mock.method(LostFoundReport, "findById", async () => report);
        const remove = mock.method(LostFoundReport, "findByIdAndDelete", async () => report);

        const result = await callRoute(lostFoundRoutes, "DELETE", `/reports/${report._id}`, { role: "staff" });

        assert.equal(result.status, 403);
        assert.equal(remove.mock.callCount(), 0);
    });
});
