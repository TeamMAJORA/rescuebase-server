// Rescue Assignment Module (CASE-158 to CASE-161)
// Real rescue assignment routes (login check, role check, controller) run with mocked models.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, fakeDocument, callRoute, newId, sentEmails } = require("./helpers/http");

const RescueAssignment = require("../models/RescueAssignment");
const User = require("../models/User");
const Notification = require("../models/Notifications");

const rescueRoutes = require("../routes/rescueAssignmentRoutes");

afterEach(() => {
    mock.restoreAll();
    sentEmails.length = 0;
});

const TASK = {
    title: "Rescue injured dog", description: "Dog hit by a motorbike near Colon", location: "Colon Street, Cebu City",
    scheduledDate: "2026-11-20", scheduledTime: "09:00", priority: "urgent",
};

function stubCreate({ volunteer = null } = {}) {
    mock.method(User, "findOne", () => query(volunteer));
    mock.method(User, "findById", () => query({ _id: newId(), name: "Staff Sam", email: "staff@test.rescuebase", role: "staff" }));
    mock.method(User, "find", () => query([{ _id: newId() }]));
    mock.method(Notification, "insertMany", async () => []);
    const notification = mock.method(Notification, "create", async () => ({}));
    const create = mock.method(RescueAssignment, "create", async (data) => fakeDocument({ ...data }));
    return { create, notification };
}

describe("Rescue Assignment: Create & Assign Rescue Tasks", () => {
    test("CASE-158 | Description: Staff creates a rescue task with all required details. | Expected: Task is saved as open.", async () => {
        const { create } = stubCreate();

        const result = await callRoute(rescueRoutes, "POST", "/", { role: "staff", body: TASK });

        assert.equal(result.status, 201);
        const saved = create.mock.calls[0].arguments[0];
        assert.equal(saved.status, "open");
        assert.equal(saved.title, "Rescue injured dog");
        assert.equal(saved.priority, "urgent");
    });

    test("CASE-159 | Description: Staff leaves a required rescue field empty. | Expected: Save fails with required field message.", async () => {
        const { create } = stubCreate();

        for (const [field, pattern] of [["title", /title is required/i], ["description", /description is required/i], ["location", /location is required/i]]) {
            const result = await callRoute(rescueRoutes, "POST", "/", { role: "staff", body: { ...TASK, [field]: "" } });
            assert.equal(result.status, 400);
            assert.match(result.body.message, pattern);
        }
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-160 | Description: Staff assigns a rescue task to a volunteer. | Expected: Volunteer is notified and sees the task.", async () => {
        const volunteerId = newId();
        const { create, notification } = stubCreate({ volunteer: { _id: volunteerId, name: "Vic Volunteer", email: "vic@test.rescuebase" } });

        const result = await callRoute(rescueRoutes, "POST", "/", { role: "staff", body: { ...TASK, volunteerId } });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].status, "pending");
        assert.equal(create.mock.calls[0].arguments[0].volunteerId, volunteerId);
        assert.equal(notification.mock.calls[0].arguments[0].title, "New Rescue Assignment");

        // the volunteer's own task list asks for tasks assigned to that volunteer
        const find = mock.method(RescueAssignment, "find", () => query([{ _id: newId(), title: TASK.title, status: "pending" }]));
        const mine = await callRoute(rescueRoutes, "GET", "/my", { role: "volunteer" });
        assert.equal(mine.status, 200);
        assert.equal(mine.body.assignments[0].title, "Rescue injured dog");
        assert.equal(find.mock.calls[0].arguments[0].volunteerId, mine.account._id);
    });

    test("CASE-161 | Description: Volunteer accepts, starts and completes a rescue task. | Expected: Status updates and staff are notified.", async () => {
        const volunteer = { id: newId() };
        const task = fakeDocument({
            title: "Rescue injured dog", status: "pending", volunteerName: "Vic Volunteer", adminId: newId(), adminEmail: "staff@test.rescuebase",
        });
        mock.method(RescueAssignment, "findOne", () => Promise.resolve(task));
        const notification = mock.method(Notification, "create", async () => ({}));
        const proof = { completionNotes: "Dog taken to the vet", completionPhotos: ["https://res.cloudinary.com/demo/image/upload/proof.jpg"] };

        const accepted = await callRoute(rescueRoutes, "PATCH", `/${task._id}/accept`, { role: "volunteer", user: volunteer });
        assert.equal(accepted.status, 200);
        assert.equal(task.status, "accepted");

        const started = await callRoute(rescueRoutes, "PATCH", `/${task._id}/start`, { role: "volunteer", user: volunteer });
        assert.equal(started.status, 200);
        assert.equal(task.status, "active");

        const noProof = await callRoute(rescueRoutes, "PATCH", `/${task._id}/complete`, { role: "volunteer", user: volunteer, body: { completionNotes: "Done" } });
        assert.equal(noProof.status, 400);
        assert.equal(task.status, "active");

        const completed = await callRoute(rescueRoutes, "PATCH", `/${task._id}/complete`, { role: "volunteer", user: volunteer, body: proof });
        assert.equal(completed.status, 200);
        assert.equal(task.status, "completed");
        assert.deepEqual(task.completionPhotos, proof.completionPhotos);
        assert.deepEqual(notification.mock.calls.map((call) => call.arguments[0].title), [
            "Rescue Assignment Accepted.", "Rescue Assignment Started", "Rescue Assignment Completed",
        ]);
    });
});
