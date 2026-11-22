import { expect } from "@playwright/test";

// Sidebar items are <button title="Label">. Admin and staff have groups (for example "Animals") that open to show children.
const GROUP_BUTTONS = ["Animals", "Supplies", "Adoptions", "Donations"];

// Opens one sidebar item. Fails fast if the item cannot be found.
export async function openModule(page, label) {
    const target = page.locator(`button[title="${label}"]`).first();
    if (!(await target.isVisible())) {
        for (const groupLabel of GROUP_BUTTONS) {
            if (groupLabel === label) continue;
            const group = page.locator(`button[title="${groupLabel}"]`).first();
            if (await group.count() === 0) continue;
            await group.click();
            if (await target.isVisible()) break;
        }
    }
    await expect(target, `Sidebar item "${label}" was not found`).toBeVisible({ timeout: 15_000 });
    await target.click();
}

// Records page errors and server errors (HTTP 5xx) while a screen loads.
export function watchForProblems(page) {
    const problems = [];
    page.on("pageerror", (error) => problems.push(`page error: ${error.message}`));
    page.on("response", (response) => {
        if (response.status() >= 500) problems.push(`HTTP ${response.status()} ${response.url()}`);
    });
    return problems;
}

// One check: open the screen, let it load, and fail on any page error or 5xx.
export async function expectScreenOpens(page, label) {
    const problems = watchForProblems(page);
    await openModule(page, label);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).not.toBeEmpty();
    expect(problems, `Problems while opening "${label}"`).toEqual([]);
}
