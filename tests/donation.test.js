// Table 35 - Donation Management Module (CASE-111 to CASE-130)
// Real donation and needed-supply routes (login check, role check, controller) run with mocked models.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, fakeDocument, callRoute, newId, sentEmails } = require("./helpers/http");

const Donation = require("../models/Donations");
const NeededSupply = require("../models/NeededSupply");
const PaymentMethod = require("../models/PaymentMethods");
const User = require("../models/User");
const Notification = require("../models/Notifications");

const donationRoutes = require("../routes/donationRoutes");
const neededSuppliesRoutes = require("../routes/neededSuppliesRoutes");

afterEach(() => {
    mock.restoreAll();
    sentEmails.length = 0;
});

const PROOF = "https://img.test/proof.jpg";

function stubDonationCreate() {
    mock.method(PaymentMethod, "exists", async () => ({ _id: newId() }));
    mock.method(User, "findById", () => query({ _id: newId(), name: "Ana Adopter", username: "ana", email: "adopter@test.rescuebase", role: "adopter" }));
    mock.method(Notification, "create", async () => ({}));
    return mock.method(Donation, "create", async (data) => fakeDocument({ ...data }));
}

const cashDonation = (overrides = {}) => ({
    donorName: "Ana Adopter", donationType: "Money", amount: 500,
    paymentMethod: "GCash", paymentReference: "REF-123", proofOfPayment: PROOF, ...overrides,
});

describe("Table 35 - Donation Management: View Needed Supplies & Submit Donations", () => {
    test("CASE-111 | Description: Adopter opens the needed supplies list | Expected: 200; each item shows quantity needed (20) and received (5)", async () => {
        mock.method(NeededSupply, "find", () => query([{ _id: newId(), name: "Dog food", quantityNeeded: 20, quantityReceived: 5 }]));

        const result = await callRoute(neededSuppliesRoutes, "GET", "/", { role: "adopter" });

        assert.equal(result.status, 200);
        assert.equal(result.body.supplies[0].name, "Dog food");
        assert.equal(result.body.supplies[0].quantityNeeded, 20);
        assert.equal(result.body.supplies[0].quantityReceived, 5);
    });

    test("CASE-112 | Description: Adopter donates a listed supply item | Expected: 201; donation linked to that supply", async () => {
        const create = stubDonationCreate();
        const supplyId = newId();

        const result = await callRoute(donationRoutes, "POST", "/", {
            role: "adopter",
            body: { donorName: "Ana", donationType: "Food", itemName: "Dog food", quantity: 2, itemPhotoUrl: PROOF, neededSupplyId: supplyId },
        });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].neededSupplyId, supplyId);
    });

    test("CASE-113 | Description: Adopter donates cash with amount, reference and proof | Expected: 201; saved as pending with amount 500 and reference", async () => {
        const create = stubDonationCreate();

        const result = await callRoute(donationRoutes, "POST", "/", { role: "adopter", body: cashDonation() });

        assert.equal(result.status, 201);
        const saved = create.mock.calls[0].arguments[0];
        assert.equal(saved.status, "pending");
        assert.equal(saved.amount, 500);
        assert.equal(saved.paymentReference, "REF-123");
        assert.equal(saved.proofOfPayment, PROOF);
        assert.equal(sentEmails.some((mail) => mail.name === "sendDonationConfirmationEmail"), true);
    });

    test("CASE-114 | Description: Adopter donates cash with an invalid amount | Expected: 400 amount error; nothing saved", async () => {
        const create = stubDonationCreate();

        const negative = await callRoute(donationRoutes, "POST", "/", { role: "adopter", body: cashDonation({ amount: -50 }) });
        const text = await callRoute(donationRoutes, "POST", "/", { role: "adopter", body: cashDonation({ amount: "abc" }) });
        const tooBig = await callRoute(donationRoutes, "POST", "/", { role: "adopter", body: cashDonation({ amount: 999999 }) });

        for (const result of [negative, text, tooBig]) {
            assert.equal(result.status, 400);
            assert.match(result.body.message, /amount/i);
        }
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-115 | Description: Adopter donates cash without proof of payment | Expected: 400 'proof of payment is required'", async () => {
        const create = stubDonationCreate();

        const result = await callRoute(donationRoutes, "POST", "/", { role: "adopter", body: cashDonation({ proofOfPayment: "" }) });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /proof of payment is required/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-116 | Description: Adopter donates an item with name, quantity and photo | Expected: 201; saved as pending with quantity and photo", async () => {
        const create = stubDonationCreate();

        const result = await callRoute(donationRoutes, "POST", "/", {
            role: "adopter",
            body: { donorName: "Ana", donationType: "Food", itemName: "Dog food", quantity: 5, itemPhotoUrl: PROOF },
        });

        assert.equal(result.status, 201);
        const saved = create.mock.calls[0].arguments[0];
        assert.equal(saved.status, "pending");
        assert.equal(saved.quantity, 5);
        assert.equal(saved.itemPhotoUrl, PROOF);
    });

    test("CASE-117 | Description: Adopter donates an item with quantity 0 | Expected: 400; nothing saved", async () => {
        const create = stubDonationCreate();

        const result = await callRoute(donationRoutes, "POST", "/", {
            role: "adopter",
            body: { donorName: "Ana", donationType: "Food", itemName: "Dog food", quantity: 0, itemPhotoUrl: PROOF },
        });

        assert.equal(result.status, 400);
        assert.equal(create.mock.callCount(), 0);
    });
});

