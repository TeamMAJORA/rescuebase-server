// Foster Management Module (CASE-093 to CASE-110)
// Real foster routes (login check, role check, controller) run with mocked models. No database or email is used.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, fakeDocument, callRoute, newId, sentEmails } = require("./helpers/http");

const lostFoundController = require("../controllers/lostFoundController");
lostFoundController.removeShelterListing = async () => {};

const Animal = require("../models/Animal");
const User = require("../models/User");
const FosterApplication = require("../models/FosterApplication");
const FosterAssignment = require("../models/FosterAssignment");
const LedgerEntry = require("../models/LedgerEntry");
const Notification = require("../models/Notifications");

const fosterRoutes = require("../routes/fosterRoutes");

const FOSTER_EMAIL = "foster@test.rescuebase";
const SCORES = {
    energyLevel: 4, friendliness: 5, humanSociability: 4, animalSociability: 3,
    trainability: 4, anxietyLevel: 2, aggressionLevel: 1, activityLevel: 4,
};

afterEach(() => {
    mock.restoreAll();
    sentEmails.length = 0;
});

// Ledger + in-app notification stubs used by almost every foster action.
function stubSideEffects() {
    mock.method(LedgerEntry, "create", async () => ({}));
    mock.method(User, "findOne", () => query({ _id: newId() }));
    mock.method(User, "find", () => query([{ _id: newId(), email: "staff@test.rescuebase" }]));
    mock.method(Notification, "insertMany", async () => []);
    return mock.method(Notification, "create", async () => ({}));
}

function adminAccount() {
    return query({ _id: newId(), name: "Staff Sam", username: "sam", email: "staff@test.rescuebase" });
}

function activeAssignment(overrides = {}) {
    return fakeDocument({
        animalId: newId(), petName: "Buddy", fosterName: "Fiona Foster", fosterEmail: FOSTER_EMAIL,
        status: "active", updates: [], medicalRequests: [], ...overrides,
    });
}

describe("Foster Management: Assign Animals to Foster Caregivers", () => {
    function stubAssign({ application = { _id: newId(), applicantName: "Fiona Foster", capacity: 2 }, animal } = {}) {
        const fosterAnimal = animal === undefined
            ? { _id: newId(), name: "Buddy", breed: "Aspin", adoptionStatus: "available", fosterStatus: "none" }
            : animal;
        mock.method(FosterApplication, "findOne", () => query(application));
        mock.method(FosterAssignment, "countDocuments", async () => 0);
        mock.method(Animal, "findById", () => query(fosterAnimal));
        const update = mock.method(Animal, "findByIdAndUpdate", async () => ({}));
        const create = mock.method(FosterAssignment, "create", async (data) => fakeDocument({ ...data }));
        mock.method(User, "findById", () => adminAccount());
        const notification = stubSideEffects();
        return { create, update, notification, animal: fosterAnimal };
    }

    const body = (animalId) => ({ fosterEmail: FOSTER_EMAIL, animalId, shelterName: "RescueBase Shelter" });

    test("CASE-093 | Description: Staff assigns an available animal to an approved foster. | Expected: Assignment is saved.", async () => {
        const { create, update, animal } = stubAssign();

        const result = await callRoute(fosterRoutes, "POST", "/assignments", { role: "staff", body: body(animal._id) });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].status, "active");
        assert.equal(create.mock.calls[0].arguments[0].fosterEmail, FOSTER_EMAIL);
        assert.ok(update.mock.calls.some((call) => JSON.stringify(call.arguments[1]).includes("in_foster")));
    });

    test("CASE-094 | Description: Staff assigns an animal that is already in foster. | Expected: Assignment is refused.", async () => {
        const { create, animal } = stubAssign({
            animal: { _id: newId(), name: "Buddy", adoptionStatus: "available", fosterStatus: "in_foster" },
        });

        const result = await callRoute(fosterRoutes, "POST", "/assignments", { role: "staff", body: body(animal._id) });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /already in foster/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-095 | Description: Staff assigns an animal to a user who is not an approved foster. | Expected: Assignment is refused.", async () => {
        const { create, animal } = stubAssign({ application: null, animal: { _id: newId(), name: "Buddy", fosterStatus: "none" } });

        const result = await callRoute(fosterRoutes, "POST", "/assignments", { role: "staff", body: body(animal._id) });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /not approved/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-095 (foster) | Description: Foster tries to assign an animal. | Expected: Access is denied.", async () => {
        const { create } = stubAssign();

        const result = await callRoute(fosterRoutes, "POST", "/assignments", { role: "foster", body: body(newId()) });

        assert.equal(result.status, 403);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-096 | Description: A foster is assigned an animal. | Expected: Foster is notified by email and in the app.", async () => {
        const { notification, animal } = stubAssign();

        await callRoute(fosterRoutes, "POST", "/assignments", { role: "staff", body: body(animal._id) });

        assert.equal(sentEmails.some((mail) => mail.name === "sendFosterUpdateEmail" && mail.args[0] === FOSTER_EMAIL), true);
        assert.equal(notification.mock.calls[0].arguments[0].title, "New Foster Assignment");
    });
});

