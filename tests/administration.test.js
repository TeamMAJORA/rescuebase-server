// Administration Module (CASE-185 to CASE-194)
// Real activity-log and global-settings routes run with mocked models. Settings are kept in a small
// in-memory store so a saved change is really read back by the later steps (maintenance mode, password rule).
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");

const { mock, query, callRoute, callHandler, authAs, newId, SETTINGS } = require("./helpers/http");

const ActivityLog = require("../models/ActivityLog");
const GlobalSettings = require("../models/GlobalSettings");

const activityLogRoutes = require("../routes/activityLogRoutes");
const globalSettingsRoutes = require("../routes/globalSettingsRoutes");
const activityLogger = require("../middleware/activityLogger");
const maintenanceMode = require("../middleware/maintenanceMode");
const { validatePassword } = require("../utils/passwordPolicy");

afterEach(() => mock.restoreAll());

// GlobalSettings.findOneAndUpdate behaves like the database: "$set" with dotted keys changes the stored values.
function stubSettingsStore() {
    const store = JSON.parse(JSON.stringify(SETTINGS));
    const update = mock.method(GlobalSettings, "findOneAndUpdate", (filter, change) => {
        for (const [path, value] of Object.entries(change?.$set || {})) {
            const [category, field] = path.split(".");
            if (field) store[category][field] = value;
        }
        return query({ ...store });
    });
    return { store, update };
}

function stubLogQueries(rows = []) {
    const find = mock.method(ActivityLog, "find", () => query(rows));
    mock.method(ActivityLog, "countDocuments", async () => rows.length);
    mock.method(ActivityLog, "distinct", async () => []);
    return find;
}

describe("Administration: View Activity Logs", () => {
    test("CASE-185 | Description: Admin adds an animal | Expected: Activity 'Added animal Buddy' logged for the admin and shown in the log", async () => {
        const adminId = newId();
        const create = mock.method(ActivityLog, "create", async (data) => data);
        const res = new EventEmitter();
        res.statusCode = 201;
        res.json = (body) => body;
        const req = { method: "POST", originalUrl: "/api/animals", body: { name: "Buddy" }, user: { id: adminId, role: "admin" } };

        activityLogger(req, res, () => {});
        res.json({ success: true, animal: { name: "Buddy" } });
        res.emit("finish");
        await new Promise((resolve) => setTimeout(resolve, 50));

        assert.equal(create.mock.callCount(), 1);
        assert.equal(create.mock.calls[0].arguments[0].activity, "Added animal Buddy");
        assert.equal(create.mock.calls[0].arguments[0].user, adminId);

        mock.restoreAll();
        stubLogQueries([{ activity: "Added animal Buddy", activityType: "Animal" }]);
        const log = await callRoute(activityLogRoutes, "GET", "/", { role: "admin" });
        assert.equal(log.status, 200);
        assert.equal(log.body.logs[0].activity, "Added animal Buddy");
    });

    test("CASE-186 | Description: Admin filters the activity log by user | Expected: 200; only that user's entries requested", async () => {
        const find = stubLogQueries([]);
        const userId = newId();

        const result = await callRoute(activityLogRoutes, "GET", `/?userId=${userId}`, { role: "admin" });

        assert.equal(result.status, 200);
        assert.equal(find.mock.calls[0].arguments[0].user, userId);
    });

    test("CASE-187 | Description: Admin filters the activity log by a date range (1st to 15th) | Expected: 200; only entries inside the range requested", async () => {
        const find = stubLogQueries([]);

        const result = await callRoute(activityLogRoutes, "GET", "/?startDate=2026-11-01&endDate=2026-11-15", { role: "admin" });

        assert.equal(result.status, 200);
        const range = find.mock.calls[0].arguments[0].activityDate;
        assert.equal(range.$gte.getDate(), 1);
        assert.equal(range.$lte.getDate(), 15);
    });

    test("CASE-188 | Description: Staff opens the activity log and asks for another user's entries | Expected: 200; limited to the staff member's own entries", async () => {
        const find = stubLogQueries([]);
        const staffId = newId();

        const result = await callRoute(activityLogRoutes, "GET", `/?userId=${newId()}`, { role: "staff", user: { id: staffId } });

        assert.equal(result.status, 200);
        assert.equal(String(find.mock.calls[0].arguments[0].user), String(staffId), "the query is limited to the staff member's own entries");
    });
});

