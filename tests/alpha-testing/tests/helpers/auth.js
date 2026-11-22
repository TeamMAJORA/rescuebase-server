// Skips the emailed OTP: reuses a token you already got by hand (same tokens as the Postman environment).
// Env vars: BACKEND_URL (default http://localhost:5000), TOKEN_ADMIN, TOKEN_STAFF, TOKEN_VOLUNTEER, TOKEN_FOSTER, TOKEN_ADOPTER
const BACKEND_URL = (process.env.BACKEND_URL || "http://localhost:5000").replace(/\/+$/, "");

function tokenFor(role) {
    return process.env[`TOKEN_${role.toUpperCase()}`] || "";
}

// Loads the app already logged in as `role`. Fails fast if the token is missing or rejected.
async function loginAs(page, role) {
    const token = tokenFor(role);
    if (!token) throw new Error(`TOKEN_${role.toUpperCase()} is not set. Log in by hand once and export the token.`);

    const response = await page.request.get(`${BACKEND_URL}/api/users/me`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok()) throw new Error(`Token for ${role} was rejected: HTTP ${response.status()}`);
    const { user } = await response.json();

    await page.addInitScript(([storedToken, storedUser]) => {
        localStorage.setItem("token", storedToken);
        localStorage.setItem("rescuebase_user", storedUser);
    }, [token, JSON.stringify(user)]);
    await page.goto("/");
}

const hasToken = (role) => Boolean(tokenFor(role));

export { loginAs, hasToken, tokenFor, BACKEND_URL };
