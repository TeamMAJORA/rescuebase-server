// Table 35 - Animal Management Module (CASE-035 to CASE-060)
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

describe("Table 35 - Animal Management: View Animal Profiles", () => {
    test("CASE-035 staff opening the animal list gets each animal with name, type and status", async () => {
        mock.method(Animal, "find", () => query([animalRow({ name: "Buddy" }), animalRow({ name: "Mimi", type: "Cat" })]));

        const result = await callRoute(animalRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.animals.length, 2);
        for (const animal of result.body.animals) {
            assert.ok(animal.name && animal.type && animal.availabilityStatus);
        }
    });

    test("CASE-036 filtering the list by type asks the database for that type only", async () => {
        const find = mock.method(Animal, "find", () => query([animalRow({ type: "Cat" })]));

        const result = await callRoute(animalRoutes, "GET", "/?type=Cat", { role: "volunteer" });

        assert.equal(result.status, 200);
        assert.equal(find.mock.calls[0].arguments[0].type, "Cat");
        assert.deepEqual(result.body.animals.map((animal) => animal.type), ["Cat"]);
    });

    test("CASE-037 the profile of an animal with all 8 behavior scores shows its details and personality tags", async () => {
        const animal = animalRow({ ...ALL_EIGHT_SCORES });
        mock.method(Animal, "findById", () => query(animal));

        const result = await callRoute(animalRoutes, "GET", `/${animal._id}`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.animal.name, "Buddy");
        assert.equal(result.body.animal.personality.status, "complete");
        assert.deepEqual(result.body.animal.personality.tags, ["Well-trained", "Gentle", "Calm", "Friendly"]);
    });

    test("CASE-038 the profile of an animal with no behavior scores shows it as unassessed with no tags", async () => {
        const animal = animalRow();
        mock.method(Animal, "findById", () => query(animal));

        const result = await callRoute(animalRoutes, "GET", `/${animal._id}`, { role: "staff" });

        assert.equal(result.body.animal.personality.status, "unassessed");
        assert.deepEqual(result.body.animal.personality.tags, []);
    });
});