describe("Table 35 - Donation Management: View Donation History", () => {
    function stubHistory(donations) {
        mock.method(User, "findById", () => query({ _id: newId(), email: "adopter@test.rescuebase" }));
        return mock.method(Donation, "find", () => query(donations));
    }

    test("CASE-118 | Description: Donor opens their donation history | Expected: 200; own donations with status (pending, received)", async () => {
        const find = stubHistory([{ donationType: "Money", status: "pending" }, { donationType: "Food", status: "received" }]);

        const result = await callRoute(donationRoutes, "GET", "/my", { role: "adopter" });

        assert.equal(result.status, 200);
        assert.deepEqual(result.body.map((donation) => donation.status), ["pending", "received"]);
        assert.equal(find.mock.calls[0].arguments[0].donorEmail, "adopter@test.rescuebase");
    });

    test("CASE-119 | Description: Donor with no donations opens the history | Expected: 200; empty list", async () => {
        stubHistory([]);

        const result = await callRoute(donationRoutes, "GET", "/my", { role: "adopter" });

        assert.equal(result.status, 200);
        assert.deepEqual(result.body, []);
    });

    test("CASE-120 | Description: Donor opens the history after staff verified a donation | Expected: Status shows 'received'", async () => {
        stubHistory([{ donationType: "Money", status: "received" }]);

        const result = await callRoute(donationRoutes, "GET", "/my", { role: "adopter" });

        assert.equal(result.body[0].status, "received");
    });
});

describe("Table 35 - Donation Management: Verify Donations & Proof of Payment", () => {
    test("CASE-121 | Description: Staff opens the donation list | Expected: 200; donations with their proof of payment", async () => {
        mock.method(Donation, "find", () => query([{ _id: newId(), status: "pending", donationType: "Money", proofOfPayment: PROOF }]));

        const result = await callRoute(donationRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.donations[0].status, "pending");
        assert.equal(result.body.donations[0].proofOfPayment, PROOF);
    });

    test("CASE-122 | Description: Staff marks a donation as received | Expected: 200; status 'received'; supply received total goes up by 3", async () => {
        const supplyId = newId();
        const donation = { _id: newId(), status: "pending", quantity: 3, neededSupplyId: supplyId, donationType: "Food" };
        mock.method(Donation, "findById", async () => donation);
        const supplyUpdate = mock.method(NeededSupply, "findByIdAndUpdate", async () => ({ name: "Dog food" }));
        const update = mock.method(Donation, "findByIdAndUpdate", async () => ({ ...donation, status: "received" }));
        mock.method(User, "findOne", () => query(null));

        const result = await callRoute(donationRoutes, "PATCH", `/${donation._id}`, { role: "staff", body: { status: "received" } });

        assert.equal(result.status, 200);
        assert.equal(update.mock.calls[0].arguments[1].$set.status, "received");
        assert.ok(update.mock.calls[0].arguments[1].$set.receivedDate instanceof Date);
        assert.deepEqual(supplyUpdate.mock.calls[0].arguments[1], { $inc: { quantityReceived: 3 } });
    });

    test("CASE-123 | Description: Staff cancels a donation, first without then with a reason | Expected: 400 without a reason; 200 with one; donor notified 'Donation Not Received'", async () => {
        const donation = { _id: newId(), status: "pending", quantity: 1, donationType: "Money", amount: 500, donorEmail: "donor@test.rescuebase" };
        mock.method(Donation, "findById", async () => donation);
        mock.method(User, "findById", () => query({ name: "Staff Sam" }));
        mock.method(User, "findOne", () => query({ _id: newId(), role: "adopter" }));
        mock.method(Donation, "findByIdAndUpdate", async () => ({ ...donation, status: "cancelled", notReceivedReason: "Payment not found" }));
        const notification = mock.method(Notification, "create", async () => ({}));

        const noReason = await callRoute(donationRoutes, "PATCH", `/${donation._id}`, { role: "staff", body: { status: "cancelled" } });
        assert.equal(noReason.status, 400);

        const result = await callRoute(donationRoutes, "PATCH", `/${donation._id}`, {
            role: "staff", body: { status: "cancelled", notReceivedReason: "Payment not found" },
        });

        assert.equal(result.status, 200);
        assert.equal(result.body.donation.status, "cancelled");
        assert.equal(notification.mock.calls[0].arguments[0].title, "Donation Not Received");
    });

    test("CASE-124 | Description: Staff opens a donation record | Expected: Proof-of-payment image is included", async () => {
        mock.method(Donation, "find", () => query([{ _id: newId(), donationType: "Money", proofOfPayment: PROOF }]));

        const result = await callRoute(donationRoutes, "GET", "/", { role: "admin" });

        assert.equal(result.body.donations[0].proofOfPayment, PROOF);
    });
});

