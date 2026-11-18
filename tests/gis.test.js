// Table 35 - GIS Mapping Module (CASE-145 to CASE-158)
// Real GIS routes (login check, role check, controller) run with mocked models.
// The screen-only parts (drawing the map, sorting shelters by distance in the browser) cannot be run here:
// these tests check that the server sends the data the screen needs.
const { describe, test, afterEach } = require("node:test");
const assert = require("node:assert/strict");

const { mock, query, fakeDocument, callRoute, newId } = require("./helpers/http");

const GISLocation = require("../models/GISLocation");
const LostFoundReport = require("../models/LostFoundReport");
const Shelter = require("../models/Shelter");
const User = require("../models/User");

const gisRoutes = require("../routes/gisRoutes");

afterEach(() => mock.restoreAll());

function stubNoLostFoundPins() {
    mock.method(LostFoundReport, "find", () => query([]));
}

const SIGHTING = { petName: "Stray dog", species: "Dog", locationName: "Colon Street", latitude: 10.2926, longitude: 123.9026, description: "Brown dog near the market" };

describe("Table 35 - GIS Mapping: View GIS Map, Record Stray Sightings & Find the Nearest Shelter", () => {
    test("CASE-145 the GIS map loads with the plotted sightings", async () => {
        mock.method(GISLocation, "find", () => query([{ _id: newId(), reportType: "stray", status: "open", species: "dog", locationName: "Colon", latitude: 10.29, longitude: 123.9, description: "" }]));
        stubNoLostFoundPins();

        const result = await callRoute(gisRoutes, "GET", "/public", { role: "volunteer" });

        assert.equal(result.status, 200);
        assert.equal(result.body.locations.length, 1);
        assert.equal(result.body.locations[0].latitude, 10.29);
        assert.equal(result.body.locations[0].reportType, "stray");
    });

    test("CASE-146 a stray sighting with a pin and details is saved and open on the map", async () => {
        mock.method(User, "findById", () => query({ _id: newId(), name: "Vic Volunteer", email: "volunteer@test.rescuebase", role: "volunteer" }));
        const create = mock.method(GISLocation, "create", async (data) => ({ _id: newId(), ...data }));

        const result = await callRoute(gisRoutes, "POST", "/stray-sightings", { role: "volunteer", body: SIGHTING });

        assert.equal(result.status, 201);
        const saved = create.mock.calls[0].arguments[0];
        assert.equal(saved.reportType, "stray");
        assert.equal(saved.status, "open");
        assert.equal(saved.latitude, 10.2926);
        assert.equal(saved.longitude, 123.9026);
    });

    test("CASE-147 a sighting with the location name empty is refused with a message", async () => {
        const create = mock.method(GISLocation, "create", async () => ({}));

        const result = await callRoute(gisRoutes, "POST", "/stray-sightings", { role: "volunteer", body: { ...SIGHTING, locationName: "" } });

        assert.equal(result.status, 400);
        assert.match(result.body.message, /location name is required/i);
        assert.equal(create.mock.callCount(), 0);
    });

    test("CASE-148 a sighting with latitude or longitude out of range is refused", async () => {
        const create = mock.method(GISLocation, "create", async () => ({}));

        const badLatitude = await callRoute(gisRoutes, "POST", "/stray-sightings", { role: "volunteer", body: { ...SIGHTING, latitude: 95 } });
        const badLongitude = await callRoute(gisRoutes, "POST", "/stray-sightings", { role: "volunteer", body: { ...SIGHTING, longitude: 200 } });

        assert.equal(badLatitude.status, 400);
        assert.match(badLatitude.body.message, /invalid latitude/i);
        assert.equal(badLongitude.status, 400);
        assert.match(badLongitude.body.message, /invalid longitude/i);
        assert.equal(create.mock.callCount(), 0);
    });

    const SHELTERS = [
        { _id: newId(), name: "Cebu Animal Shelter", address: "Cebu City", latitude: 10.31, longitude: 123.89, contact: "0322223333", status: "active" },
        { _id: newId(), name: "Mactan Pound", address: "Lapu-Lapu City", latitude: 10.31, longitude: 123.97, contact: "0323334444", status: "active" },
    ];

    test("CASE-149 the shelter list returns only active shelters with their coordinates (the page sorts them by distance)", async () => {
        const find = mock.method(Shelter, "find", () => query(SHELTERS));

        const result = await callRoute(gisRoutes, "GET", "/shelters", { role: "adopter" });

        assert.equal(result.status, 200);
        assert.deepEqual(find.mock.calls[0].arguments[0], { status: "active" });
        assert.equal(result.body.shelters.every((shelter) => Number.isFinite(shelter.latitude) && Number.isFinite(shelter.longitude)), true);
    });

    test("CASE-150 the shelter list needs no location from the adopter, so manually typed coordinates can be used by the page", async () => {
        mock.method(Shelter, "find", () => query(SHELTERS));

        const result = await callRoute(gisRoutes, "GET", "/shelters", {});

        assert.equal(result.status, 200);
        assert.equal(result.body.shelters.length, 2);
    });

    test("CASE-151 a shelter in the list carries the details shown when it is selected", async () => {
        mock.method(Shelter, "find", () => query(SHELTERS));

        const result = await callRoute(gisRoutes, "GET", "/shelters", { role: "adopter" });

        const shelter = result.body.shelters[0];
        assert.equal(shelter.name, "Cebu Animal Shelter");
        assert.equal(shelter.address, "Cebu City");
        assert.equal(shelter.contact, "0322223333");
    });
});