describe("Administration: Manage Global Settings (including Maintenance Mode)", () => {
    test("CASE-189 | Description: Admin saves a new shelter name and capacity (50) | Expected: 200; saved values returned", async () => {
        const { update } = stubSettingsStore();

        const result = await callRoute(globalSettingsRoutes, "PATCH", "/", {
            role: "admin", settings: false, body: { general: { shelterName: "Happy Paws Shelter", shelterCapacity: 50 } },
        });

        assert.equal(result.status, 200);
        const written = update.mock.calls.find((call) => call.arguments[1]?.$set?.["general.shelterName"]);
        assert.equal(written.arguments[1].$set["general.shelterCapacity"], 50);
        assert.equal(result.body.settings.general.shelterName, "Happy Paws Shelter");
        assert.equal(result.body.settings.general.shelterCapacity, 50);
    });

    test("CASE-190 | Description: Admin saves an invalid shelter capacity | Expected: 400 'between 1 and 10000'", async () => {
        stubSettingsStore();

        for (const capacity of [0, -5, "abc", 2.5, 20000]) {
            const result = await callRoute(globalSettingsRoutes, "PATCH", "/", {
                role: "admin", settings: false, body: { general: { shelterCapacity: capacity } },
            });
            assert.equal(result.status, 400);
            assert.match(result.body.message, /shelterCapacity must be an integer between 1 and 10000/);
        }
    });

    function request(role) {
        const headers = role ? { authorization: authAs(role).header } : {};
        return { method: "GET", path: "/api/animals", headers };
    }

    test("CASE-191 | Description: Admin turns maintenance mode on | Expected: Adopter gets 503 'Back soon'; admin can still use the system", async () => {
        stubSettingsStore();

        const turnedOn = await callRoute(globalSettingsRoutes, "PATCH", "/", {
            role: "admin", settings: false, body: { maintenance: { enabled: true, message: "Back soon" } },
        });
        assert.equal(turnedOn.status, 200);

        const adopter = await callHandler(maintenanceMode, request("adopter"));
        assert.equal(adopter.status, 503);
        assert.equal(adopter.body.maintenance, true);
        assert.equal(adopter.body.message, "Back soon");

        const admin = await callHandler(maintenanceMode, request("admin"));
        assert.equal(admin.status, 200); // passed through to the system, no 503 sent
        assert.equal(admin.body, undefined);
    });

    test("CASE-192 | Description: Admin turns maintenance mode off | Expected: Adopter can use the system again (200)", async () => {
        stubSettingsStore();
        await callRoute(globalSettingsRoutes, "PATCH", "/", { role: "admin", settings: false, body: { maintenance: { enabled: true } } });
        await callRoute(globalSettingsRoutes, "PATCH", "/", { role: "admin", settings: false, body: { maintenance: { enabled: false } } });

        const adopter = await callHandler(maintenanceMode, request("adopter"));

        assert.equal(adopter.status, 200);
        assert.equal(adopter.body, undefined);
    });

    test("CASE-193 | Description: Strong passwords is off and a user enters a 5-character password | Expected: Rejected (400); 6 characters accepted", async () => {
        stubSettingsStore();
        await callRoute(globalSettingsRoutes, "PATCH", "/", { role: "admin", settings: false, body: { security: { requireStrongPasswords: false } } });

        await assert.rejects(validatePassword("abcde"), (error) => error.statusCode === 400);
        await assert.doesNotReject(validatePassword("abcdef"));
    });

    test("CASE-194 | Description: Staff opens the global settings | Expected: 403", async () => {
        stubSettingsStore();

        const result = await callRoute(globalSettingsRoutes, "GET", "/", { role: "staff", settings: false });

        assert.equal(result.status, 403);
    });
});
