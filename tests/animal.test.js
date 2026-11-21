// Animal Management Module (CASE-035 to CASE-060)
// Routes, role checks and controllers run for real; the database, QR image library calls that need
// the network, and the Lost & Found listing hook are replaced.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, fakeDocument, callRoute, newId } = require("./helpers/http");

// animalController copies these two functions when it loads, so replace them first.
const lostFoundController = require("../controllers/lostFoundController");
lostFoundController.listShelterIntakeAsFoundReport = async () => {};
lostFoundController.removeShelterListing = async () => {};

const Animal = require("../models/Animal");
const User = require("../models/User");
const MedicalRecord = require("../models/MedicalRecord");
const VaccinationRecord = require("../models/VaccinationRecord");
const QRTag = require("../models/QRTag");
const AnimalTransfer = require("../models/AnimalTransfer");
const AdoptionApplication = require("../models/AdoptionApplication");
const FosterAssignment = require("../models/FosterAssignment");
const LostFoundReport = require("../models/LostFoundReport");

const animalRoutes = require("../routes/animalRoutes");
const medicalRecordRoutes = require("../routes/medicalRecordRoutes");
const vaccinationRoutes = require("../routes/vaccinationRoutes");
const qrTagRoutes = require("../routes/qrTagRoutes");
const animalTransferRoutes = require("../routes/animalTransferRoutes");

afterEach(() => {
    mock.restoreAll();
});

const ALL_EIGHT_SCORES = {
    energyLevel: 1, friendliness: 3, humanSociability: 5, animalSociability: 2,
    trainability: 5, anxietyLevel: 1, aggressionLevel: 1, activityLevel: 3,
};

function animalRow(overrides = {}) {
    return { _id: newId(), name: "Buddy", type: "Dog", intakeStatus: "approved", availabilityStatus: "available", adoptionStatus: "available", ...overrides };
}

function stubCreator(role = "staff") {
    mock.method(User, "findById", () => query({ _id: newId(), name: `Test ${role}`, username: role, email: `${role}@test.rescuebase`, role }));
}

describe("Animal Management: View Animal Profiles", () => {
    test("CASE-035 | Description: Staff opens the animal list. | Expected: Animals are listed with name, type and status.", async () => {
        mock.method(Animal, "find", () => query([animalRow({ name: "Buddy" }), animalRow({ name: "Mimi", type: "Cat" })]));

        const result = await callRoute(animalRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.animals.length, 2);
        for (const animal of result.body.animals) {
            assert.ok(animal.name && animal.type && animal.availabilityStatus);
        }
    });

    test("CASE-036 | Description: Volunteer filters the animal list by type. | Expected: Only that type is shown.", async () => {
        const find = mock.method(Animal, "find", () => query([animalRow({ type: "Cat" })]));

        const result = await callRoute(animalRoutes, "GET", "/?type=Cat", { role: "volunteer" });

        assert.equal(result.status, 200);
        assert.equal(find.mock.calls[0].arguments[0].type, "Cat");
        assert.deepEqual(result.body.animals.map((animal) => animal.type), ["Cat"]);
    });

    test("CASE-037 | Description: Staff opens an animal with all 8 behavior scores. | Expected: Details and personality tags are shown.", async () => {
        const animal = animalRow({ ...ALL_EIGHT_SCORES });
        mock.method(Animal, "findById", () => query(animal));

        const result = await callRoute(animalRoutes, "GET", `/${animal._id}`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.animal.name, "Buddy");
        assert.equal(result.body.animal.personality.status, "complete");
        assert.deepEqual(result.body.animal.personality.tags, ["Well-trained", "Gentle", "Calm", "Friendly"]);
    });

    test("CASE-038 | Description: Staff opens an animal with no behavior scores. | Expected: Animal is shown as unassessed with no tags.", async () => {
        const animal = animalRow();
        mock.method(Animal, "findById", () => query(animal));

        const result = await callRoute(animalRoutes, "GET", `/${animal._id}`, { role: "staff" });

        assert.equal(result.body.animal.personality.status, "unassessed");
        assert.deepEqual(result.body.animal.personality.tags, []);
    });
});