describe("Foster Management: View Foster Pet, Submit Care Updates & View History", () => {
    test("CASE-097 | Description: Foster opens their assigned animals. | Expected: Animals are listed.", async () => {
        const find = mock.method(FosterAssignment, "find", () => query([activeAssignment(), activeAssignment({ petName: "Mimi" })]));

        const result = await callRoute(fosterRoutes, "GET", "/assignments/me/active", { role: "foster", user: { email: FOSTER_EMAIL } });

        assert.equal(result.status, 200);
        assert.equal(result.body.assignments.length, 2);
        assert.equal(find.mock.calls[0].arguments[0].fosterEmail, FOSTER_EMAIL);
        assert.equal(find.mock.calls[0].arguments[0].status, "active");
    });

    test("CASE-098 | Description: Foster submits a care update with a note and photo. | Expected: Update is saved and staff can see it.", async () => {
        const assignment = activeAssignment();
        mock.method(FosterAssignment, "findOne", () => query(assignment));
        stubSideEffects();

        const result = await callRoute(fosterRoutes, "POST", `/assignments/${assignment._id}/updates`, {
            role: "foster", user: { email: FOSTER_EMAIL },
            body: { note: "Eating well", photoUrl: "https://img.test/buddy.jpg", weight: 12 },
        });

        assert.equal(result.status, 200);
        assert.equal(assignment.updates.length, 1);
        assert.equal(assignment.updates[0].note, "Eating well");
        assert.equal(assignment.updates[0].photoUrl, "https://img.test/buddy.jpg");
        assert.equal(assignment.savedTimes, 1);

        // staff list shows the assignment together with its updates
        mock.method(FosterAssignment, "find", () => query([assignment]));
        const staffView = await callRoute(fosterRoutes, "GET", "/assignments", { role: "staff" });
        assert.equal(staffView.status, 200);
        assert.equal(JSON.stringify(staffView.body).includes("Eating well"), true);
    });

    test("CASE-099 | Description: Foster submits a care update with no note. | Expected: Submission fails with required field message.", async () => {
        const findOne = mock.method(FosterAssignment, "findOne", () => query(activeAssignment()));
        stubSideEffects();

        const result = await callRoute(fosterRoutes, "POST", `/assignments/${newId()}/updates`, {
            role: "foster", user: { email: FOSTER_EMAIL }, body: { note: "   " },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /note is required/i);
        assert.equal(findOne.mock.callCount(), 0);
    });

    test("CASE-100 | Description: Foster opens the foster history. | Expected: Finished assignments are listed.", async () => {
        const find = mock.method(FosterAssignment, "find", () => query([
            activeAssignment({ status: "completed" }), activeAssignment({ status: "returned" }),
        ]));

        const result = await callRoute(fosterRoutes, "GET", "/assignments/me/history", { role: "foster", user: { email: FOSTER_EMAIL } });

        assert.equal(result.status, 200);
        assert.equal(result.body.history.length, 2);
        assert.deepEqual(find.mock.calls[0].arguments[0].status.$in, ["completed", "returned"]);
    });
});

describe("Foster Management: Submit Behavior Evaluations, Medical Requests & Return Requests", () => {
    test("CASE-101 | Description: Foster submits a behavior evaluation with all 8 scores. | Expected: Evaluation is saved as pending.", async () => {
        const assignment = activeAssignment();
        mock.method(FosterAssignment, "findOne", () => query(assignment));
        stubSideEffects();

        const result = await callRoute(fosterRoutes, "POST", `/assignments/${assignment._id}/behavior-evaluation`, {
            role: "foster", user: { email: FOSTER_EMAIL }, body: { ...SCORES, notes: "Calm dog" },
        });

        assert.equal(result.status, 200);
        assert.equal(assignment.behaviorEvaluation.status, "pending");
        assert.equal(assignment.behaviorEvaluation.energyLevel, 4);
        assert.equal(assignment.savedTimes, 1);
    });

    test("CASE-102 | Description: Foster submits an evaluation with a score missing. | Expected: Submission fails with error message.", async () => {
        const assignment = activeAssignment();
        mock.method(FosterAssignment, "findOne", () => query(assignment));
        stubSideEffects();

        const { anxietyLevel, ...incomplete } = SCORES;
        const result = await callRoute(fosterRoutes, "POST", `/assignments/${assignment._id}/behavior-evaluation`, {
            role: "foster", user: { email: FOSTER_EMAIL }, body: incomplete,
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /anxietyLevel must be a value from 1 to 5/);
        assert.equal(assignment.savedTimes, 0);
    });

    test("CASE-103 | Description: Foster requests medical help with a description. | Expected: Request is saved as pending.", async () => {
        const assignment = activeAssignment();
        mock.method(FosterAssignment, "findOne", () => query(assignment));
        stubSideEffects();

        const result = await callRoute(fosterRoutes, "POST", `/assignments/${assignment._id}/medical-requests`, {
            role: "foster", user: { email: FOSTER_EMAIL }, body: { issue: "Limping on the left leg", urgency: "High" },
        });

        assert.equal(result.status, 201);
        assert.equal(assignment.medicalRequests.length, 1);
        assert.equal(assignment.medicalRequests[0].status, "pending");
        assert.equal(assignment.medicalRequests[0].urgency, "High");
    });

    test("CASE-104 | Description: Foster requests medical help without a description. | Expected: Submission fails with required field message.", async () => {
        const findOne = mock.method(FosterAssignment, "findOne", () => query(activeAssignment()));
        stubSideEffects();

        const result = await callRoute(fosterRoutes, "POST", `/assignments/${newId()}/medical-requests`, {
            role: "foster", user: { email: FOSTER_EMAIL }, body: { issue: "" },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /issue is required/i);
        assert.equal(findOne.mock.callCount(), 0);
    });

    test("CASE-105 | Description: Foster requests to return an animal. | Expected: Request is saved as pending.", async () => {
        const assignment = activeAssignment();
        mock.method(FosterAssignment, "findOne", () => query(assignment));
        stubSideEffects();
        const insertMany = Notification.insertMany;

        const result = await callRoute(fosterRoutes, "POST", `/assignments/${assignment._id}/return-request`, {
            role: "foster", user: { email: FOSTER_EMAIL }, body: { reason: "Personal", notes: "Moving away" },
        });

        assert.equal(result.status, 200);
        assert.equal(assignment.returnRequest.status, "pending");
        assert.equal(assignment.returnRequest.reason, "Personal");
        assert.equal(insertMany.mock.callCount(), 1);
    });
});

describe("Foster Management: Review Evaluations, Medical Requests & Return Requests", () => {
    test("CASE-106 | Description: Staff accepts a behavior evaluation. | Expected: Scores are copied to the animal.", async () => {
        const animal = { _id: newId(), name: "Buddy" };
        const assignment = activeAssignment({
            animalId: animal._id, behaviorEvaluation: { status: "pending", ...SCORES, submittedBy: "Fiona Foster" },
        });
        mock.method(FosterAssignment, "findById", () => query(assignment));
        mock.method(Animal, "findById", () => query(animal));
        const update = mock.method(Animal, "findByIdAndUpdate", async () => ({ ...animal, ...SCORES }));
        mock.method(User, "findById", () => adminAccount());
        stubSideEffects();

        const result = await callRoute(fosterRoutes, "PATCH", `/assignments/${assignment._id}/behavior-evaluation/accept`, { role: "staff" });

        assert.equal(result.status, 200);
        const written = update.mock.calls[0].arguments[1].$set;
        for (const [factor, score] of Object.entries(SCORES)) assert.equal(written[factor], score);
        assert.equal(assignment.behaviorEvaluation.status, "accepted");
    });

    test("CASE-107 | Description: Staff sends an evaluation back to the foster. | Expected: Foster can edit and resubmit.", async () => {
        const assignment = activeAssignment({ behaviorEvaluation: { status: "pending", ...SCORES } });
        mock.method(FosterAssignment, "findById", () => query(assignment));
        mock.method(FosterAssignment, "findOne", () => query(assignment));
        mock.method(User, "findById", () => adminAccount());
        stubSideEffects();

        const sentBack = await callRoute(fosterRoutes, "PATCH", `/assignments/${assignment._id}/behavior-evaluation/return`, {
            role: "staff", body: { reason: "Please re-check the aggression score" },
        });

        assert.equal(sentBack.status, 200);
        assert.equal(assignment.behaviorEvaluation.status, "revision");
        assert.match(assignment.behaviorEvaluation.reviewNotes, /aggression/);

        const resubmitted = await callRoute(fosterRoutes, "POST", `/assignments/${assignment._id}/behavior-evaluation`, {
            role: "foster", user: { email: FOSTER_EMAIL }, body: { ...SCORES, aggressionLevel: 2 },
        });

        assert.equal(resubmitted.status, 200);
        assert.equal(assignment.behaviorEvaluation.status, "pending");
        assert.equal(assignment.behaviorEvaluation.aggressionLevel, 2);
    });

    test("CASE-108 | Description: Staff responds to a medical request. | Expected: Response is shown to the foster.", async () => {
        const request = { _id: newId(), issue: "Limping", status: "pending" };
        const assignment = activeAssignment({ medicalRequests: Object.assign([request], { id: () => request }) });
        mock.method(FosterAssignment, "findById", () => query(assignment));
        stubSideEffects();

        const result = await callRoute(fosterRoutes, "PATCH", `/medical-requests/${assignment._id}/${request._id}`, {
            role: "staff", body: { status: "resolved", resolutionNotes: "Vet visit booked Friday" },
        });

        assert.equal(result.status, 200);
        assert.equal(request.status, "resolved");
        assert.equal(request.resolutionNotes, "Vet visit booked Friday");

        // the foster's own assignment view returns the same record
        mock.method(FosterAssignment, "find", () => query([assignment]));
        const fosterView = await callRoute(fosterRoutes, "GET", "/assignments/me/active", { role: "foster", user: { email: FOSTER_EMAIL } });
        assert.equal(JSON.stringify(fosterView.body).includes("Vet visit booked Friday"), true);
    });

    test("CASE-109 | Description: Staff approves a return request. | Expected: Assignment closes and the animal is available.", async () => {
        const animalId = newId();
        const returned = activeAssignment({ animalId, status: "returned", returnRequest: { reason: "Personal" } });
        const update = mock.method(FosterAssignment, "findOneAndUpdate", async () => returned);
        const animalUpdate = mock.method(Animal, "findByIdAndUpdate", async () => ({}));
        mock.method(User, "findById", () => adminAccount());
        stubSideEffects();

        const result = await callRoute(fosterRoutes, "PATCH", `/assignments/${returned._id}/return-request`, {
            role: "staff", body: { action: "confirm" },
        });

        assert.equal(result.status, 200);
        assert.equal(update.mock.calls[0].arguments[1].$set.status, "returned");
        assert.equal(animalUpdate.mock.calls[0].arguments[0], animalId);
        assert.equal(animalUpdate.mock.calls[0].arguments[1].$set.fosterStatus, "none");
    });

    test("CASE-110 | Description: Staff declines a return request. | Expected: Assignment stays active and a note is required.", async () => {
        const assignment = activeAssignment({ returnRequest: { status: "declined" } });
        const update = mock.method(FosterAssignment, "findOneAndUpdate", async () => assignment);
        const animalUpdate = mock.method(Animal, "findByIdAndUpdate", async () => ({}));
        mock.method(User, "findById", () => adminAccount());
        stubSideEffects();

        const noNote = await callRoute(fosterRoutes, "PATCH", `/assignments/${assignment._id}/return-request`, {
            role: "staff", body: { action: "decline" },
        });
        assert.equal(noNote.status, 400);
        assert.equal(update.mock.callCount(), 0);

        const declined = await callRoute(fosterRoutes, "PATCH", `/assignments/${assignment._id}/return-request`, {
            role: "staff", body: { action: "decline", adminNote: "We cannot take him back this week" },
        });

        assert.equal(declined.status, 200);
        const set = update.mock.calls[0].arguments[1].$set;
        assert.equal(set["returnRequest.status"], "declined");
        assert.equal("status" in set, false); // the assignment status is not changed
        assert.equal(animalUpdate.mock.callCount(), 0);
    });
});
