// Feedback Management Module (CASE-167 to CASE-175)
// Real feedback routes (login check, role check, controller) run with mocked models.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, fakeDocument, callRoute, newId, sentEmails } = require("./helpers/http");

const Feedback = require("../models/Feedback");
const User = require("../models/User");
const Notification = require("../models/Notifications");

const feedbackRoutes = require("../routes/feedbackRoutes");

afterEach(() => {
    mock.restoreAll();
    sentEmails.length = 0;
});

function stubSender() {
    mock.method(User, "findById", () => query({ _id: newId(), name: "Ana Adopter", email: "adopter@test.rescuebase", role: "adopter" }));
}

describe("Feedback Management: Submit Feedback & View Feedback History", () => {
    test("CASE-167 | Description: User sends feedback with a rating and a message. | Expected: Feedback is saved and shown in their history.", async () => {
        stubSender();
        const saved = [];
        const create = mock.method(Feedback, "create", async (data) => { const row = { _id: newId(), ...data }; saved.push(row); return row; });

        const result = await callRoute(feedbackRoutes, "POST", "/", { role: "adopter", body: { rating: 5, message: "Great service", category: "adoption" } });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].rating, 5);
        assert.equal(create.mock.calls[0].arguments[0].status, "active");

        mock.method(Feedback, "find", () => query(saved));
        const history = await callRoute(feedbackRoutes, "GET", "/me", { role: "adopter" });
        assert.equal(history.body.feedback[0].message, "Great service");
    });

    test("CASE-168 | Description: User sends feedback with the rating or message empty. | Expected: Submission fails with required field message.", async () => {
        stubSender();
        const create = mock.method(Feedback, "create", async () => ({}));

        const noRating = await callRoute(feedbackRoutes, "POST", "/", { role: "adopter", body: { message: "Great service" } });
        const noMessage = await callRoute(feedbackRoutes, "POST", "/", { role: "adopter", body: { rating: 4, message: "  " } });

        assert.equal(noRating.status, 400);
        assert.match(noRating.body.message, /rating/i);
        assert.equal(noMessage.status, 400);
        assert.match(noMessage.body.message, /message is required/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-169 | Description: User opens their feedback history. | Expected: Only their own feedback is listed.", async () => {
        const find = mock.method(Feedback, "find", () => query([{ message: "Mine" }]));

        const result = await callRoute(feedbackRoutes, "GET", "/me", { role: "adopter" });

        assert.equal(result.status, 200);
        assert.equal(find.mock.calls[0].arguments[0].userEmail, "adopter@test.rescuebase");
    });
});

describe("Feedback Management: Review, Reply To, Archive & Restore Feedback", () => {
    function feedbackEntry(overrides = {}) {
        return fakeDocument({ user: newId(), userName: "Ana Adopter", userEmail: "ana@test.rescuebase", message: "Great service", rating: 5, status: "active", ...overrides });
    }

    test("CASE-170 | Description: Staff opens the feedback list. | Expected: Entries are listed with their rating.", async () => {
        mock.method(Feedback, "find", () => query([{ _id: newId(), rating: 4, message: "Good", userEmail: "a@test.rescuebase" }]));
        mock.method(User, "find", () => query([]));

        const result = await callRoute(feedbackRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.feedback[0].rating, 4);
    });

    test("CASE-171 | Description: Staff replies to a feedback entry. | Expected: Reply is saved and the sender is notified.", async () => {
        const entry = feedbackEntry();
        mock.method(Feedback, "findById", async () => entry);
        mock.method(User, "findById", () => query({ name: "Staff Sam" }));
        const notification = mock.method(Notification, "create", async () => ({}));

        const result = await callRoute(feedbackRoutes, "PATCH", `/${entry._id}/reply`, { role: "staff", body: { reply: "Thank you for your kind words!" } });

        assert.equal(result.status, 200);
        assert.equal(entry.reply, "Thank you for your kind words!");
        assert.equal(entry.savedTimes, 1);
        assert.equal(notification.mock.calls[0].arguments[0].title, "We replied to your feedback");
        assert.equal(sentEmails.some((mail) => mail.name === "sendFeedbackReplyEmail"), true);
    });

    test("CASE-172 | Description: Staff archives a feedback entry. | Expected: Entry moves to the archive.", async () => {
        const entry = feedbackEntry();
        mock.method(Feedback, "findById", async () => entry);

        const result = await callRoute(feedbackRoutes, "PATCH", `/${entry._id}/archive`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(entry.status, "archived");
    });

    test("CASE-173 | Description: Staff restores an archived feedback entry. | Expected: Entry returns to the active list.", async () => {
        const entry = feedbackEntry({ status: "archived" });
        mock.method(Feedback, "findById", async () => entry);

        const result = await callRoute(feedbackRoutes, "PATCH", `/${entry._id}/restore`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(entry.status, "active");
    });
});

describe("Feedback Management: Delete Feedback", () => {
    test("CASE-174 | Description: Admin deletes a feedback entry. | Expected: Entry is removed.", async () => {
        const remove = mock.method(Feedback, "findByIdAndDelete", async () => ({ _id: newId() }));

        const result = await callRoute(feedbackRoutes, "DELETE", `/${newId()}`, { role: "admin" });

        assert.equal(result.status, 200);
        assert.equal(remove.mock.callCount(), 1);
    });

    test("CASE-175 | Description: Staff deletes a feedback entry. | Expected: Access is denied.", async () => {
        const remove = mock.method(Feedback, "findByIdAndDelete", async () => ({ _id: newId() }));

        const result = await callRoute(feedbackRoutes, "DELETE", `/${newId()}`, { role: "staff" });

        assert.equal(result.status, 403);
        assert.equal(remove.mock.callCount(), 0);
    });
});