describe("Animal Management: Register Animal Intake & Review Volunteer Submissions", () => {
    test("CASE-039 | Description: Staff registers an animal intake with all required fields. | Expected: Animal record is created.", async () => {
        stubCreator("staff");
        const create = mock.method(Animal, "create", async (data) => fakeDocument(data));

        const result = await callRoute(animalRoutes, "POST", "/", {
            role: "staff",
            body: { name: "Rex", type: "Dog", age: 2 },
        });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].intakeStatus, "approved");
        assert.equal(result.body.animal.name, "Rex");
    });

    test("CASE-039 (volunteer) | Description: Volunteer registers an animal intake. | Expected: Intake is saved as pending review.", async () => {
        stubCreator("volunteer");
        const create = mock.method(Animal, "create", async (data) => fakeDocument(data));

        const result = await callRoute(animalRoutes, "POST", "/", { role: "volunteer", body: { name: "Rex", type: "Dog" } });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].intakeStatus, "pending_review");
    });

    test("CASE-040 | Description: Staff leaves the intake name or type empty. | Expected: Save fails with required field message.", async () => {
        const create = mock.method(Animal, "create", async (data) => fakeDocument(data));

        const noName = await callRoute(animalRoutes, "POST", "/", { role: "staff", body: { name: "", type: "Dog" } });
        const noType = await callRoute(animalRoutes, "POST", "/", { role: "staff", body: { name: "Rex", type: "" } });

        assert.equal(noName.status, 400);
        assert.deepEqual(noName.body.missingFields, ["name"]);
        assert.equal(noType.status, 400);
        assert.deepEqual(noType.body.missingFields, ["type"]);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-041 | Description: Staff opens the volunteer intake submissions. | Expected: Pending submissions are listed.", async () => {
        const find = mock.method(Animal, "find", () => query([animalRow({ intakeStatus: "pending_review" })]));

        const result = await callRoute(animalRoutes, "GET", "/intakes", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(find.mock.calls[0].arguments[0].intakeStatus, "pending_review");
        assert.equal(result.body.intakes.length, 1);
    });

    test("CASE-042 | Description: Staff approves a volunteer intake. | Expected: Intake is approved.", async () => {
        const animal = fakeDocument({ ...animalRow({ intakeStatus: "pending_review", availabilityStatus: "unavailable" }) });
        mock.method(Animal, "findById", () => query(animal));

        const result = await callRoute(animalRoutes, "PATCH", `/${animal._id}/approve-intake`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(animal.intakeStatus, "approved");
        assert.equal(animal.adoptionStatus, "available");
        assert.equal(animal.rejectionReason, "");
    });

    test("CASE-043 | Description: Staff rejects an intake without a reason. | Expected: Rejection is refused until a reason is entered.", async () => {
        const animal = fakeDocument({ ...animalRow({ intakeStatus: "pending_review" }) });
        mock.method(Animal, "findById", () => query(animal));

        const result = await callRoute(animalRoutes, "PATCH", `/${animal._id}/reject-intake`, { role: "staff", body: { reason: "  " } });

        assert.equal(result.status, 400);
        assert.equal(animal.intakeStatus, "pending_review");
        assert.equal(animal.savedTimes, 0);
    });

    test("CASE-044 | Description: Staff rejects an intake with a reason. | Expected: Intake is rejected and the reason is saved.", async () => {
        const animal = fakeDocument({ ...animalRow({ intakeStatus: "pending_review" }) });
        mock.method(Animal, "findById", () => query(animal));

        const result = await callRoute(animalRoutes, "PATCH", `/${animal._id}/reject-intake`, { role: "staff", body: { reason: "Photo is unclear" } });

        assert.equal(result.status, 200);
        assert.equal(animal.intakeStatus, "rejected");
        assert.equal(animal.rejectionReason, "Photo is unclear");
    });
});

