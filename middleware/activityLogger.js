// Writes an Activity Log entry for every successful create / update / delete.
// One place instead of a call in every controller. Never blocks or breaks a request.

const ActivityLog = require("../models/ActivityLog");

const NAME_KEYS = ["name", "title", "petName", "animalName", "fullName", "username", "locationName", "itemName", "vaccine_name"];

// First readable name found in the response, then in the request body
function findName(...sources) {
    for (const source of sources) {
        if (!source || typeof source !== "object") continue;

        for (const key of NAME_KEYS) {
            if (typeof source[key] === "string" && source[key].trim()) return source[key].trim();
        }

        for (const value of Object.values(source)) {
            if (value && typeof value === "object" && !Array.isArray(value)) {
                for (const key of NAME_KEYS) {
                    if (typeof value[key] === "string" && value[key].trim()) return value[key].trim();
                }
            }
        }
    }
    return "";
}

const withName = (text, name) => (name ? `${text} ${name}` : text);
const status = (body) => String(body?.status || "").replace(/_/g, " ").trim().toLowerCase();

// [method, path pattern, type, (ctx) => sentence]. First match wins.
// Paths not listed (notifications read, uploads, OTP resend...) are not logged.
const RULES = [
    // Account
    ["POST", /^\/api\/auth\/(email\/login|email\/verify-login-otp|google\/login)$/, "Account", () => "Logged in"],
    ["POST", /^\/api\/auth\/(email\/verify-otp|google\/signup)$/, "Account", () => "Created an account"],
    ["POST", /^\/api\/auth\/reset-password$/, "Account", () => "Reset their password"],

    // Animals
    ["POST", /^\/api\/animals\/?$/, "Animal", (c) => withName("Added animal", c.name)],
    ["PATCH", /^\/api\/animals\/[^/]+\/approve-intake$/, "Animal", (c) => withName("Approved intake for", c.name)],
    ["PATCH", /^\/api\/animals\/[^/]+\/reject-intake$/, "Animal", (c) => withName("Rejected intake for", c.name)],
    ["PATCH", /^\/api\/animals\/[^/]+$/, "Animal", (c) => withName("Updated animal", c.name)],
    ["DELETE", /^\/api\/animals\/[^/]+$/, "Animal", (c) => withName("Deleted animal", c.name)],
    ["POST", /^\/api\/animal-transfers\/?$/, "Animal", (c) => withName("Recorded a transfer for", c.name)],
    ["PATCH", /^\/api\/animal-transfers\/[^/]+$/, "Animal", (c) => withName("Updated a transfer for", c.name)],
    ["DELETE", /^\/api\/animal-transfers\/[^/]+$/, "Animal", () => "Deleted an animal transfer"],
    ["POST", /^\/api\/qr-tags\/(generate|[^/]+\/regenerate)$/, "Animal", (c) => withName("Generated a QR tag for", c.name)],
    ["DELETE", /^\/api\/qr-tags\/[^/]+$/, "Animal", () => "Deleted a QR tag"],

    // Medical
    ["POST", /^\/api\/medical-records\/?$/, "Medical", (c) => withName("Added a medical record for", c.name)],
    ["PATCH", /^\/api\/medical-records\/[^/]+$/, "Medical", (c) => withName("Updated a medical record for", c.name)],
    ["DELETE", /^\/api\/medical-records\/[^/]+$/, "Medical", () => "Deleted a medical record"],
    ["POST", /^\/api\/vaccinations\/?$/, "Medical", (c) => withName("Added vaccination", c.name)],
    ["PATCH", /^\/api\/vaccinations\/[^/]+$/, "Medical", (c) => withName("Updated vaccination", c.name)],
    ["DELETE", /^\/api\/vaccinations\/[^/]+$/, "Medical", () => "Deleted a vaccination record"],
    ["POST", /^\/api\/foster\/(medical\/?|assignments\/[^/]+\/medical-requests)$/, "Medical", (c) => withName("Sent a medical request for", c.name)],
    ["PATCH", /^\/api\/foster\/(medical\/[^/]+\/resolve|medical-requests\/[^/]+\/[^/]+)$/, "Medical", () => "Answered a medical request"],

    // Adoption
    ["POST", /^\/api\/adoptions\/?$/, "Adoption", (c) => withName("Applied to adopt", c.name)],
    ["PATCH", /^\/api\/adoptions\/[^/]+\/status$/, "Adoption", (c) => withName(`Set adoption application to "${status(c.body) || "updated"}" for`, c.name)],
    ["PATCH", /^\/api\/adoptions\/[^/]+\/withdraw$/, "Adoption", (c) => withName("Withdrew adoption application for", c.name)],
    ["PATCH", /^\/api\/adoptions\/[^/]+\/documents(\/request)?$/, "Adoption", (c) => withName("Updated adoption documents for", c.name)],
    ["POST", /^\/api\/matchmaking\/quiz$/, "Adoption", () => "Took the matching quiz"],

    // Foster
    ["POST", /^\/api\/foster\/applications$/, "Foster", () => "Applied to foster"],
    ["PATCH", /^\/api\/foster\/applications\/me\/withdraw$/, "Foster", () => "Withdrew foster application"],
    ["PATCH", /^\/api\/foster\/applications\/me$/, "Foster", () => "Updated foster application"],
    ["PATCH", /^\/api\/foster\/applications\/[^/]+\/status$/, "Foster", (c) => `Set a foster application to "${status(c.body) || "updated"}"`],
    ["POST", /^\/api\/foster\/assignments$/, "Foster", (c) => withName("Assigned a foster for", c.name)],
    ["POST", /^\/api\/foster\/assignments\/[^/]+\/updates$/, "Foster", (c) => withName("Submitted a weekly update for", c.name)],
    ["POST", /^\/api\/foster\/assignments\/[^/]+\/behavior-evaluation$/, "Foster", (c) => withName("Submitted a behavior evaluation for", c.name)],
    ["PATCH", /^\/api\/foster\/assignments\/[^/]+\/behavior-evaluation\/(accept|return)$/, "Foster", (c) => withName("Reviewed a behavior evaluation for", c.name)],
    ["PATCH", /^\/api\/foster\/assignments\/[^/]+\/complete$/, "Foster", (c) => withName("Completed foster care for", c.name)],
    ["POST", /^\/api\/foster\/assignments\/[^/]+\/return-request$/, "Foster", (c) => withName("Requested to return", c.name)],
    ["PATCH", /^\/api\/foster\/assignments\/[^/]+\/return-request$/, "Foster", (c) => withName("Answered a return request for", c.name)],
    ["PATCH", /^\/api\/foster\/assignments\/[^/]+$/, "Foster", (c) => withName("Updated foster assignment for", c.name)],
    ["DELETE", /^\/api\/foster\/assignments\/[^/]+$/, "Foster", () => "Deleted a foster assignment"],

    // Rescue
    ["POST", /^\/api\/rescue-assignments\/?$/, "Rescue", () => "Created a rescue assignment"],
    ["PATCH", /^\/api\/rescue-assignments\/[^/]+\/(accept|decline|start|complete|cancel)$/, "Rescue", (c) => `${c.match[1][0].toUpperCase()}${c.match[1].slice(1)}${c.match[1].endsWith("e") ? "d" : "ed"} a rescue assignment`],
    ["PATCH", /^\/api\/rescue-assignments\/[^/]+$/, "Rescue", () => "Updated a rescue assignment"],
    ["DELETE", /^\/api\/rescue-assignments\/[^/]+$/, "Rescue", () => "Deleted a rescue assignment"],

    // Lost & Found / GIS
    ["POST", /^\/api\/lost-found\/reports$/, "Lost & Found", (c) => withName(`Reported a ${c.body?.reportType || "lost or found"} pet`, c.name ? `: ${c.name}` : "").replace(" :", ":")],
    ["POST", /^\/api\/lost-found\/reports\/[^/]+\/claim$/, "Lost & Found", (c) => withName("Claimed", c.name)],
    ["PATCH", /^\/api\/lost-found\/reports\/[^/]+\/claim$/, "Lost & Found", (c) => withName("Reviewed a claim for", c.name)],
    ["PATCH", /^\/api\/lost-found\/reports\/[^/]+\/reunited$/, "Lost & Found", (c) => withName("Marked as reunited:", c.name)],
    ["DELETE", /^\/api\/lost-found\/reports\/[^/]+$/, "Lost & Found", () => "Deleted a lost & found report"],
    ["POST", /^\/api\/gis\/shelters$/, "GIS", (c) => withName("Added place", c.name)],
    ["PATCH", /^\/api\/gis\/shelters\/[^/]+$/, "GIS", (c) => withName("Updated place", c.name)],
    ["POST", /^\/api\/gis(\/stray-sightings)?$/, "GIS", (c) => withName(`Pinned a ${c.body?.reportType || "stray"} report`, c.name ? `at ${c.name}` : "")],
    ["PATCH", /^\/api\/gis\/[^/]+\/resolve$/, "GIS", (c) => withName("Resolved a map report", c.name ? `at ${c.name}` : "")],
    ["PATCH", /^\/api\/gis\/[^/]+$/, "GIS", (c) => withName("Updated a map report", c.name ? `at ${c.name}` : "")],
    ["DELETE", /^\/api\/gis\/[^/]+$/, "GIS", () => "Deleted a map report"],

    // Donations & supplies
    ["POST", /^\/api\/donations\/?$/, "Donation", (c) => withName("Recorded a donation", c.name ? `from ${c.name}` : "")],
    ["PATCH", /^\/api\/donations\/[^/]+$/, "Donation", () => "Updated a donation"],
    ["DELETE", /^\/api\/donations\/[^/]+$/, "Donation", () => "Deleted a donation"],
    ["POST", /^\/api\/payment-methods\/?$/, "Donation", (c) => withName("Added payment method", c.name)],
    ["PATCH", /^\/api\/payment-methods\/[^/]+$/, "Donation", (c) => withName("Updated payment method", c.name)],
    ["DELETE", /^\/api\/payment-methods\/[^/]+$/, "Donation", () => "Deleted a payment method"],
    ["POST", /^\/api\/supplies\/?$/, "Supplies", (c) => withName("Added needed supply", c.name)],
    ["PATCH", /^\/api\/supplies\/[^/]+$/, "Supplies", (c) => withName("Updated needed supply", c.name)],
    ["DELETE", /^\/api\/supplies\/[^/]+$/, "Supplies", () => "Deleted a needed supply"],

    // Reads worth recording (downloads / exports)
    ["GET", /^\/api\/reports\/[^/]+\/download$/, "Report", (c) => withName("Downloaded report", c.reportTitle)],

    // Reports, feedback, users, settings
    ["POST", /^\/api\/reports(\/generate)?$/, "Report", (c) => withName("Generated report", c.name)],
    ["PATCH", /^\/api\/reports\/[^/]+\/finalize$/, "Report", (c) => withName("Finalized report", c.name)],
    ["DELETE", /^\/api\/reports\/[^/]+$/, "Report", () => "Deleted a report"],
    ["POST", /^\/api\/feedback\/?$/, "Feedback", () => "Sent feedback"],
    ["PATCH", /^\/api\/feedback\/[^/]+\/reply$/, "Feedback", (c) => withName("Replied to feedback from", c.data?.feedback?.userName)],
    ["PATCH", /^\/api\/feedback\/[^/]+\/(archive|restore)$/, "Feedback", (c) => `${c.match[1] === "archive" ? "Archived" : "Restored"} feedback`],
    ["DELETE", /^\/api\/feedback\/[^/]+$/, "Feedback", () => "Deleted feedback"],
    ["POST", /^\/api\/users\/role-application$/, "User", () => "Applied for a new role"],
    ["PATCH", /^\/api\/users\/[^/]+\/role-application$/, "User", () => "Reviewed a role application"],
    ["PATCH", /^\/api\/users\/[^/]+\/deactivate$/, "User", (c) => withName("Changed account status of", c.name)],
    ["POST", /^\/api\/users\/?$/, "User", (c) => withName("Created user", c.name)],
    ["PATCH", /^\/api\/users\/[^/]+$/, "User", (c) => withName("Updated user", c.name)],
    ["PATCH", /^\/api\/settings\/?$/, "Settings", () => "Changed system settings"],
];

