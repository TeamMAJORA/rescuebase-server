// Adoption Management Module (CASE-061 to CASE-092)
// CASE-061 and CASE-065 to CASE-077 are the matchmaking calculations: they are checked by the function-level
// tests in matchmaking.test.js (U-01 to U-16). This file covers the quiz route, applications and reviews.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, fakeDocument, callRoute, newId, sentEmails } = require("./helpers/http");

const lostFoundController = require("../controllers/lostFoundController");
lostFoundController.removeShelterListing = async () => {};

const Animal = require("../models/Animal");
const User = require("../models/User");
const QuizResponse = require("../models/QuizResponse");
const AdoptionApplication = require("../models/AdoptionApplication");
const FosterAssignment = require("../models/FosterAssignment");
const LedgerEntry = require("../models/LedgerEntry");
const Notification = require("../models/Notifications");
const cloudinary = require("../config/cloudinary");

const animalRoutes = require("../routes/animalRoutes");
const adoptionRoutes = require("../routes/adoptionRoutes");
const matchmakingRoutes = require("../routes/matchmakingRoutes");
const uploadRoutes = require("../routes/uploadRoutes");

afterEach(() => {
    mock.restoreAll();
    sentEmails.length = 0;
});

const QUIZ_ANSWERS = {
    preferredPetType: "Dog", preferredSize: "Any", homeType: "House", homeOwnership: "Own",
    hasChildren: "No", hasOtherPets: "No", petExperience: "Some", dailyAvailableHours: 4,
    exerciseFrequency: "Daily", willingToTrain: "Yes",
    energyPreference: 3, friendlinessPreference: 3, humanSociabilityPreference: 3, animalSociabilityPreference: 3,
    trainabilityPreference: 3, anxietyTolerance: 3, aggressionTolerance: 3, activityPreference: 3,
};

function adoptableDog(name, score = 3) {
    return {
        _id: newId(), name, type: "Dog", size: "Medium", availabilityStatus: "available", adoptionStatus: "available",
        energyLevel: score, friendliness: score, humanSociability: score, animalSociability: score,
        trainability: score, anxietyLevel: score, aggressionLevel: score, activityLevel: score,
    };
}

function mockAiScore(percentage) {
    return mock.method(globalThis, "fetch", async () => ({
        ok: true,
        json: async () => ({ compatibilityScore: percentage / 100, percentage, tier: "Perfect Paw Match" }),
    }));
}

function applicationDocument(overrides = {}) {
    return fakeDocument({
        applicantUserId: newId(), fullName: "Ana Adopter", email: "adopter@test.rescuebase",
        animalId: newId(), petName: "Buddy", status: "pending", documents: [], documentRequest: {},
        async populate() { return this; },
        ...overrides,
    });
}

function stubStaffLookupAndNotifications() {
    mock.method(User, "findById", () => query({ _id: newId(), name: "Staff Sam", username: "sam", email: "staff@test.rescuebase", role: "staff" }));
    mock.method(User, "find", () => query([{ _id: newId() }]));
    mock.method(Notification, "insertMany", async () => []);
    mock.method(LedgerEntry, "create", async () => ({}));
    return mock.method(Notification, "create", async () => ({}));
}

