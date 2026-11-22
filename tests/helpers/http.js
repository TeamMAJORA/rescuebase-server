// Shared helpers for the unit tests. No database, network or email is used:
// models and services are replaced with mock.method in each test.
const { mock } = require("node:test");
const mongoose = require("mongoose");

process.env.JWT_SECRET = process.env.JWT_SECRET || "table35-test-secret";
// Test emails use made-up domains: skip the "can this domain receive mail" DNS lookup
process.env.EMAIL_DOMAIN_CHECK = "off";

// Emails are replaced with recorders BEFORE any controller loads, because controllers
// copy the functions when they are first required.
const emailService = require("../../services/emailService");
const sentEmails = [];
for (const name of Object.keys(emailService)) {
    emailService[name] = async (...args) => { sentEmails.push({ name, args }); };
}

const User = require("../../models/User");
const GlobalSettings = require("../../models/GlobalSettings");
const generateToken = require("../../utils/generateToken");
const errorHandler = require("../../middleware/errorHandler");

// Fixed global settings so no test needs the database.
const SETTINGS = {
    security: {
        maxLoginAttempts: 5,
        lockoutMinutes: 15,
        sessionTimeoutMinutes: 60,
        requireStrongPasswords: true,
    },
    general: { shelterName: "RescueBase Shelter", shelterCapacity: 30 },
    notifications: { emailEnabled: true },
    maintenance: { enabled: false, message: "", allowAdminAccess: true },
    donationDropOff: { enabled: false },
};

function newId() {
    return new mongoose.Types.ObjectId().toString();
}

// A mongoose-style query: every chain method returns the same query and awaiting it gives `value`.
function query(value) {
    const chain = {};
    for (const name of ["select", "populate", "sort", "lean", "limit", "skip", "exec", "session", "collation"]) {
        chain[name] = () => chain;
    }
    chain.then = (resolve, reject) => Promise.resolve(value).then(resolve, reject);
    chain.catch = (reject) => Promise.resolve(value).catch(reject);
    return chain;
}

// A saved-document stand-in: plain fields, save() recorded, toObject() returns a copy.
function fakeDocument(fields = {}) {
    const doc = {
        _id: newId(),
        ...fields,
        savedTimes: 0,
        async save() {
            this.savedTimes += 1;
            return this;
        },
        toObject() {
            const copy = { ...this };
            delete copy.savedTimes;
            delete copy.save;
            delete copy.toObject;
            return copy;
        },
        toJSON() {
            return this.toObject();
        },
    };
    return doc;
}

function stubSettings(overrides = {}) {
    const settings = {
        ...SETTINGS,
        ...overrides,
        security: { ...SETTINGS.security, ...(overrides.security || {}) },
        maintenance: { ...SETTINGS.maintenance, ...(overrides.maintenance || {}) },
    };
    mock.method(GlobalSettings, "findOneAndUpdate", () => query(settings));
    return settings;
}

function makeResponse() {
    const res = {
        statusCode: 200,
        body: undefined,
        headers: {},
        finished: false,
        status(code) { this.statusCode = code; return this; },
        json(body) { this.body = body; this.finished = true; if (this.onFinish) this.onFinish(); return this; },
        send(body) { this.body = body; this.finished = true; if (this.onFinish) this.onFinish(); return this; },
        end(body) { if (body !== undefined) this.body = body; this.finished = true; if (this.onFinish) this.onFinish(); return this; },
        set(name, value) { this.headers[String(name).toLowerCase()] = value; return this; },
        setHeader(name, value) { return this.set(name, value); },
        header(name, value) { return this.set(name, value); },
        attachment() { return this; },
        cookie() { return this; },
        write() { return true; },
        on() { return this; },
        once() { return this; },
        emit() { return true; },
    };
    return res;
}

// Calls a controller function directly. Thrown errors become { status, body } like errorHandler does.
async function callHandler(handler, req = {}) {
    const res = makeResponse();
    req.body = req.body || {};
    req.params = req.params || {};
    req.query = req.query || {};
    req.headers = req.headers || {};
    try {
        await handler(req, res, (error) => { if (error) throw error; });
    } catch (error) {
        const silent = mock.method(console, "error", () => {});
        errorHandler(error, req, res, () => {});
        silent.mock.restore();
    }
    return { status: res.statusCode, body: res.body, res };
}

// Signs in a test user: stubs User.findById (used by verifyToken) and returns a Bearer header.
function authAs(role, overrides = {}) {
    const account = {
        _id: overrides.id || newId(),
        email: overrides.email || `${role}@test.rescuebase`,
        role,
        name: overrides.name || `Test ${role}`,
        username: overrides.username || `${role}-test`,
        status: overrides.status || "active",
    };
    const token = generateToken(account, 60);
    return { account, header: `Bearer ${token}` };
}