function userIdFrom(req, data) {
    const fromToken = req.user?.id || req.user?._id || req.user?.userId;
    if (fromToken) return String(fromToken);

    // Login / signup: the user isn't on req yet, but is in the response
    const user = data?.user;
    return user?._id || user?.id ? String(user._id || user.id) : "";
}

console.log("[Activity Log] Logging is on.");

module.exports = function activityLogger(req, res, next) {
    if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(req.method)) return next();

    const path = req.originalUrl.split("?")[0].replace(/\/+$/, "") || "/";
    const rule = RULES.find(([method, pattern]) => method === req.method && pattern.test(path));
    if (!rule) return next();

    let responseData = null;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        responseData = body;
        return originalJson(body);
    };

    res.on("finish", async () => {
        try {
            if (res.statusCode >= 400) return;

            // Login replies without a token (OTP step) are not a login yet
            if (rule[2] === "Account" && /login|verify/.test(path) && responseData && !responseData.token) return;

            const userId = userIdFrom(req, responseData);
            if (!userId) return;

            // Download responses are files, so look the report title up by id
            const reportId = (path.match(/^\/api\/reports\/([^/]+)\/download$/) || [])[1];

            const ctx = {
                reportTitle: "",
                body: req.body || {},
                data: responseData || {},
                match: path.match(rule[1]) || [],
                name: findName(responseData, req.body),
            };

            if (reportId) {
                try {
                    const Report = require("../models/Reports");
                    const report = await Report.findById(reportId).select("title").lean();
                    ctx.reportTitle = report?.title || "";
                } catch {
                    // title is optional
                }
            }

            const activity = String(rule[3](ctx) || "").replace(/\s+/g, " ").trim().slice(0, 300);
            if (!activity) return;

            ActivityLog.create({
                user: userId,
                activity,
                activityType: rule[2],
                activityDate: new Date(),
            })
                .then(() => console.log(`[Activity Log] saved: ${activity}`))
                .catch((error) => console.error("Activity log write failed:", error.message));
        } catch (error) {
            console.error("Activity log error:", error.message);
        }
    });

    return next();
};
