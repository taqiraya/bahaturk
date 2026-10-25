import { test, expect } from "@playwright/test";
import { selectAdminSection } from "./admin-helpers";

async function ready(page, route = "") {
  await page.goto(`./${route}`);
  await expect(page.locator("header").first()).toBeVisible();
  await expect(page.locator("[data-route-loader]")).toHaveCount(0);
}
async function navigationLink(page, name) {
  const toggle = page.getByRole("button", { name: "Toggle menu", exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  return page.locator("header nav:visible").getByRole("link", { name });
}
async function login(page) {
  await page.goto("./admin");
  await page.getByLabel("نام کاربری", { exact: true }).fill("browser-admin");
  await page.getByLabel("رمز عبور", { exact: true }).fill("Browser-test-only-2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await selectAdminSection(page, "تنظیمات فوتر");
  await expect(page.getByLabel("آدرس کسب‌وکار", { exact: true })).toBeEditable();
  await expect(page.locator("[data-route-loader]")).toHaveCount(0);
}

test("a failed page chunk shows recovery and retry opens the unchanged page", async ({ page }) => {
  await page.route("**/assets/Contact-*.js", (route) => route.abort());
  await page.goto("./contact");
  await expect(page.getByRole("heading", { name: "This page could not load." })).toBeVisible();
  await page.unroute("**/assets/Contact-*.js");
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Let's Build the Future.", exact: true })).toBeVisible();
  await expect(page.locator("[data-route-loader]")).toHaveCount(0);
});

test("failed responsive derivatives recover their existing original files", async ({ page }) => {
  await page.route("**/images/responsive/**", (route) => route.abort());
  await ready(page);
  await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 700) { scrollTo(0, y); await new Promise((done) => setTimeout(done, 35)); } });
  await expect.poll(() => page.locator("img").evaluateAll((images) => images.filter((image) => image.complete && !image.naturalWidth).length)).toBe(0);
  const photo = page.getByAltText("Solh Residential Project", { exact: true });
  await expect(photo).toHaveAttribute("src", /featured_project/);
  await expect.poll(() => photo.evaluate((image) => image.naturalWidth)).toBeGreaterThan(0);
  expect(await photo.getAttribute("srcset")).toBeNull();
});

test("contact drafts and retry identifiers survive refresh; navigation asks before leaving", async ({ page }) => {
  await ready(page, "contact");
  await page.getByLabel("Full Name", { exact: true }).fill("Retained draft");
  await page.getByLabel("Email Address", { exact: true }).fill("draft@example.invalid");
  await page.getByLabel("Message", { exact: true }).fill("Unsent text kept in this browser");
  page.once("dialog", (dialog) => dialog.dismiss());
  await (await navigationLink(page, /About/i)).click();
  await expect(page).toHaveURL(/\/contact$/);
  let firstId;
  await page.route("**/api/contact-messages", async (route) => {
    firstId = route.request().postDataJSON().requestId;
    await route.fulfill({ status: 503, json: { error: "Temporary verification outage" } });
  });
  await page.getByRole("button", { name: "Send Message", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Temporary verification outage");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(page.getByLabel("Full Name", { exact: true })).toHaveValue("Retained draft");
  await page.unroute("**/api/contact-messages");
  let retriedId;
  await page.route("**/api/contact-messages", async (route) => { retriedId = route.request().postDataJSON().requestId; await route.fulfill({ status: 201, json: { success: true, id: "fixture-only" } }); });
  await page.getByRole("button", { name: "Send Message", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("received by our team");
  expect(retriedId).toBe(firstId);
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("Retained draft");
  expect(await page.evaluate(() => JSON.stringify(sessionStorage))).not.toContain("Retained draft");
  await page.reload();
  await expect(page.getByLabel("Full Name", { exact: true })).toHaveValue("");
});

test("unsaved footer edits survive refresh without writing to the database", async ({ page }) => {
  await login(page);
  const address = page.getByLabel("آدرس کسب‌وکار", { exact: true });
  const original = await address.inputValue();
  await address.fill("Retained unsaved footer draft");
  page.once("dialog", (dialog) => dialog.accept());
  await page.reload();
  await expect(address).toHaveValue("Retained unsaved footer draft");
  const stored = await (await page.request.get("./api/admin/footer")).json();
  expect(stored.settings.address).toBe(original);
  await address.fill(original);
});

test("history double-click sends one request and never duplicates revisions", async ({ page }) => {
  const settings = await (await page.request.get("./api/footer")).json();
  let requests = 0;
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url()); let data;
    if (url.pathname.endsWith("/session")) data = { username: "history-fixture", csrf: "a".repeat(64) };
    else if (url.pathname.endsWith("/messages")) data = { messages: [], total: 0, pageSize: 20, snapshot: "0" };
    else if (url.pathname.endsWith("/footer/history")) {
      const older = url.searchParams.has("before");
      if (older) { requests++; await new Promise((done) => setTimeout(done, 300)); }
      data = { versions: Array.from({ length: older ? 10 : 20 }, (_, i) => ({ revision: String((older ? 10 : 30) - i), settings, createdAt: "2026-10-24T00:00:00Z" })) };
    } else data = { settings, revision: "30" };
    await route.fulfill({ json: data });
  });
  await page.goto("./admin");
  await selectAdminSection(page, "تنظیمات فوتر");
  await page.getByRole("button", { name: "نمایش نسخه‌های قبلی فوتر", exact: true }).click();
  await page.getByRole("button", { name: "نسخه‌های قدیمی‌تر", exact: true }).dblclick();
  await expect(page.getByRole("button", { name: "انتخاب این نسخه", exact: true })).toHaveCount(30);
  expect(requests).toBe(1);
});

test("logo stays during slow loading and for at least 0.3 seconds on a warm route", async ({ page }) => {
  await ready(page);
  await page.route("**/assets/About-*.js", async (route) => { await new Promise((done) => setTimeout(done, 900)); await route.continue(); });
  await (await navigationLink(page, /About/i)).click();
  await expect(page.locator("[data-route-loader].fixed")).toBeVisible();
  await expect(page.locator("[data-route-loader]")).toHaveCount(0);
  const contact = await navigationLink(page, "Contact");
  await contact.hover(); await page.waitForTimeout(350);
  const started = Date.now(); await contact.click();
  await expect(page.locator("[data-route-loader].fixed")).toBeVisible();
  await expect(page.locator("[data-route-loader]")).toHaveCount(0);
  expect(Date.now() - started).toBeGreaterThanOrEqual(280);
});

test("back-to-top floats at the right and returns the page to its original top", async ({ page }) => {
  await ready(page);
  await expect(page.getByRole("button", { name: "Back to top", exact: true })).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
  const button = page.getByRole("button", { name: "Back to top", exact: true });
  await expect(button).toBeVisible();
  const box = await button.boundingBox();
  expect(box.x + box.width).toBeGreaterThan(page.viewportSize().width - 40);
  await button.click();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeLessThan(2);
});

test("legacy links, clean reloads, social names and map titles remain accessible", async ({ page }) => {
  await ready(page, "#/about");
  await expect(page).toHaveURL(/\/about$/);
  await expect(page).toHaveTitle("About Baha Turk | Construction Since 2001");
  await page.reload();
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Facebook", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Instagram", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "YouTube", exact: true })).toBeVisible();
  const response = await page.request.get("./about");
  expect(await response.text()).toContain('property="og:title" content="About Baha Turk');
  await ready(page);
  await expect(page.getByTitle("Solh Residential Project location in Kabul")).toHaveCount(1);
});