describe("Animal Management: Edit Animal Profiles, Medical & Vaccination Records", () => {
    test("CASE-045 | Description: Staff edits an animal's details. | Expected: New values are saved.", async () => {
        const existing = animalRow({ name: "Buddy" });
        mock.method(Animal, "findById", () => query(existing));
        const update = mock.method(Animal, "findByIdAndUpdate", () => query({ ...existing, name: "Buddy Jr", age: 3 }));

        const result = await callRoute(animalRoutes, "PATCH", `/${existing._id}`, {
            role: "staff",
            body: { name: " Buddy Jr ", age: "3", intakeStatus: "rejected" },
        });

        assert.equal(result.status, 200);
        assert.deepEqual(update.mock.calls[0].arguments[1].$set, { name: "Buddy Jr", age: 3 }, "intakeStatus is not an editable field");
        assert.equal(result.body.animal.name, "Buddy Jr");
    });

    test("CASE-046 | Description: Staff clears the animal name and saves. | Expected: Save fails with required field message.", async () => {
        const validationError = new Animal({ name: "", type: "Dog" }).validateSync();
        assert.ok(validationError.errors.name, "name is required on the animal model");

        const existing = animalRow();
        mock.method(Animal, "findById", () => query(existing));
        mock.method(Animal, "findByIdAndUpdate", () => { throw validationError; });

        const result = await callRoute(animalRoutes, "PATCH", `/${existing._id}`, { role: "staff", body: { name: "" } });

        assert.equal(result.status, 400);
    });

    test("CASE-047 | Description: Staff adds a medical record. | Expected: Record is saved.", async () => {
        const animal = animalRow();
        mock.method(Animal, "findById", () => query(animal));
        const create = mock.method(MedicalRecord, "create", async (data) => ({ ...data, _id: newId(), populate: async () => {} }));

        const result = await callRoute(medicalRecordRoutes, "POST", "/", {
            role: "staff",
            body: { animal_id: animal._id, record_type: "Checkup", veterinarian: "Dr. Cruz", record_date: "2026-11-01", notes: "Healthy" },
        });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].record_type, "Checkup");
    });

    test("CASE-048 | Description: Staff adds a vaccination with a due date. | Expected: Record is saved with its due date.", async () => {
        const animal = animalRow();
        mock.method(Animal, "findById", () => query(animal));
        const create = mock.method(VaccinationRecord, "create", async (data) => ({ ...data, _id: newId(), populate: async () => {} }));

        const result = await callRoute(vaccinationRoutes, "POST", "/", {
            role: "staff",
            body: { animal_id: animal._id, vaccine_name: "Rabies", vaccination_date: "2026-11-01", next_due_date: "2026-11-20" },
        });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].next_due_date, "2026-11-20");

        mock.restoreAll();
        const find = mock.method(VaccinationRecord, "find", () => query([]));
        const due = await callRoute(vaccinationRoutes, "GET", "/due?days=3", { role: "staff" });
        assert.equal(due.status, 200);
        const filter = find.mock.calls[0].arguments[0].next_due_date;
        const windowDays = (filter.$lte - filter.$gte) / (24 * 60 * 60 * 1000);
        assert.ok(Math.abs(windowDays - 3) < 0.01, "only vaccinations due within the next 3 days are returned");
    });

    test("CASE-049 | Description: Staff saves a vaccination with an empty date. | Expected: Save fails with required field message.", async () => {
        const create = mock.method(VaccinationRecord, "create", async () => ({}));

        const result = await callRoute(vaccinationRoutes, "POST", "/", {
            role: "staff",
            body: { animal_id: newId(), vaccine_name: "Rabies", vaccination_date: "" },
        });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /vaccination date is required/i);
        assert.equal(create.mock.callCount(), 0);
    });
});

describe("Animal Management: Rate Behavioral Assessment & Generate QR Tags", () => {
    test("CASE-050 | Description: Staff rates all 8 behavior scores. | Expected: Scores are saved and personality tags are made.", async () => {
        const existing = animalRow();
        mock.method(Animal, "findById", () => query(existing));
        const update = mock.method(Animal, "findByIdAndUpdate", () => query({ ...existing, ...ALL_EIGHT_SCORES }));

        const result = await callRoute(animalRoutes, "PATCH", `/${existing._id}`, { role: "staff", body: ALL_EIGHT_SCORES });

        assert.equal(result.status, 200);
        assert.deepEqual(update.mock.calls[0].arguments[1].$set, ALL_EIGHT_SCORES);
        assert.equal(result.body.animal.personality.status, "complete");
        assert.deepEqual(result.body.animal.personality.tags, ["Well-trained", "Gentle", "Calm", "Friendly"]);
    });

    test("CASE-051 | Description: Staff enters a behavior score outside 1 to 5. | Expected: Score is rejected with error message.", async () => {
        const tooHigh = new Animal({ name: "Rex", type: "Dog", energyLevel: 6 }).validateSync();
        const tooLow = new Animal({ name: "Rex", type: "Dog", aggressionLevel: 0 }).validateSync();
        assert.ok(tooHigh.errors.energyLevel);
        assert.ok(tooLow.errors.aggressionLevel);

        const existing = animalRow();
        mock.method(Animal, "findById", () => query(existing));
        mock.method(Animal, "findByIdAndUpdate", () => { throw tooHigh; });

        const result = await callRoute(animalRoutes, "PATCH", `/${existing._id}`, { role: "staff", body: { energyLevel: 6 } });

        assert.equal(result.status, 400);
    });

    test("CASE-052 | Description: Staff generates a QR tag for an animal. | Expected: QR tag is saved.", async () => {
        const animal = animalRow();
        mock.method(Animal, "findById", () => query(animal));
        mock.method(QRTag, "findOne", () => query(null));
        const create = mock.method(QRTag, "create", async (data) => ({ ...data, populate: async () => {} }));

        const result = await callRoute(qrTagRoutes, "POST", "/generate", { role: "staff", body: { animalId: animal._id } });

        assert.equal(result.status, 201);
        const saved = create.mock.calls[0].arguments[0];
        assert.match(saved.tagCode, /^RB-\d+-[A-Z0-9]+$/);
        assert.match(saved.qrData, new RegExp(`/pet/${saved.tagCode}$`));
        assert.match(saved.qrImageUrl, /^data:image\/png;base64,/);
    });

    test("CASE-053 | Description: Staff generates a QR tag for an animal that has one. | Expected: A second tag is not created.", async () => {
        const animal = animalRow();
        mock.method(Animal, "findById", () => query(animal));
        mock.method(QRTag, "findOne", () => query({ _id: newId(), animal: animal._id }));
        const create = mock.method(QRTag, "create", async () => ({}));

        const result = await callRoute(qrTagRoutes, "POST", "/generate", { role: "staff", body: { animalId: animal._id } });

        assert.equal(result.status, 409);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-054 | Description: User looks up an animal by its tag code. | Expected: Public profile is shown.", async () => {
        const animal = animalRow({ name: "Buddy" });
        mock.method(QRTag, "findOne", () => query({ tagCode: "RB-1-ABC", animal }));

        const result = await callRoute(qrTagRoutes, "GET", "/lookup/RB-1-ABC", {});

        assert.equal(result.status, 200);
        assert.equal(result.body.animal.name, "Buddy");
    });
});

