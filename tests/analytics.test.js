// Table 35 - Analytics Module (CASE-176 to CASE-180)
// Real analytics routes run with mocked models; the AI forecast service is a mocked fetch.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, callRoute } = require("./helpers/http");

const Animal = require("../models/Animal");
const AdoptionApplication = require("../models/AdoptionApplication");
const FosterAssignment = require("../models/FosterAssignment");
const LostFoundReport = require("../models/LostFoundReport");
const FoodInventory = require("../models/FoodInventory");

const analyticsRoutes = require("../routes/analyticsRoutes");

afterEach(() => mock.restoreAll());

function stubOverview({ count = 0, rows = [] } = {}) {
    for (const model of [Animal, AdoptionApplication, FosterAssignment, LostFoundReport]) {
        mock.method(model, "countDocuments", async () => count);
    }
    for (const model of [Animal, FosterAssignment, LostFoundReport]) {
        mock.method(model, "find", () => query(rows));
    }
}

describe("Table 35 - Analytics: View Operational Analytics Dashboard", () => {
    test("CASE-176 staff open the analytics dashboard and get totals and six months of chart data", async () => {
        stubOverview({ count: 4, rows: [{ updatedAt: new Date(), intakeDate: new Date(), dateReported: new Date(), startDate: new Date() }] });

        const result = await callRoute(analyticsRoutes, "GET", "/overview", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.totals.adoptions, 4);
        assert.equal(result.body.monthlyStats.length, 6);
        assert.ok(result.body.monthlyStats.some((month) => month.adoptions > 0));
    });

    test("CASE-177 the dashboard with no data returns zero totals and empty months without an error", async () => {
        stubOverview({ count: 0, rows: [] });

        const result = await callRoute(analyticsRoutes, "GET", "/overview", { role: "admin" });

        assert.equal(result.status, 200);
        assert.deepEqual(result.body.totals, { adoptions: 0, rescues: 0, lostFound: 0, foster: 0 });
        assert.equal(result.body.monthlyStats.every((month) => month.adoptions === 0 && month.rescues === 0), true);
    });

    test("CASE-178 an adopter cannot open the analytics dashboard", async () => {
        const result = await callRoute(analyticsRoutes, "GET", "/overview", { role: "adopter" });

        assert.equal(result.status, 403);
    });
});

describe("Table 35 - Analytics: View AI Intake Forecast", () => {
    function stubForecastData() {
        mock.method(Animal, "find", () => query([{ intakeDate: new Date(), adoptionStatus: "available", updatedAt: new Date() }]));
        mock.method(FoodInventory, "find", () => query([]));
    }

    test("CASE-179 staff open the AI intake forecast and see the predicted intake for next month", async () => {
        stubForecastData();
        const ai = mock.method(globalThis, "fetch", async () => ({
            ok: true, json: async () => ({ success: true, predictedIntake: 7.4, roundedPredictedIntake: 7 }),
        }));

        const result = await callRoute(analyticsRoutes, "GET", "/intake-forecast", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.target.roundedPredictedIntake, 7);
        assert.equal(result.body.history.length, 12);
        assert.equal(JSON.parse(ai.mock.calls[0].arguments[1].body).history.length, 12);
    });

    test("CASE-180 when the AI service is unavailable a clear error message is returned", async () => {
        stubForecastData();
        mock.method(globalThis, "fetch", async () => { throw new Error("connect ECONNREFUSED"); });

        const result = await callRoute(analyticsRoutes, "GET", "/intake-forecast", { role: "staff" });

        assert.equal(result.status, 502);
        assert.equal(result.body.success, false);
        assert.match(result.body.message, /unable to connect to the intake forecasting service/i);
    });
});
