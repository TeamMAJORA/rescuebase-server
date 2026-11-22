// Run from rescue-base:  npx playwright test
// Rules: backend running, then `npm run build` + `npm run preview`. Test accounts only.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
    testDir: "./tests",
    timeout: 60_000,
    retries: 0,
    reporter: [["list"], ["html", { open: "never" }]],
    use: {
        baseURL: process.env.FRONTEND_URL || "http://localhost:4173", // vite preview default
        screenshot: "only-on-failure",
        trace: "retain-on-failure",
    },
    projects: [
        { name: "desktop", use: { ...devices["Desktop Chrome"] } },
        { name: "phone", use: { ...devices["Pixel 7"] }, grep: /@phone/ },
    ],
});