describe("Table 35 - Donation Management: Manage Needed Supplies & Delete Donation Records", () => {
    test("CASE-125 | Description: Admin adds a needed supply with valid details | Expected: 201; supply saved (Dog food, 20 needed)", async () => {
        const create = mock.method(NeededSupply, "create", async (data) => ({ _id: newId(), ...data }));

        const result = await callRoute(neededSuppliesRoutes, "POST", "/", {
            role: "admin", body: { name: "Dog food", category: "Food", quantityNeeded: 20 },
        });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].name, "Dog food");
        assert.equal(create.mock.calls[0].arguments[0].quantityNeeded, 20);
    });

    test("CASE-126 | Description: Admin adds a needed supply with an empty name | Expected: 400 'name is required'", async () => {
        const create = mock.method(NeededSupply, "create", async () => ({}));

        const result = await callRoute(neededSuppliesRoutes, "POST", "/", {
            role: "admin", body: { name: "", category: "Food", quantityNeeded: 20 },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /name is required/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-127 | Description: Admin edits the quantity needed | Expected: 200; quantity becomes 30", async () => {
        const supply = fakeDocument({ name: "Dog food", quantityNeeded: 10, quantityReceived: 2, status: "active" });
        mock.method(NeededSupply, "findById", async () => supply);

        const result = await callRoute(neededSuppliesRoutes, "PATCH", `/${supply._id}`, { role: "admin", body: { quantityNeeded: 30 } });

        assert.equal(result.status, 200);
        assert.equal(supply.quantityNeeded, 30);
        assert.equal(supply.savedTimes, 1);
    });

    test("CASE-128 | Description: Admin deletes a needed supply | Expected: 200; supply removed", async () => {
        const remove = mock.method(NeededSupply, "findByIdAndDelete", async () => ({ _id: newId() }));

        const result = await callRoute(neededSuppliesRoutes, "DELETE", `/${newId()}`, { role: "admin" });

        assert.equal(result.status, 200);
        assert.equal(remove.mock.callCount(), 1);
    });

    test("CASE-129 | Description: Admin deletes a pending donation record | Expected: 200; record removed", async () => {
        const donation = { _id: newId(), status: "pending" };
        mock.method(Donation, "findById", async () => donation);
        const remove = mock.method(Donation, "findByIdAndDelete", async () => donation);

        const result = await callRoute(donationRoutes, "DELETE", `/${donation._id}`, { role: "admin" });

        assert.equal(result.status, 200);
        assert.equal(remove.mock.callCount(), 1);
    });

    test("CASE-130 | Description: Staff and an adopter try to delete a donation record | Expected: Staff 200, record deleted; adopter 403, nothing deleted", async () => {
        const donation = { _id: newId(), status: "pending" };
        mock.method(Donation, "findById", async () => donation);
        const removeById = mock.method(Donation, "findByIdAndDelete", async () => donation);

        const adopterResult = await callRoute(donationRoutes, "DELETE", `/${donation._id}`, { role: "adopter" });
        assert.equal(adopterResult.status, 403);
        assert.equal(removeById.mock.callCount(), 0, "an adopter must not delete anything");

        const staffResult = await callRoute(donationRoutes, "DELETE", `/${donation._id}`, { role: "staff" });
        assert.equal(staffResult.status, 200);
        assert.equal(removeById.mock.callCount(), 1, "a pending donation is deleted for real");
    });
});
