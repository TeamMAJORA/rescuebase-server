// Food Inventory (Food Storage) Module (CASE-195 to CASE-205)
// Real food inventory routes (router-wide login and role check, controller) run with mocked models.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, fakeDocument, callRoute, newId } = require("./helpers/http");

const FoodInventory = require("../models/FoodInventory");
const NeededSupply = require("../models/NeededSupply");

const foodRoutes = require("../routes/foodInventoryRoutes");

afterEach(() => mock.restoreAll());

const NEW_FOOD = { name: "Dog kibble", quantityInStock: 20, unit: "kg", foodRatePerAnimalPerDay: 0.5, forecastDays: 30, forAnimals: "Dog" };

function foodItem(overrides = {}) {
    return fakeDocument({ name: "Dog kibble", quantityInStock: 20, unit: "kg", adjustmentHistory: [], ...overrides });
}

describe("Food Inventory: View, Add and Edit Food Items", () => {
    test("CASE-195 | Description: Staff opens food storage. | Expected: Items are listed with stock in kg.", async () => {
        mock.method(FoodInventory, "find", () => query([{ _id: newId(), name: "Dog kibble", quantityInStock: 20, unit: "kg" }]));

        const result = await callRoute(foodRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.inventory[0].quantityInStock, 20);
        assert.equal(result.body.inventory[0].unit, "kg");
    });

    test("CASE-196 | Description: Staff adds a food item with valid details. | Expected: Item is saved in kg.", async () => {
        const create = mock.method(FoodInventory, "create", async (data) => ({ _id: newId(), ...data }));

        const result = await callRoute(foodRoutes, "POST", "/", { role: "staff", body: NEW_FOOD });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].name, "Dog kibble");
        assert.equal(create.mock.calls[0].arguments[0].unit, "kg");
        assert.equal(create.mock.calls[0].arguments[0].quantityInStock, 20);
    });

    test("CASE-197 | Description: Staff adds a food item with an empty name. | Expected: Save fails with required field message.", async () => {
        const create = mock.method(FoodInventory, "create", async () => ({}));

        const result = await callRoute(foodRoutes, "POST", "/", { role: "staff", body: { ...NEW_FOOD, name: "  " } });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /name is required/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-198 | Description: Staff adds a food item with a negative or too large stock. | Expected: Save fails with error message.", async () => {
        const create = mock.method(FoodInventory, "create", async () => ({}));

        for (const stock of [-5, 999999, "abc"]) {
            const result = await callRoute(foodRoutes, "POST", "/", { role: "staff", body: { ...NEW_FOOD, quantityInStock: stock } });
            assert.equal(result.status, 400);
            assert.match(result.body.message, /valid stock/i);
        }
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-199 | Description: Staff adds a food item whose name already exists. | Expected: Save fails with already exists message.", async () => {
        mock.method(FoodInventory, "create", async () => { throw Object.assign(new Error("duplicate"), { code: 11000 }); });

        const result = await callRoute(foodRoutes, "POST", "/", { role: "staff", body: NEW_FOOD });

        assert.equal(result.status, 409);
        assert.match(result.body.message, /already exists/i);
    });
});

describe("Food Inventory: Adjust Stock, View History and Delete", () => {
    test("CASE-200 | Description: Staff adds stock to a food item. | Expected: Stock goes up and the change is recorded.", async () => {
        const item = foodItem({ quantityInStock: 30 });
        const update = mock.method(FoodInventory, "findOneAndUpdate", async () => item);

        const result = await callRoute(foodRoutes, "POST", `/${item._id}/adjust`, { role: "staff", body: { action: "add", quantity: 10, reason: "Purchase" } });

        assert.equal(result.status, 200);
        assert.deepEqual(update.mock.calls[0].arguments[1], { $inc: { quantityInStock: 10 } });
        assert.equal(item.adjustmentHistory.length, 1);
        assert.equal(item.adjustmentHistory[0].previousStock, 20);
        assert.equal(item.adjustmentHistory[0].newStock, 30);
        assert.equal(item.savedTimes, 1);
    });

    test("CASE-201 | Description: Staff removes more stock than available. | Expected: Removal fails with insufficient stock message.", async () => {
        mock.method(FoodInventory, "findOneAndUpdate", async () => null);
        mock.method(FoodInventory, "exists", async () => ({ _id: newId() }));

        const result = await callRoute(foodRoutes, "POST", `/${newId()}/adjust`, { role: "staff", body: { action: "remove", quantity: 500 } });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /insufficient stock/i);
    });

    test("CASE-202 | Description: Staff adds stock as a delivery or donation. | Expected: Amount is counted toward the needed supply.", async () => {
        const item = foodItem({ quantityInStock: 30 });
        mock.method(FoodInventory, "findOneAndUpdate", async () => item);
        const supply = fakeDocument({ name: "Dog kibble", quantityNeeded: 50, quantityReceived: 10, status: "active" });
        mock.method(NeededSupply, "findOne", () => query(supply));

        const result = await callRoute(foodRoutes, "POST", `/${item._id}/adjust`, { role: "staff", body: { action: "add", quantity: 10, reason: "Delivery / Donation" } });

        assert.equal(result.status, 200);
        assert.equal(supply.quantityReceived, 20);
        assert.equal(result.body.supplyUpdate.counted, 10);
    });

    test("CASE-203 | Description: Staff opens a food item's history. | Expected: Changes are listed, newest first.", async () => {
        const item = foodItem({ adjustmentHistory: [{ action: "add", quantity: 5 }, { action: "remove", quantity: 2 }] });
        mock.method(FoodInventory, "findById", () => query(item));

        const result = await callRoute(foodRoutes, "GET", `/${item._id}/history`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.deepEqual(result.body.history.map((change) => change.action), ["remove", "add"]);
    });

    test("CASE-204 | Description: Staff deletes a food item. | Expected: Item is removed.", async () => {
        const id = newId();
        mock.method(FoodInventory, "findByIdAndDelete", async () => ({ _id: id, name: "Dog kibble" }));
        const unlink = mock.method(NeededSupply, "updateMany", async () => ({}));

        const result = await callRoute(foodRoutes, "DELETE", `/${id}`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.deepEqual(unlink.mock.calls[0].arguments[1], { $set: { foodInventoryId: null } });
    });

    test("CASE-205 | Description: Adopter opens food storage. | Expected: Access is denied.", async () => {
        const find = mock.method(FoodInventory, "find", () => query([]));

        const result = await callRoute(foodRoutes, "GET", "/", { role: "adopter" });

        assert.equal(result.status, 403);
        assert.equal(find.mock.callCount(), 0);
    });
});