// Runs a real Express route (all its middleware and the controller) without starting a server.
// Example: callRoute(userRoutes, "GET", "/", { role: "staff" })
async function callRoute(router, method, url, options = {}) {
    const [path, queryString = ""] = url.split("?");
    const queryObject = Object.fromEntries(new URLSearchParams(queryString));
    const wanted = method.toLowerCase();

    let route = null;
    let params = {};
    const routerWideMiddleware = []; // router.use(...) layers that sit before the matched route also run
    for (const layer of router.stack) {
        if (!layer.route) {
            if (typeof layer.handle === "function" && !layer.handle.stack && layer.match(path)) routerWideMiddleware.push(layer.handle);
            continue;
        }
        if (!layer.route.methods[wanted]) continue;
        if (layer.match(path)) {
            route = layer.route;
            params = { ...(layer.params || {}) };
            break;
        }
    }
    if (!route) throw new Error(`No ${method} route matches ${path}`);

    const res = makeResponse();
    const baseRequest = {
        method: method.toUpperCase(),
        url,
        originalUrl: url,
        path,
        baseUrl: "",
        body: options.body || {},
        params: { ...params, ...(options.params || {}) },
        query: { ...queryObject, ...(options.query || {}) },
        headers: { ...(options.headers || {}) },
        files: options.files,
        file: options.file,
        ip: "127.0.0.1",
        get(name) { return this.headers[String(name).toLowerCase()]; },
        header(name) { return this.get(name); },
    };
    let req = baseRequest;
    if (options.multipart) {
        // A real multipart upload, so multer's own file filter runs.
        const { Readable } = require("node:stream");
        const { field = "image", filename, contentType, content = "x" } = options.multipart;
        const boundary = "----table35boundary";
        const payload = Buffer.from(
            `--${boundary}\r\nContent-Disposition: form-data; name="${field}"; filename="${filename}"\r\n` +
            `Content-Type: ${contentType}\r\n\r\n${content}\r\n--${boundary}--\r\n`
        );
        req = Readable.from([payload]);
        Object.assign(req, baseRequest, { body: undefined });
        req.headers["content-type"] = `multipart/form-data; boundary=${boundary}`;
        req.headers["content-length"] = String(payload.length);
    }

    let account = null;
    if (options.role) {
        const signed = authAs(options.role, options.user || {});
        account = signed.account;
        req.headers.authorization = signed.header;
        // verifyToken looks the account up with User.findById. If the test already stubbed findById
        // for the controller, the first call (verifyToken) gets the account and later calls reach the test's stub.
        const previousFindById = User.findById;
        let tokenLookupDone = false;
        mock.method(User, "findById", (...args) => {
            if (!tokenLookupDone) {
                tokenLookupDone = true;
                return query({ _id: account._id, status: account.status, name: account.name, username: account.username, role: account.role, email: account.email });
            }
            return previousFindById.apply(User, args);
        });
    }
    if (options.settings !== false) stubSettings(options.settings);
    if (options.firebaseUser) req.firebaseUser = options.firebaseUser;

    const handlers = [...routerWideMiddleware, ...route.stack.map((layer) => layer.handle)];
    const quiet = mock.method(console, "error", process.env.SHOW_TEST_ERRORS ? console.error : () => {});
    try {
        for (const handler of handlers) {
            let nextError;
            let nextCalled = false;
            await new Promise((resolve, reject) => {
                const safety = setTimeout(resolve, 5000); // never hang a test run
                const done = () => { clearTimeout(safety); resolve(); };
                res.onFinish = done;
                const next = (error) => { nextCalled = true; nextError = error; done(); };
                try {
                    const returned = handler(req, res, next);
                    if (returned && typeof returned.then === "function") {
                        returned.then(() => {}, (error) => { clearTimeout(safety); reject(error); }); // callback-style middleware (multer) answers later through next()
                    }
                } catch (error) {
                    clearTimeout(safety);
                    reject(error);
                }
            });
            if (nextError) {
                errorHandler(nextError, req, res, () => {});
                break;
            }
            if (res.finished || !nextCalled) break;
        }
    } finally {
        quiet.mock.restore();
    }
    return { status: res.statusCode, body: res.body, res, req, account };
}

module.exports = { sentEmails, mock, newId, query, fakeDocument, stubSettings, makeResponse, callHandler, callRoute, authAs, SETTINGS };
