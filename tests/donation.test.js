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
    test("CASE-111 the needed supplies list shows each item with the quantity needed and received", async () => {
        mock.method(NeededSupply, "find", () => query([{ _id: newId(), name: "Dog food", quantityNeeded: 20, quantityReceived: 5 }]));

        const result = await callRoute(neededSuppliesRoutes, "GET", "/", { role: "adopter" });

        assert.equal(result.status, 200);
        assert.equal(result.body.supplies[0].name, "Dog food");
        assert.equal(result.body.supplies[0].quantityNeeded, 20);
        assert.equal(result.body.supplies[0].quantityReceived, 5);
    });

    test("CASE-112 donating a listed item saves the donation linked to that supply", async () => {
        const create = stubDonationCreate();
        const supplyId = newId();

        const result = await callRoute(donationRoutes, "POST", "/", {
            role: "adopter",
            body: { donorName: "Ana", donationType: "Food", itemName: "Dog food", quantity: 2, itemPhotoUrl: PROOF, neededSupplyId: supplyId },
        });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].neededSupplyId, supplyId);
    });

    test("CASE-113 a cash donation with an amount, reference and proof of payment is saved as pending", async () => {
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

    test("CASE-114 a cash donation with an invalid amount is refused", async () => {
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

    test("CASE-115 a cash donation without proof of payment is refused with a required-field message", async () => {
        const create = stubDonationCreate();

        const result = await callRoute(donationRoutes, "POST", "/", { role: "adopter", body: cashDonation({ proofOfPayment: "" }) });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /proof of payment is required/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-116 an in-kind donation with item name, quantity and photo is saved as pending", async () => {
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

    test("CASE-117 an in-kind donation with a quantity of 0 is refused", async () => {
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

    test("CASE-118 the donation history lists the donor's donations with a status", async () => {
        const find = stubHistory([{ donationType: "Money", status: "pending" }, { donationType: "Food", status: "received" }]);

        const result = await callRoute(donationRoutes, "GET", "/my", { role: "adopter" });

        assert.equal(result.status, 200);
        assert.deepEqual(result.body.map((donation) => donation.status), ["pending", "received"]);
        assert.equal(find.mock.calls[0].arguments[0].donorEmail, "adopter@test.rescuebase");
    });

    test("CASE-119 a donor with no donations gets an empty list (the screen shows the empty message)", async () => {
        stubHistory([]);

        const result = await callRoute(donationRoutes, "GET", "/my", { role: "adopter" });

        assert.equal(result.status, 200);
        assert.deepEqual(result.body, []);
    });

    test("CASE-120 after staff verified a donation the history returns the updated status", async () => {
        stubHistory([{ donationType: "Money", status: "received" }]);

        const result = await callRoute(donationRoutes, "GET", "/my", { role: "adopter" });

        assert.equal(result.body[0].status, "received");
    });
});

describe("Table 35 - Donation Management: Verify Donations & Proof of Payment", () => {
    test("CASE-121 staff open the donation list with each donation's proof of payment", async () => {
        mock.method(Donation, "find", () => query([{ _id: newId(), status: "pending", donationType: "Money", proofOfPayment: PROOF }]));

        const result = await callRoute(donationRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.donations[0].status, "pending");
        assert.equal(result.body.donations[0].proofOfPayment, PROOF);
    });

    test("CASE-122 marking a donation as received changes its status and adds it to the supply totals", async () => {
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

    test("CASE-123 marking a donation as cancelled changes its status and notifies the donor with the reason", async () => {
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

    test("CASE-124 the donation record carries the proof-of-payment image for staff to open", async () => {
        mock.method(Donation, "find", () => query([{ _id: newId(), donationType: "Money", proofOfPayment: PROOF }]));

        const result = await callRoute(donationRoutes, "GET", "/", { role: "admin" });

        assert.equal(result.body.donations[0].proofOfPayment, PROOF);
    });
});

describe("Table 35 - Donation Management: Manage Needed Supplies & Delete Donation Records", () => {
    test("CASE-125 an admin adds a needed supply with valid details and it is saved", async () => {
        const create = mock.method(NeededSupply, "create", async (data) => ({ _id: newId(), ...data }));

        const result = await callRoute(neededSuppliesRoutes, "POST", "/", {
            role: "admin", body: { name: "Dog food", category: "Food", quantityNeeded: 20 },
        });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].name, "Dog food");
        assert.equal(create.mock.calls[0].arguments[0].quantityNeeded, 20);
    });

    test("CASE-126 a needed supply with an empty name is refused with a required-field message", async () => {
        const create = mock.method(NeededSupply, "create", async () => ({}));

        const result = await callRoute(neededSuppliesRoutes, "POST", "/", {
            role: "admin", body: { name: "", category: "Food", quantityNeeded: 20 },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /name is required/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-127 editing the quantity needed saves the new quantity", async () => {
        const supply = fakeDocument({ name: "Dog food", quantityNeeded: 10, quantityReceived: 2, status: "active" });
        mock.method(NeededSupply, "findById", async () => supply);

        const result = await callRoute(neededSuppliesRoutes, "PATCH", `/${supply._id}`, { role: "admin", body: { quantityNeeded: 30 } });

        assert.equal(result.status, 200);
        assert.equal(supply.quantityNeeded, 30);
        assert.equal(supply.savedTimes, 1);
    });

    test("CASE-128 an admin deletes a needed supply and it is removed", async () => {
        const remove = mock.method(NeededSupply, "findByIdAndDelete", async () => ({ _id: newId() }));

        const result = await callRoute(neededSuppliesRoutes, "DELETE", `/${newId()}`, { role: "admin" });

        assert.equal(result.status, 200);
        assert.equal(remove.mock.callCount(), 1);
    });

    test("CASE-129 an admin deletes a pending donation record and it is removed", async () => {
        const donation = { _id: newId(), status: "pending" };
        mock.method(Donation, "findById", async () => donation);
        const remove = mock.method(Donation, "findByIdAndDelete", async () => donation);

        const result = await callRoute(donationRoutes, "DELETE", `/${donation._id}`, { role: "admin" });

        assert.equal(result.status, 200);
        assert.equal(remove.mock.callCount(), 1);
    });

    test("CASE-130 staff cannot delete a donation record", async () => {
        const donation = { _id: newId(), status: "pending" };
        mock.method(Donation, "findById", async () => donation);
        const remove = mock.method(Donation, "findByIdAndDelete", async () => donation);

        const result = await callRoute(donationRoutes, "DELETE", `/${donation._id}`, { role: "staff" });

        assert.equal(result.status, 403);
        assert.equal(remove.mock.callCount(), 0);
    });
});
