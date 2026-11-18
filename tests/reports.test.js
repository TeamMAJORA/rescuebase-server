// Table 35 - Reports Module (CASE-182 to CASE-185)
// Real report routes run with mocked models. The ZIP is built by the real archiver; the response headers are checked.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, fakeDocument, callRoute, newId } = require("./helpers/http");

const Report = require("../models/Reports");
const Animal = require("../models/Animal");
const User = require("../models/User");

const reportsRoutes = require("../routes/reportsRoutes");

afterEach(() => mock.restoreAll());

function stubStaffAndAnimals() {
    mock.method(User, "findById", () => query({ _id: newId(), name: "Staff Sam", email: "staff@test.rescuebase", role: "staff" }));
    mock.method(Animal, "find", () => query([{ _id: newId(), name: "Buddy", type: "Dog", intakeDate: new Date("2026-11-05") }]));
}

const RANGE = { dateRange: "custom", fromDate: "2026-11-01", toDate: "2026-11-15", reportType: "animals", title: "November intake" };

describe("Table 35 - Reports: Generate & Download Operational Reports", () => {
    test("CASE-182 generating a report for a custom date range creates it, returns a ZIP and lists it", async () => {
        stubStaffAndAnimals();
        const saved = [];
        const create = mock.method(Report, "create", async (data) => { const row = fakeDocument({ ...data }); saved.push(row); return row; });

        const result = await callRoute(reportsRoutes, "POST", "/generate", { role: "staff", body: RANGE });

        assert.equal(result.status, 200);
        assert.equal(create.mock.calls[0].arguments[0].dateRange, "custom");
        assert.ok(create.mock.calls[0].arguments[0].fromDate instanceof Date);
        assert.equal(create.mock.calls[0].arguments[0].recordCounts.animals, 1);
        assert.equal(result.res.headers["content-type"], "application/zip");

        mock.method(Report, "find", () => query(saved.map((row) => row.toObject())));
        const list = await callRoute(reportsRoutes, "GET", "/", { role: "staff" });
        assert.equal(list.body.reports[0].title, "November intake");
    });

    test("CASE-183 downloading a generated report returns a ZIP file", async () => {
        stubStaffAndAnimals();
        mock.method(Report, "findById", () => query({
            _id: newId(), title: "November intake", type: "animals", exportFormat: "zip",
            fromDate: new Date("2026-11-01"), toDate: new Date("2026-11-15"),
            datasets: { includeAnimals: true, species: "all" },
        }));

        const result = await callRoute(reportsRoutes, "GET", `/${newId()}/download`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.res.headers["content-type"], "application/zip");
        assert.match(result.res.headers["content-disposition"], /November_intake\.zip|November intake\.zip|\.zip/);
    });

    test("CASE-184 a start date after the end date is refused with a message", async () => {
        stubStaffAndAnimals();
        const create = mock.method(Report, "create", async () => ({}));

        const result = await callRoute(reportsRoutes, "POST", "/generate", {
            role: "staff", body: { ...RANGE, fromDate: "2026-11-20", toDate: "2026-11-01" },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /fromDate must be earlier/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-185 the report list returns the previously generated reports", async () => {
        mock.method(Report, "find", () => query([{ _id: newId(), title: "Report A" }, { _id: newId(), title: "Report B" }]));

        const result = await callRoute(reportsRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.reports.length, 2);
    });
});
