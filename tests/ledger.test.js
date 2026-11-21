// Ledger Module (CASE-213 to CASE-215)
// Real ledger routes (login check, role check, controller) run with mocked models.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, callRoute, newId } = require("./helpers/http");

const LedgerEntry = require("../models/LedgerEntry");
const FoodInventoryTransaction = require("../models/FoodInventoryTransaction");
const ledgerRoutes = require("../routes/ledgerRoutes");

afterEach(() => mock.restoreAll());

describe("Ledger: View Ledger Entries and Food Transactions", () => {
    test("CASE-213 | Description: Admin opens the ledger. | Expected: Latest entries are shown, newest first.", async () => {
        const find = mock.method(LedgerEntry, "find", () => query([{ _id: newId(), action: "foster_assignment_created" }]));

        const result = await callRoute(ledgerRoutes, "GET", "/?limit=5", { role: "admin" });

        assert.equal(result.status, 200);
        assert.equal(result.body.entries[0].action, "foster_assignment_created");
        assert.equal(find.mock.callCount(), 1);
    });

    test("CASE-214 | Description: Admin opens food transactions with an invalid inventory ID. | Expected: Request fails with error message.", async () => {
        const find = mock.method(FoodInventoryTransaction, "find", () => query([]));

        const result = await callRoute(ledgerRoutes, "GET", "/food-transactions?inventoryId=not-an-id", { role: "admin" });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /invalid inventory id/i);
        assert.equal(find.mock.callCount(), 0);
    });

    test("CASE-215 | Description: Staff opens the ledger. | Expected: Access is denied.", async () => {
        const find = mock.method(LedgerEntry, "find", () => query([]));

        const result = await callRoute(ledgerRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 403);
        assert.equal(find.mock.callCount(), 0);
    });
});
