// Catches fake or mistyped emails before an account is created:
// 1. a typo of a big email provider ("mgail.cmo" -> "gmail.com") is refused with a suggestion
// 2. the domain must be able to receive mail (has MX records, or an A record as the mail fallback)
const { Resolver } = require("dns").promises;

const EMAIL_FORMAT = /^[^\s@]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

// Providers most people use; a near miss of one of these is almost always a typo
const BIG_PROVIDERS = ["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com"];
// Real providers that sit one or two letters away from the big ones: never "correct" these
const REAL_LOOKALIKES = new Set(["mail.com", "gmx.com", "ymail.com", "aol.com", "me.com", "mac.com", "msn.com", "live.com", "email.com"]);
// Mistyped endings
const ENDING_TYPOS = { cmo: "com", con: "com", coom: "com", comm: "com", vom: "com", xom: "com", ocm: "com", nte: "net", ner: "net", orgg: "org" };

const DNS_TIMEOUT_MS = 3000;
const KNOWN_GOOD_DOMAIN = "gmail.com";

// Letters added, removed, changed or swapped (optimal string alignment distance)
function typoDistance(a, b) {
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
        }
    }
    return d[a.length][b.length];
}

// Returns the corrected email, or "" when the domain doesn't look like a typo
function suggestEmailFix(email) {
    const at = email.lastIndexOf("@");
    const localPart = email.slice(0, at);
    const parts = email.slice(at + 1).toLowerCase().split(".");
    const ending = parts.pop();
    const domain = [...parts, ENDING_TYPOS[ending] || ending].join(".");

    if (REAL_LOOKALIKES.has(domain)) return "";
    if (BIG_PROVIDERS.includes(domain)) return domain === email.slice(at + 1).toLowerCase() ? "" : `${localPart}@${domain}`;

    const closest = BIG_PROVIDERS.find((provider) => typoDistance(provider, domain) <= 2);
    if (closest) return `${localPart}@${closest}`;
    return ENDING_TYPOS[ending] ? `${localPart}@${domain}` : "";
}

// true = can receive mail, false = domain doesn't exist or takes no mail, null = DNS unreachable (don't block)
async function domainCanReceiveMail(domain) {
    const resolver = new Resolver({ timeout: DNS_TIMEOUT_MS, tries: 1 });
    try {
        const records = await resolver.resolveMx(domain);
        if (records.length > 0) return true;
    } catch (error) {
        if (!["ENODATA", "ENOTFOUND"].includes(error.code)) return null;
        if (error.code === "ENOTFOUND") return false;
    }
    try {
        return (await resolver.resolve4(domain)).length > 0;
    } catch (error) {
        return ["ENODATA", "ENOTFOUND"].includes(error.code) ? false : null;
    }
}

function badEmail(message) {
    const error = new Error(message);
    error.statusCode = 400;
    return error;
}

// Throws a 400 with a message the person can act on; resolves when the email looks real
async function assertRealEmail(email) {
    if (!EMAIL_FORMAT.test(email)) throw badEmail("Enter an email like name@example.com.");

    const suggestion = suggestEmailFix(email);
    if (suggestion) throw badEmail(`Check your email: did you mean ${suggestion}?`);

    // Unit tests run offline with made-up domains (tests/helpers/http.js turns the DNS part off)
    if (process.env.EMAIL_DOMAIN_CHECK === "off") return;

    const domain = email.slice(email.lastIndexOf("@") + 1);
    let canReceiveMail = await domainCanReceiveMail(domain);
    // If even a known-good domain fails, the server's DNS is down: don't block everyone's sign-up
    if (canReceiveMail === false && (await domainCanReceiveMail(KNOWN_GOOD_DOMAIN)) !== true) canReceiveMail = null;
    if (canReceiveMail === false) throw badEmail(`"${domain}" can't receive email. Check the part after @.`);
    if (canReceiveMail === null) console.warn(`[emailCheck] DNS lookup unavailable for ${domain}; allowing it.`);
}

module.exports = { assertRealEmail, suggestEmailFix, domainCanReceiveMail };