describe("Table 35 - Animal Management: Register Animal Intake & Review Volunteer Submissions", () => {
    test("CASE-039 staff registering an intake with the required fields creates an approved animal record", async () => {
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

    test("CASE-039 (volunteer) a volunteer's intake is saved as pending review", async () => {
        stubCreator("volunteer");
        const create = mock.method(Animal, "create", async (data) => fakeDocument(data));

        const result = await callRoute(animalRoutes, "POST", "/", { role: "volunteer", body: { name: "Rex", type: "Dog" } });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].intakeStatus, "pending_review");
    });

    test("CASE-040 an intake with the name or type left empty is refused and nothing is saved", async () => {
        const create = mock.method(Animal, "create", async (data) => fakeDocument(data));

        const noName = await callRoute(animalRoutes, "POST", "/", { role: "staff", body: { name: "", type: "Dog" } });
        const noType = await callRoute(animalRoutes, "POST", "/", { role: "staff", body: { name: "Rex", type: "" } });

        assert.equal(noName.status, 400);
        assert.deepEqual(noName.body.missingFields, ["name"]);
        assert.equal(noType.status, 400);
        assert.deepEqual(noType.body.missingFields, ["type"]);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-041 staff opening the volunteer intake submissions get the pending-review animals", async () => {
        const find = mock.method(Animal, "find", () => query([animalRow({ intakeStatus: "pending_review" })]));

        const result = await callRoute(animalRoutes, "GET", "/intakes", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(find.mock.calls[0].arguments[0].intakeStatus, "pending_review");
        assert.equal(result.body.intakes.length, 1);
    });

    test("CASE-042 approving a volunteer intake marks it approved and ready for staff to list for adoption", async () => {
        const animal = fakeDocument({ ...animalRow({ intakeStatus: "pending_review", availabilityStatus: "unavailable" }) });
        mock.method(Animal, "findById", () => query(animal));

        const result = await callRoute(animalRoutes, "PATCH", `/${animal._id}/approve-intake`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(animal.intakeStatus, "approved");
        assert.equal(animal.adoptionStatus, "available");
        assert.equal(animal.rejectionReason, "");
    });

    test("CASE-043 rejecting a volunteer intake without a reason is refused", async () => {
        const animal = fakeDocument({ ...animalRow({ intakeStatus: "pending_review" }) });
        mock.method(Animal, "findById", () => query(animal));

        const result = await callRoute(animalRoutes, "PATCH", `/${animal._id}/reject-intake`, { role: "staff", body: { reason: "  " } });

        assert.equal(result.status, 400);
        assert.equal(animal.intakeStatus, "pending_review");
        assert.equal(animal.savedTimes, 0);
    });

    test("CASE-044 rejecting a volunteer intake with a reason saves the reason", async () => {
        const animal = fakeDocument({ ...animalRow({ intakeStatus: "pending_review" }) });
        mock.method(Animal, "findById", () => query(animal));

        const result = await callRoute(animalRoutes, "PATCH", `/${animal._id}/reject-intake`, { role: "staff", body: { reason: "Photo is unclear" } });

        assert.equal(result.status, 200);
        assert.equal(animal.intakeStatus, "rejected");
        assert.equal(animal.rejectionReason, "Photo is unclear");
    });
});

describe("Table 35 - Animal Management: Edit Animal Profiles, Medical & Vaccination Records", () => {
    test("CASE-045 staff editing an animal's details saves only the allowed fields and returns the new values", async () => {
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

    test("CASE-046 the animal model refuses an empty name, and the route turns that into a 400", async () => {
        const validationError = new Animal({ name: "", type: "Dog" }).validateSync();
        assert.ok(validationError.errors.name, "name is required on the animal model");

        const existing = animalRow();
        mock.method(Animal, "findById", () => query(existing));
        mock.method(Animal, "findByIdAndUpdate", () => { throw validationError; });

        const result = await callRoute(animalRoutes, "PATCH", `/${existing._id}`, { role: "staff", body: { name: "" } });

        assert.equal(result.status, 400);
    });

    test("CASE-047 staff adding a medical record saves it for an existing animal", async () => {
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

    test("CASE-048 a vaccination record with a due date is saved, and the due-soon list asks for dates within the window", async () => {
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

    test("CASE-049 saving a vaccination record with an empty date is refused", async () => {
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

describe("Table 35 - Animal Management: Rate Behavioral Assessment & Generate QR Tags", () => {
    test("CASE-050 rating all 8 behavior scores saves them and the profile returns generated personality tags", async () => {
        const existing = animalRow();
        mock.method(Animal, "findById", () => query(existing));
        const update = mock.method(Animal, "findByIdAndUpdate", () => query({ ...existing, ...ALL_EIGHT_SCORES }));

        const result = await callRoute(animalRoutes, "PATCH", `/${existing._id}`, { role: "staff", body: ALL_EIGHT_SCORES });

        assert.equal(result.status, 200);
        assert.deepEqual(update.mock.calls[0].arguments[1].$set, ALL_EIGHT_SCORES);
        assert.equal(result.body.animal.personality.status, "complete");
        assert.deepEqual(result.body.animal.personality.tags, ["Well-trained", "Gentle", "Calm", "Friendly"]);
    });

    test("CASE-051 a behavior score outside 1 to 5 is refused by the animal model and returns a 400", async () => {
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

    test("CASE-052 generating a QR tag saves a tag whose QR link opens the public pet page", async () => {
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

    test("CASE-053 generating a QR tag for an animal that already has one is refused", async () => {
        const animal = animalRow();
        mock.method(Animal, "findById", () => query(animal));
        mock.method(QRTag, "findOne", () => query({ _id: newId(), animal: animal._id }));
        const create = mock.method(QRTag, "create", async () => ({}));

        const result = await callRoute(qrTagRoutes, "POST", "/generate", { role: "staff", body: { animalId: animal._id } });

        assert.equal(result.status, 409);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-054 looking up a tag code without logging in returns the animal's public profile", async () => {
        const animal = animalRow({ name: "Buddy" });
        mock.method(QRTag, "findOne", () => query({ tagCode: "RB-1-ABC", animal }));

        const result = await callRoute(qrTagRoutes, "GET", "/lookup/RB-1-ABC", {});

        assert.equal(result.status, 200);
        assert.equal(result.body.animal.name, "Buddy");
    });
});

describe("Table 35 - Animal Management: Record Animal Transfers", () => {
    const transferBody = (overrides = {}) => ({
        animal_id: newId(), from_location: "Shelter", to_location: "Partner Rescue",
        transfer_date: "2026-11-10", reason: "Needs surgery", status: "Pending", ...overrides,
    });

    test("CASE-055 recording a transfer with all required details saves it", async () => {
        mock.method(Animal, "findById", () => query(animalRow()));
        const create = mock.method(AnimalTransfer, "create", async (data) => ({ ...data, populate: async () => {} }));

        const result = await callRoute(animalTransferRoutes, "POST", "/", { role: "staff", body: transferBody() });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].to_location, "Partner Rescue");
    });

    test("CASE-056 a transfer with a required field empty is refused", async () => {
        const create = mock.method(AnimalTransfer, "create", async () => ({}));

        const result = await callRoute(animalTransferRoutes, "POST", "/", { role: "staff", body: transferBody({ to_location: "" }) });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /to location is required/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-057 staff viewing the transfer history gets the recorded transfers", async () => {
        mock.method(AnimalTransfer, "find", () => query([{ _id: newId(), to_location: "Partner Rescue" }]));

        const result = await callRoute(animalTransferRoutes, "GET", "/", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.transfers.length, 1);
    });
});

describe("Table 35 - Animal Management: Delete Animal Records", () => {
    function stubDeleteChecks({ openApplications = 0 } = {}) {
        mock.method(Animal, "findById", () => query({ _id: newId(), name: "Buddy" }));
        mock.method(AdoptionApplication, "countDocuments", async () => openApplications);
        mock.method(FosterAssignment, "exists", async () => null);
        mock.method(LostFoundReport, "exists", async () => null);
        return mock.method(Animal, "findByIdAndDelete", async () => ({}));
    }

    test("CASE-058 the admin deleting an animal with no open adoption application removes the record", async () => {
        const remove = stubDeleteChecks({ openApplications: 0 });

        const result = await callRoute(animalRoutes, "DELETE", `/${newId()}`, { role: "admin" });

        assert.equal(result.status, 200);
        assert.equal(remove.mock.callCount(), 1);
    });

    test("CASE-059 deleting an animal that has an open adoption application is refused and the animal is kept", async () => {
        const remove = stubDeleteChecks({ openApplications: 1 });

        const result = await callRoute(animalRoutes, "DELETE", `/${newId()}`, { role: "admin" });

        assert.equal(result.status, 409);
        assert.match(result.body.message, /open adoption application/i);
        assert.equal(remove.mock.callCount(), 0);
    });

    test("CASE-060 staff trying to delete an animal record is denied", async () => {
        const remove = stubDeleteChecks();

        const result = await callRoute(animalRoutes, "DELETE", `/${newId()}`, { role: "staff" });

        assert.equal(result.status, 403);
        assert.equal(remove.mock.callCount(), 0);
    });
});
