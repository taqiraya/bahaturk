import { test, expect } from "@playwright/test";
import { openAdminMenu, selectAdminSection } from "./admin-helpers";

test("public routes and approved page content load on desktop and mobile", async ({ page }) => {
  for (const [route, heading] of [["", "Building Afghanistan"], ["about", "Building with Purpose"], ["projects", "Engineering Ideas"], ["contact", "Let's Build the Future."]]) {
    await page.goto(`./#/${route}`);
    await expect(page.locator("h1").filter({ hasText: heading }).first()).toBeVisible();
    await expect(page.locator("body")).not.toContainText("Section data not found");
  }
  await expect(page.locator('a[href="tel:+93749171717"]')).toHaveText("+93 749 17 17 17");
  await expect(page.locator('a[href="mailto:info@bahaturk.com"]')).toHaveText("info@bahaturk.com");
});

test("contact submission appears only in the authenticated admin inbox", async ({ page }, testInfo) => {
  const subject = `Browser verification ${testInfo.project.name}`;
  await page.goto("./#/contact");
  await page.getByLabel("Full Name", { exact: true }).fill("بازدیدکننده آزمایشی");
  await page.getByLabel("Email Address", { exact: true }).fill("browser@example.invalid");
  await page.getByLabel("Subject", { exact: true }).fill(subject);
  await page.getByLabel("Message", { exact: true }).fill("پیام آزمایشی <script>example</script>");
  await page.getByRole("button", { name: "Send Message", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("received by our team");
  await page.goto("./#/admin");
  await page.getByLabel("نام کاربری", { exact: true }).fill("browser-admin");
  await page.getByLabel("رمز عبور", { exact: true }).fill("Browser-test-only-2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await selectAdminSection(page, "پیام‌های تماس");
  await expect(page.getByRole("heading", { name: subject, exact: true })).toBeVisible();
  await expect(page.getByText("پیام آزمایشی <script>example</script>", { exact: true }).first()).toBeVisible();
  await page.reload();
  await openAdminMenu(page);
  await expect(page.getByRole("button", { name: "خروج", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "خروج", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ورود ادمین", exact: true })).toBeVisible();
});

test("required fields reject empty submission without changing the form layout", async ({ page }) => {
  await page.goto("./#/contact");
  await page.getByRole("button", { name: "Send Message", exact: true }).click();
  await expect(page.locator("#fullName:invalid")).toBeVisible();
  await expect(page.getByText("Thank you. Your message has been received by our team.", { exact: true })).toHaveCount(0);
});

test("footer settings persist and update public links without changing footer structure", async ({ page }) => {
  await page.goto("./#/admin");
  await page.getByLabel("نام کاربری", { exact: true }).fill("browser-admin");
  await page.getByLabel("رمز عبور", { exact: true }).fill("Browser-test-only-2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  const email = page.getByLabel("ایمیل کسب‌وکار", { exact: true });
  await selectAdminSection(page, "تنظیمات فوتر");
  await expect(email).toHaveValue("info@bahaturk.com");
  await email.fill("edited@example.invalid");
  await page.getByRole("button", { name: "ذخیره اطلاعات فوتر", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("اطلاعات فوتر ذخیره شد.");
  await page.reload();
  await expect(email).toHaveValue("edited@example.invalid");
  const publicPage = await page.context().newPage();
  await publicPage.goto("./#/");
  await expect(publicPage.locator('footer a[href="mailto:edited@example.invalid"]')).toHaveText("edited@example.invalid");
  await publicPage.close();
  await email.fill("info@bahaturk.com");
  await page.getByRole("button", { name: "ذخیره اطلاعات فوتر", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("اطلاعات فوتر ذخیره شد.");
});

test("stale footer edits are rejected, recoverable history restores a previous version", async ({ page }) => {
  test.setTimeout(60000);
  await page.goto("./#/admin");
  await page.getByLabel("نام کاربری", { exact: true }).fill("browser-admin");
  await page.getByLabel("رمز عبور", { exact: true }).fill("Browser-test-only-2026!");
  await page.getByRole("button", { name: "ورود", exact: true }).click();
  await selectAdminSection(page, "تنظیمات فوتر");
  await expect(page.getByLabel("ایمیل کسب‌وکار", { exact: true })).toHaveValue("info@bahaturk.com");
  const other = await page.context().newPage();
  await other.goto("./#/admin");
  await selectAdminSection(other, "تنظیمات فوتر");
  await expect(other.getByLabel("ایمیل کسب‌وکار", { exact: true })).toHaveValue("info@bahaturk.com");
  await page.getByLabel("ایمیل کسب‌وکار", { exact: true }).fill("conflict@example.invalid");
  await page.getByRole("button", { name: "ذخیره اطلاعات فوتر", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("اطلاعات فوتر ذخیره شد.");
  await other.getByLabel("آدرس کسب‌وکار", { exact: true }).fill("Unsubmitted local edit");
  await other.getByRole("button", { name: "ذخیره اطلاعات فوتر", exact: true }).click();
  await expect(other.getByRole("alert")).toContainText("another tab");
  await expect(other.getByLabel("آدرس کسب‌وکار", { exact: true })).toHaveValue("Unsubmitted local edit");
  other.once("dialog", (dialog) => dialog.accept());
  await other.getByRole("button", { name: "دریافت آخرین نسخه", exact: true }).click();
  await expect(other.getByLabel("ایمیل کسب‌وکار", { exact: true })).toHaveValue("conflict@example.invalid");
  await other.getByRole("button", { name: "نمایش نسخه‌های قبلی فوتر", exact: true }).click();
  await expect(other.getByRole("button", { name: "انتخاب این نسخه", exact: true }).first()).toBeVisible();
  other.once("dialog", (dialog) => dialog.accept());
  await other.getByRole("button", { name: "انتخاب این نسخه", exact: true }).last().click();
  await other.getByRole("button", { name: "ذخیره اطلاعات فوتر", exact: true }).click();
  await expect(other.getByRole("status")).toHaveText("اطلاعات فوتر ذخیره شد.");
  await other.close();
});

test("confirmed footer values survive reload when its API is unavailable", async ({ page }) => {
  await page.route("**/api/footer", async (route) => {
    const original = await (await route.fetch()).json();
    await route.fulfill({ json: { ...original, email: "offline-preview@example.invalid" } });
  });
  await page.goto("./#/contact");
  await expect(page.locator('footer a[href="mailto:offline-preview@example.invalid"]')).toBeVisible();
  await page.unroute("**/api/footer");
  await page.route("**/api/footer", (route) => route.abort());
  await page.reload();
  await expect(page.locator('footer a[href="mailto:offline-preview@example.invalid"]')).toBeVisible();
});

test("a first-time visitor uses the HTML footer snapshot and later keeps newer confirmed values", async ({ page }) => {
  const settings = await (await page.request.get("./api/footer")).json();
  let snapshotEmail = "bootstrap@example.invalid";
  await page.route((url) => url.pathname === "/", async (route) => {
    const response = await route.fetch();
    const html = (await response.text()).replace("</head>", `<script id="bt-footer-snapshot" type="application/json">${JSON.stringify({ ...settings, email: snapshotEmail })}</script></head>`);
    await route.fulfill({ response, body: html });
  });
  await page.route("**/api/footer", (route) => route.abort());
  await page.goto("./#/contact");
  await expect(page.locator('footer a[href="mailto:bootstrap@example.invalid"]')).toBeVisible();
  await page.unroute("**/api/footer");
  snapshotEmail = "newer@example.invalid";
  await page.route("**/api/footer", (route) => route.fulfill({ json: { ...settings, email: "newer@example.invalid" } }));
  await page.reload();
  await expect(page.locator('footer a[href="mailto:newer@example.invalid"]')).toBeVisible();
  await page.unroute("**/api/footer");
  await page.route("**/api/footer", (route) => route.abort());
  await page.goto("./#/admin");
  await page.goto("./#/contact");
  await expect(page.locator('footer a[href="mailto:newer@example.invalid"]')).toBeVisible();
});