describe("Table 35 - GIS Mapping: Edit, Resolve & Delete Sightings and Manage Shelters", () => {
    test("CASE-152 editing a stray sighting saves the updated values", async () => {
        const id = newId();
        const update = mock.method(GISLocation, "findByIdAndUpdate", async (_id, change) => ({ _id: id, ...change.$set }));

        const result = await callRoute(gisRoutes, "PATCH", `/${id}`, { role: "staff", body: { locationName: "Carbon Market", description: "Now near the fish stalls" } });

        assert.equal(result.status, 200);
        assert.equal(update.mock.calls[0].arguments[1].$set.locationName, "Carbon Market");
        assert.equal(result.body.location.description, "Now near the fish stalls");
    });

    test("CASE-153 marking a sighting as resolved changes its status to resolved", async () => {
        const location = fakeDocument({ status: "open" });
        mock.method(GISLocation, "findById", async () => location);

        const result = await callRoute(gisRoutes, "PATCH", `/${location._id}/resolve`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(location.status, "resolved");
        assert.equal(location.savedTimes, 1);
    });

    test("CASE-154 deleting a sighting removes it", async () => {
        const remove = mock.method(GISLocation, "findByIdAndDelete", async () => ({ _id: newId() }));

        const result = await callRoute(gisRoutes, "DELETE", `/${newId()}`, { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(remove.mock.callCount(), 1);
    });

    test("CASE-155 adding a shelter with name, address and coordinates saves it as active", async () => {
        const create = mock.method(Shelter, "create", async (data) => ({ _id: newId(), ...data }));

        const result = await callRoute(gisRoutes, "POST", "/shelters", {
            role: "staff", body: { name: "Cebu Animal Shelter", address: "Cebu City", latitude: 10.31, longitude: 123.89 },
        });

        assert.equal(result.status, 201);
        assert.equal(create.mock.calls[0].arguments[0].status, "active");
        assert.equal(create.mock.calls[0].arguments[0].name, "Cebu Animal Shelter");
    });

    test("CASE-156 setting a shelter to inactive removes it from the shelter list used for the nearest shelter", async () => {
        const update = mock.method(Shelter, "findByIdAndUpdate", async (_id, change) => ({ _id: newId(), ...change.$set }));

        const result = await callRoute(gisRoutes, "PATCH", `/shelters/${newId()}`, { role: "staff", body: { status: "inactive" } });

        assert.equal(result.status, 200);
        assert.equal(update.mock.calls[0].arguments[1].$set.status, "inactive");

        // the list the adopters use only asks for active shelters
        const find = mock.method(Shelter, "find", () => query([]));
        await callRoute(gisRoutes, "GET", "/shelters", {});
        assert.deepEqual(find.mock.calls[0].arguments[0], { status: "active" });
    });
});

describe("Table 35 - GIS Mapping: Generate Hotspot Analysis", () => {
    test("CASE-157 the hotspot analysis groups nearby sightings and returns each hotspot's location and count", async () => {
        const near = (latitude, longitude) => ({ latitude, longitude, reportType: "stray", locationName: "Colon, Cebu City" });
        mock.method(GISLocation, "find", () => query([
            near(10.2926, 123.9026), near(10.2930, 123.9028), near(10.2928, 123.9030), // three within 500 m
            { latitude: 10.5, longitude: 124.1, reportType: "stray", locationName: "Far away" },
        ]));
        stubNoLostFoundPins();

        const result = await callRoute(gisRoutes, "GET", "/hotspots", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.totalReports, 4);
        assert.equal(result.body.totalHotspots, 2);
        assert.equal(result.body.hotspots[0].count, 3);
        assert.equal(result.body.hotspots[0].areaName, "Colon");
        assert.ok(Number.isFinite(result.body.hotspots[0].latitude));
    });

    test("CASE-158 the hotspot analysis with no sightings returns an empty result without an error", async () => {
        mock.method(GISLocation, "find", () => query([]));
        stubNoLostFoundPins();

        const result = await callRoute(gisRoutes, "GET", "/hotspots", { role: "staff" });

        assert.equal(result.status, 200);
        assert.equal(result.body.totalReports, 0);
        assert.deepEqual(result.body.hotspots, []);
    });
});
