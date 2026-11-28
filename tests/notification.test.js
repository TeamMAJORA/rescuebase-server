// Notification Module (CASE-162 to CASE-166)
// Real notification routes run with an in-memory list of notifications instead of the database.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");

const { mock, query, fakeDocument, callRoute, newId, sentEmails, stubSettings } = require("./helpers/http");

const lostFoundController = require("../controllers/lostFoundController");
lostFoundController.removeShelterListing = async () => {};

const Notification = require("../models/Notifications");
const User = require("../models/User");
const Animal = require("../models/Animal");
const AdoptionApplication = require("../models/AdoptionApplication");
const LedgerEntry = require("../models/LedgerEntry");
const VaccinationRecord = require("../models/VaccinationRecord");
const FosterAssignment = require("../models/FosterAssignment");

const notificationRoutes = require("../routes/notificationRoutes");
const adoptionRoutes = require("../routes/adoptionRoutes");
const { runVaccinationReminders } = require("../jobs/vaccinationReminders");

afterEach(() => {
    mock.restoreAll();
    sentEmails.length = 0;
});

// A tiny in-memory notification store that answers the same calls the controller makes.
function stubNotificationStore(userId, readFlags) {
    const store = readFlags.map((read) => ({ _id: newId(), user: userId, title: "Update", read }));
    const matches = (item, filter) =>
        (filter.user === undefined || String(item.user) === String(filter.user)) &&
        (filter.read === undefined || item.read === filter.read) &&
        (filter._id === undefined || String(item._id) === String(filter._id));
    mock.method(Notification, "find", (filter) => query(store.filter((item) => matches(item, filter))));
    mock.method(Notification, "countDocuments", async (filter) => store.filter((item) => matches(item, filter)).length);
    mock.method(Notification, "findOneAndUpdate", async (filter, update) => {
        const item = store.find((each) => matches(each, filter));
        if (item) Object.assign(item, update.$set);
        return item || null;
    });
    mock.method(Notification, "updateMany", async (filter, update) => {
        store.filter((item) => matches(item, filter)).forEach((item) => Object.assign(item, update.$set));
        return {};
    });
    return store;
}

describe("Notification: View Automated Notifications", () => {
    test("CASE-162 | Description: An application status changes. | Expected: Adopter gets a notification and the unread count goes up.", async () => {
        const adopterId = newId();
        const application = fakeDocument({
            applicantUserId: adopterId, fullName: "Ana Adopter", email: "ana@test.rescuebase", animalId: newId(), petName: "Buddy",
            status: "pending", documents: [], documentRequest: {}, async populate() { return this; },
        });
        mock.method(AdoptionApplication, "findById", () => query(application));
        mock.method(Animal, "exists", async () => ({ _id: application.animalId }));
        mock.method(User, "findById", () => query({ _id: newId(), name: "Staff Sam", email: "staff@test.rescuebase", role: "staff" }));
        mock.method(User, "find", () => query([{ _id: newId() }]));
        mock.method(Notification, "insertMany", async () => []);
        mock.method(LedgerEntry, "create", async () => ({}));
        const created = [];
        mock.method(Notification, "create", async (data) => { created.push(data); return data; });

        const result = await callRoute(adoptionRoutes, "PATCH", `/${application._id}/status`, {
            role: "staff", body: { status: "interview_scheduled", interviewSchedule: new Date(Date.now() + 3 * 86400000).toISOString() },
        });

        assert.equal(result.status, 200);
        assert.equal(created.length, 1);
        assert.equal(String(created[0].user), String(adopterId));

        // the adopter's bell now counts it
        mock.restoreAll();
        stubNotificationStore(adopterId, [true, false, false]);
        const bell = await callRoute(notificationRoutes, "GET", "/unread-count", { role: "adopter", user: { id: adopterId } });
        assert.equal(bell.body.count, 2);
    });

    test("CASE-163 | Description: User opens their notifications. | Expected: Their notifications are listed.", async () => {
        const userId = newId();
        stubNotificationStore(userId, [false, true]);

        const result = await callRoute(notificationRoutes, "GET", "/", { role: "adopter", user: { id: userId } });

        assert.equal(result.status, 200);
        assert.equal(result.body.notifications.length, 2);
    });

    test("CASE-164 | Description: User marks one notification as read. | Expected: Unread count goes down by one.", async () => {
        const userId = newId();
        const store = stubNotificationStore(userId, [false, false, false]);

        const before = await callRoute(notificationRoutes, "GET", "/unread-count", { role: "adopter", user: { id: userId } });
        const read = await callRoute(notificationRoutes, "PATCH", `/${store[0]._id}/read`, { role: "adopter", user: { id: userId } });
        const after = await callRoute(notificationRoutes, "GET", "/unread-count", { role: "adopter", user: { id: userId } });

        assert.equal(read.status, 200);
        assert.equal(before.body.count, 3);
        assert.equal(after.body.count, 2);
    });

    test("CASE-165 | Description: User marks all notifications as read. | Expected: Unread count is zero.", async () => {
        const userId = newId();
        stubNotificationStore(userId, [false, false, false]);

        const readAll = await callRoute(notificationRoutes, "PATCH", "/read-all", { role: "adopter", user: { id: userId } });
        const after = await callRoute(notificationRoutes, "GET", "/unread-count", { role: "adopter", user: { id: userId } });

        assert.equal(readAll.status, 200);
        assert.equal(after.body.count, 0);
    });

    test("CASE-166 | Description: A vaccination is due in 3 days. | Expected: Staff and foster are reminded.", async () => {
        stubSettings();
        const originalState = Object.getOwnPropertyDescriptor(mongoose.connection, "readyState");
        Object.defineProperty(mongoose.connection, "readyState", { value: 1, configurable: true });
        try {
            const record = {
                _id: newId(), vaccine_name: "Rabies", next_due_date: new Date(Date.now() + 2 * 86400000),
                animal_id: { _id: newId(), name: "Buddy" },
            };
            mock.method(VaccinationRecord, "find", () => query([record]));
            mock.method(VaccinationRecord, "exists", async () => null); // no newer dose recorded
            mock.method(User, "find", () => query([{ _id: newId() }]));
            mock.method(User, "findOne", () => query({ _id: newId() })); // the foster's account
            const insertMany = mock.method(Notification, "insertMany", async () => []);
            mock.method(FosterAssignment, "findOne", () => query({ fosterEmail: "foster@test.rescuebase" }));
            const markSent = mock.method(VaccinationRecord, "updateOne", async () => ({ modifiedCount: 1 }));
            mock.method(Notification, "create", async (data) => data); // the foster's bell

            await runVaccinationReminders();

            assert.equal(insertMany.mock.callCount(), 1);
            assert.equal(insertMany.mock.calls[0].arguments[0][0].title, "Vaccination due soon");
            assert.match(insertMany.mock.calls[0].arguments[0][0].message, /Buddy: Rabies is due/);
            assert.equal(sentEmails.some((mail) => mail.name === "sendVaccinationReminderEmail" && mail.args[0] === "foster@test.rescuebase"), true);
            assert.equal(markSent.mock.callCount(), 2); // staff and foster marks, so the same dose is not reminded twice
        } finally {
            if (originalState) Object.defineProperty(mongoose.connection, "readyState", originalState);
            else delete mongoose.connection.readyState;
        }
    });
});