describe("Animal Management: Record Animal Transfers", () => {
    const transferBody = (overrides = {}) => ({
        animal_id: newId(), from_location: "Shelter", to_location: "Partner Rescue",
        transfer_date: "2026-11-10", reason: "Needs surgery", status: "Pending", ...overrides,
    });

    test("CASE-055 | Description: Staff records a transfer with all required details. | Expected: Transfer is saved.", async () => {
        mock.method(Animal, "findById", () => query(animalRow()));
        const create = mock.method(AnimalTransfer, "create", async (data) => ({ ...data, populate: async () => {} }));

        const result = await callRoute(animalTransferRoutes, "POST", "/", { role: "staff", body: transferBody() });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].to_location, "Partner Rescue");
    });

    test("CASE-056 | Description: Staff leaves the transfer location empty. | Expected: Save fails with required field message.", async () => {
        const create = mock.method(AnimalTransfer, "create", async () => ({}));

        const result = await callRoute(animalTransferRoutes, "POST", "/", { role: "staff", body: transferBody({ to_location: "" }) });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /to location is required/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-057 | Description: Staff opens the transfer history. | Expected: Transfers are listed.", async () => {
        mock.method(AnimalTransfer, "find", () => query([{ _id: newId(), to_location: "Partner Rescue" }]));

        const result = await callRoute(animalTransferRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.transfers.length, 1);
    });
});

describe("Animal Management: Delete Animal Records", () => {
    function stubDeleteChecks({ openApplications = 0 } = {}) {
        mock.method(Animal, "findById", () => query({ _id: newId(), name: "Buddy" }));
        mock.method(AdoptionApplication, "countDocuments", async () => openApplications);
        mock.method(FosterAssignment, "exists", async () => null);
        mock.method(LostFoundReport, "exists", async () => null);
        return mock.method(Animal, "findByIdAndDelete", async () => ({}));
    }

    test("CASE-058 | Description: Admin deletes an animal with no open application. | Expected: Animal is removed.", async () => {
        const remove = stubDeleteChecks({ openApplications: 0 });

        const result = await callRoute(animalRoutes, "DELETE", `/${newId()}`, { role: "admin" });

        assert.equal(result.status, 200);
        assert.equal(remove.mock.callCount(), 1);
    });

    test("CASE-059 | Description: Admin deletes an animal with an open application. | Expected: Deletion is refused.", async () => {
        const remove = stubDeleteChecks({ openApplications: 1 });

        const result = await callRoute(animalRoutes, "DELETE", `/${newId()}`, { role: "admin" });

        assert.equal(result.status, 409);
        assert.match(result.body.message, /open adoption application/i);
        assert.equal(remove.mock.callCount(), 0);
    });

    test("CASE-060 | Description: Staff tries to delete an animal. | Expected: Access is denied.", async () => {
        const remove = stubDeleteChecks();

        const result = await callRoute(animalRoutes, "DELETE", `/${newId()}`, { role: "staff" });

        assert.equal(result.status, 403);
        assert.equal(remove.mock.callCount(), 0);
    });
});
