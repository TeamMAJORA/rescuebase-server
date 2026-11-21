// Payment Methods Module (CASE-206 to CASE-212)
// Real payment method routes (login check, role check, controller) run with mocked models.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, callRoute, newId } = require("./helpers/http");

const PaymentMethod = require("../models/PaymentMethods");
const paymentRoutes = require("../routes/paymentMethodRoutes");

afterEach(() => mock.restoreAll());

const GCASH = { method_type: "GCash", account_name: "RescueBase Shelter", account_number: "09171234567", instructions: "Send the exact amount" };

describe("Payment Methods: View and Manage Payment Methods", () => {
    test("CASE-206 | Description: Adopter opens the payment methods | Expected: 200; only active methods (GCash first)", async () => {
        const find = mock.method(PaymentMethod, "find", () => query([{ method_type: "GCash", is_active: true }]));

        const result = await callRoute(paymentRoutes, "GET", "/", { role: "adopter" });

        assert.equal(result.status, 200);
        assert.deepEqual(find.mock.calls[0].arguments[0], { is_active: true });
        assert.equal(result.body.methods[0].method_type, "GCash");
    });

    test("CASE-207 | Description: Staff adds a payment method with valid details | Expected: 201; saved as active; an adopter gets 403", async () => {
        const create = mock.method(PaymentMethod, "create", async (data) => ({ _id: newId(), ...data }));

        const result = await callRoute(paymentRoutes, "POST", "/", { role: "staff", body: GCASH });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].is_active, true);
        assert.equal(create.mock.calls[0].arguments[0].account_number, "09171234567");

        const adopter = await callRoute(paymentRoutes, "POST", "/", { role: "adopter", body: GCASH });
        assert.equal(adopter.status, 403);
    });

    test("CASE-208 | Description: Staff adds a payment method without an account number | Expected: 400 'required'; nothing saved", async () => {
        const create = mock.method(PaymentMethod, "create", async () => ({}));

        const result = await callRoute(paymentRoutes, "POST", "/", { role: "staff", body: { ...GCASH, account_number: " " } });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /required/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-209 | Description: Staff adds an unsupported payment type | Expected: 400 'GCash, Maya, Bank Account'; nothing saved", async () => {
        const create = mock.method(PaymentMethod, "create", async () => ({}));

        const result = await callRoute(paymentRoutes, "POST", "/", { role: "staff", body: { ...GCASH, method_type: "Bitcoin" } });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /GCash, Maya, Bank Account/);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-210 | Description: Staff turns a payment method off | Expected: 200; saved as inactive", async () => {
        const update = mock.method(PaymentMethod, "findByIdAndUpdate", async (_id, changes) => ({ _id: newId(), ...changes }));

        const result = await callRoute(paymentRoutes, "PATCH", `/${newId()}`, { role: "staff", body: { is_active: false } });

        assert.equal(result.status, 200);
        assert.equal(update.mock.calls[0].arguments[1].is_active, false);
        assert.equal(result.body.method.is_active, false);
    });

    test("CASE-211 | Description: Staff deletes a payment method | Expected: 200; removed", async () => {
        const remove = mock.method(PaymentMethod, "findByIdAndDelete", async () => ({ _id: newId() }));

        const result = await callRoute(paymentRoutes, "DELETE", `/${newId()}`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(remove.mock.callCount(), 1);
    });

    test("CASE-212 | Description: Anyone opens the public payment method list | Expected: 200 without login; only active methods", async () => {
        const find = mock.method(PaymentMethod, "find", () => query([{ method_type: "Maya", account_name: "RescueBase", account_number: "0917" }]));

        const result = await callRoute(paymentRoutes, "GET", "/public", {});

        assert.equal(result.status, 200);
        assert.deepEqual(find.mock.calls[0].arguments[0], { is_active: true });
        assert.equal(result.body.methods.length, 1);
    });
});