describe("Adoption Management: Browse Pets, Take Matchmaking Quiz & View AI Compatibility Scores", () => {
    test("CASE-061 | Description: Adopter filters the pets by type (Dog) | Expected: Only available Dogs requested", async () => {
        const find = mock.method(Animal, "find", () => query([]));

        await callRoute(animalRoutes, "GET", "/?type=Dog&availabilityStatus=available", { role: "adopter" });

        assert.equal(find.mock.calls[0].arguments[0].type, "Dog");
        assert.equal(find.mock.calls[0].arguments[0].availabilityStatus, "available");
    });

    test("CASE-062 | Description: Adopter opens a pet profile | Expected: 200; the pet's name and type shown", async () => {
        const dog = adoptableDog("Buddy");
        mock.method(Animal, "findById", () => query(dog));

        const result = await callRoute(animalRoutes, "GET", `/${dog._id}`, { role: "adopter" });

        assert.equal(result.status, 200);
        assert.equal(result.body.animal.name, "Buddy");
        assert.equal(result.body.animal.type, "Dog");
    });

    test("CASE-063 | Description: Adopter submits the quiz with all 8 answers | Expected: 201; each adoptable pet gets a 0 to 100 score and a tier", async () => {
        mockAiScore(90);
        mock.method(QuizResponse, "create", async (data) => ({ ...data, _id: newId() }));
        mock.method(Animal, "find", () => query([adoptableDog("Buddy"), adoptableDog("Rex")]));

        const result = await callRoute(matchmakingRoutes, "POST", "/quiz", { role: "adopter", body: QUIZ_ANSWERS });

        assert.equal(result.status, 201);
        assert.equal(result.body.matches.length, 2);
        for (const match of result.body.matches) {
            assert.ok(match.score >= 0 && match.score <= 100);
            assert.ok(match.tier);
        }
    });

    test("CASE-064 | Description: Adopter submits the quiz with a missing answer | Expected: 400 'missing'; nothing saved", async () => {
        const create = mock.method(QuizResponse, "create", async () => ({}));

        const result = await callRoute(matchmakingRoutes, "POST", "/quiz", {
            role: "adopter",
            body: { ...QUIZ_ANSWERS, preferredPetType: undefined },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /missing/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-065 | Description: Matching rules (CASE-065 to CASE-077) | Expected: Covered by the function-level tests U-01 to U-16 in matchmaking.test.js", () => {
        // U-01 to U-16 in matchmaking.test.js run the real score, tier, conflict and AI-down logic.
        const service = require("../services/matchmakingService");
        assert.equal(typeof service.calculateAnimalMatch, "function");
        assert.equal(service.getMatchTier(80), "Perfect Paw Match");
    });
});

describe("Adoption Management: Submit, Track & Withdraw Applications and Resubmit ID", () => {
    function stubSubmitDependencies({ existingActive = null, animal = adoptableDog("Buddy"), animalExists = true } = {}) {
        mock.method(AdoptionApplication, "findOne", () => query(existingActive));
        mock.method(Animal, "findOne", () => query(animal));
        mock.method(Animal, "exists", async () => (animalExists ? { _id: newId() } : null));
        mock.method(FosterAssignment, "findOne", () => query(null));
        const create = mock.method(AdoptionApplication, "create", async (data) => applicationDocument(data));
        stubStaffLookupAndNotifications();
        return create;
    }

    test("CASE-078 | Description: Adopter submits an adoption application with complete details | Expected: 201; saved as pending; applicant and staff emailed", async () => {
        const create = stubSubmitDependencies();

        const result = await callRoute(adoptionRoutes, "POST", "/", {
            role: "adopter",
            body: { fullName: "Ana Adopter", animalId: newId(), phone: "0917", address: "Cebu", reason: "Love dogs" },
        });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].status, "pending");
        assert.equal(sentEmails.some((mail) => mail.name === "sendApplicationUpdateEmail"), true);
    });

    test("CASE-079 | Description: Adopter leaves the full name empty | Expected: 400; 'fullName' named as missing; nothing saved", async () => {
        const create = stubSubmitDependencies();

        const result = await callRoute(adoptionRoutes, "POST", "/", { role: "adopter", body: { fullName: "", animalId: newId() } });

        assert.equal(result.status, 400);
        assert.deepEqual(result.body.missingFields, ["fullName"]);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-080 | Description: Adopter applies while another application is pending | Expected: 409 'already have an active adoption application'", async () => {
        const create = stubSubmitDependencies({ existingActive: { _id: newId(), status: "pending" } });

        const result = await callRoute(adoptionRoutes, "POST", "/", { role: "adopter", body: { fullName: "Ana", animalId: newId() } });

        assert.equal(result.status, 409);
        assert.match(result.body.message, /already have an active adoption application/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-081 | Description: Adopter applies for a pet that is no longer available | Expected: 409 'no longer available'", async () => {
        const create = stubSubmitDependencies({ animal: null, animalExists: true });

        const result = await callRoute(adoptionRoutes, "POST", "/", { role: "adopter", body: { fullName: "Ana", animalId: newId() } });

        assert.equal(result.status, 409);
        assert.match(result.body.message, /no longer available/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-082 | Description: Adopter opens My Applications | Expected: 200; each application with its status (pending, approved)", async () => {
        mock.method(AdoptionApplication, "find", () => query([
            { _id: newId(), petName: "Buddy", status: "pending" },
            { _id: newId(), petName: "Mimi", status: "approved" },
        ]));

        const result = await callRoute(adoptionRoutes, "GET", "/user/history", { role: "adopter" });

        assert.equal(result.status, 200);
        assert.deepEqual(result.body.applications.map((application) => application.status), ["pending", "approved"]);
    });

    test("CASE-083 | Description: Adopter withdraws a pending application | Expected: 200; status 'withdrawn' (from pending)", async () => {
        const application = applicationDocument({ status: "pending" });
        mock.method(AdoptionApplication, "findOne", () => query(application));
        mock.method(LedgerEntry, "create", async () => ({}));

        const result = await callRoute(adoptionRoutes, "PATCH", `/${application._id}/withdraw`, { role: "adopter", body: { reason: "Changed my mind" } });

        assert.equal(result.status, 200);
        assert.equal(application.status, "withdrawn");
        assert.equal(application.withdrawnFromStatus, "pending");
    });

    test("CASE-084 | Description: Adopter uploads an ID image and resubmits it | Expected: 201 image URL; 200 document saved; request marked 'resubmitted'", async () => {
        mock.method(cloudinary.uploader, "upload_stream", (options, done) => {
            const { Writable } = require("node:stream");
            return new Writable({
                write(chunk, encoding, next) { next(); },
                final(finish) { done(null, { secure_url: "https://res.cloudinary.com/test/id.png", public_id: "rescuebase/id" }); finish(); },
            });
        });
        const upload = await callRoute(uploadRoutes, "POST", "/image", {
            role: "adopter",
            multipart: { filename: "id.png", contentType: "image/png", content: "png-bytes" },
        });
        assert.equal(upload.status, 201);
        assert.equal(upload.body.imageUrl, "https://res.cloudinary.com/test/id.png");

        mock.restoreAll();
        const application = applicationDocument({ status: "pending", documentRequest: { status: "requested" } });
        mock.method(AdoptionApplication, "findOne", () => query(application));
        mock.method(AdoptionApplication, "findById", () => query(application));
        mock.method(LedgerEntry, "create", async () => ({}));
        mock.method(User, "find", () => query([{ _id: newId() }]));
        mock.method(Notification, "insertMany", async () => []);

        const result = await callRoute(adoptionRoutes, "PATCH", `/${application._id}/documents`, {
            role: "adopter",
            body: { documents: [{ documentName: "Government ID", documentUrl: upload.body.imageUrl, publicId: upload.body.publicId }] },
        });

        assert.equal(result.status, 200);
        assert.equal(application.documents[0].documentUrl, "https://res.cloudinary.com/test/id.png");
        assert.equal(application.documentRequest.status, "resubmitted");
    });

    test("CASE-085 | Description: Adopter uploads a file that is not an image | Expected: Refused: 'only image files are allowed'; nothing uploaded", async () => {
        const upload = mock.method(cloudinary.uploader, "upload_stream", () => { throw new Error("must not reach Cloudinary"); });

        const result = await callRoute(uploadRoutes, "POST", "/image", {
            role: "adopter",
            multipart: { filename: "notes.txt", contentType: "text/plain", content: "hello" },
        });

        assert.equal(result.status >= 400, true);
        assert.match(result.body.message, /only image files are allowed/i);
        assert.equal(upload.mock.callCount(), 0);
    });
});

describe("Adoption Management: Review Applications, Schedule Interviews, Approve or Reject & Request ID Resubmission", () => {
    function futureDate() {
        return new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();
    }

    test("CASE-086 | Description: Staff opens the application queue | Expected: 200; pending applications listed", async () => {
        mock.method(AdoptionApplication, "find", () => query([{ _id: newId(), status: "pending" }]));

        const result = await callRoute(adoptionRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.applications[0].status, "pending");
    });

    test("CASE-087 | Description: Staff schedules an interview | Expected: 200; status 'interview_scheduled'; date saved; adopter notified and emailed", async () => {
        const application = applicationDocument({ status: "pending" });
        mock.method(AdoptionApplication, "findById", () => query(application));
        mock.method(Animal, "exists", async () => ({ _id: application.animalId }));
        const notified = stubStaffLookupAndNotifications();

        const result = await callRoute(adoptionRoutes, "PATCH", `/${application._id}/status`, {
            role: "staff",
            body: { status: "interview_scheduled", interviewSchedule: futureDate() },
        });

        assert.equal(result.status, 200);
        assert.equal(application.status, "interview_scheduled");
        assert.ok(application.interviewSchedule instanceof Date);
        assert.equal(notified.mock.callCount(), 1);
        assert.equal(sentEmails.some((mail) => mail.name === "sendInterviewScheduleEmail"), true);
    });

    test("CASE-088 | Description: Staff approves an application | Expected: 200; pet marked adopted; other open applications rejected; adopters notified", async () => {
        const application = applicationDocument({ status: "interview_completed" });
        const other = applicationDocument({ _id: newId(), email: "other@test.rescuebase", animalId: application.animalId });
        mock.method(AdoptionApplication, "findById", () => query(application));
        mock.method(AdoptionApplication, "find", () => query([other]));
        const closeOthers = mock.method(AdoptionApplication, "updateMany", async () => ({}));
        mock.method(Animal, "exists", async () => ({ _id: application.animalId }));
        const adopt = mock.method(Animal, "findOneAndUpdate", async () => ({ _id: application.animalId, adoptionStatus: "adopted" }));
        mock.method(FosterAssignment, "findOne", async () => null);
        const notified = stubStaffLookupAndNotifications();
        mock.method(User, "find", () => query([]));

        const result = await callRoute(adoptionRoutes, "PATCH", `/${application._id}/status`, { role: "staff", body: { status: "approved" } });

        assert.equal(result.status, 200);
        assert.equal(application.status, "approved");
        assert.equal(adopt.mock.calls[0].arguments[1].$set.adoptionStatus, "adopted");
        assert.equal(closeOthers.mock.calls[0].arguments[1].$set.status, "rejected");
        assert.equal(notified.mock.callCount() >= 2, true, "the adopter and the other applicant are notified");
    });

    test("CASE-089 | Description: Staff rejects without a reason | Expected: 400 'rejection reason is required'; stays pending", async () => {
        const application = applicationDocument({ status: "pending" });
        mock.method(AdoptionApplication, "findById", () => query(application));

        const result = await callRoute(adoptionRoutes, "PATCH", `/${application._id}/status`, { role: "staff", body: { status: "rejected", reviewNotes: " " } });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /rejection reason is required/i);
        assert.equal(application.status, "pending");
    });

    test("CASE-090 | Description: Staff rejects with a reason | Expected: 200; rejected; reason saved and sent to the adopter", async () => {
        const application = applicationDocument({ status: "pending" });
        mock.method(AdoptionApplication, "findById", () => query(application));
        mock.method(Animal, "exists", async () => ({ _id: application.animalId }));
        const notified = stubStaffLookupAndNotifications();

        const result = await callRoute(adoptionRoutes, "PATCH", `/${application._id}/status`, {
            role: "staff",
            body: { status: "rejected", reviewNotes: "Home is too small" },
        });

        assert.equal(result.status, 200);
        assert.equal(application.status, "rejected");
        assert.equal(application.rejectionReason, "Home is too small");
        assert.equal(notified.mock.callCount(), 1);
        assert.match(notified.mock.calls[0].arguments[0].message, /Home is too small/);
    });

    test("CASE-091 | Description: Staff requests an ID resubmission | Expected: 200; request 'requested' with reason; document rejected; adopter notified", async () => {
        const application = applicationDocument({ status: "pending", documents: [{ documentName: "ID", status: "pending" }] });
        mock.method(AdoptionApplication, "findById", () => query(application));
        mock.method(User, "findById", () => query({ name: "Staff Sam" }));
        mock.method(LedgerEntry, "create", async () => ({}));
        const notified = mock.method(Notification, "create", async () => ({}));

        const result = await callRoute(adoptionRoutes, "PATCH", `/${application._id}/documents/request`, {
            role: "staff",
            body: { reason: "The ID photo is blurry" },
        });

        assert.equal(result.status, 200);
        assert.equal(application.documentRequest.status, "requested");
        assert.equal(application.documentRequest.reason, "The ID photo is blurry");
        assert.equal(application.documents[0].status, "rejected");
        assert.equal(notified.mock.callCount(), 1);
    });

    test("CASE-092 | Description: Staff reviews a withdrawn application | Expected: 409 'cannot change application from withdrawn'", async () => {
        const application = applicationDocument({ status: "withdrawn" });
        mock.method(AdoptionApplication, "findById", () => query(application));
        mock.method(Animal, "exists", async () => ({ _id: application.animalId }));
        mock.method(User, "findById", () => query({ name: "Staff Sam", email: "staff@test.rescuebase", role: "staff" }));

        const result = await callRoute(adoptionRoutes, "PATCH", `/${application._id}/status`, { role: "staff", body: { status: "approved" } });

        assert.equal(result.status, 409);
        assert.match(result.body.message, /cannot change application from withdrawn/i);
        assert.equal(application.status, "withdrawn");
    });
});
