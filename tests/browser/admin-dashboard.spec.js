import { test, expect } from "@playwright/test";
import { DEFAULT_FOOTER } from "../../shared/footer-settings.js";
import { openAdminMenu, selectAdminSection } from "./admin-helpers";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/admin/**", async (route) => {
    const url = new URL(route.request().url());
    let json;
    if (url.pathname.endsWith("/session")) json = { username: "مدیر آزمایشی", csrf: "a".repeat(64) };
    else if (url.pathname.endsWith("/messages")) {
      const pageNumber = Number(url.searchParams.get("page") || 1);
      json = { total: 35, pageSize: 20, snapshot: "35", messages: Array.from({ length: pageNumber === 1 ? 20 : 15 }, (_, index) => ({ id: String(35 - (pageNumber - 1) * 20 - index), fullName: `فرستندهٔ ${index + 1}`, emailAddress: "fixture@example.invalid", phoneNumber: "+93 700 000 000", subject: `درخواست بازدید ${35 - (pageNumber - 1) * 20 - index}`, message: "متن پیام آزمایشی محفوظ است.", createdAt: "2026-10-24T10:30:00Z" })) };
    } else json = { settings: DEFAULT_FOOTER, revision: "7" };
    await route.fulfill({ json });
  });
});

test("admin has exactly three management sections and preserves received message pagination", async ({ page }) => {
  await page.goto("./admin");
  await expect(page.getByRole("heading", { name: "پیام‌های تماس", exact: true })).toBeVisible();
  await expect(page.locator("[data-route-loader]")).toHaveCount(0);
  await openAdminMenu(page);
  await expect(page.getByRole("navigation", { name: "بخش‌های مدیریت" }).getByRole("button")).toHaveCount(3);
  await expect(page.getByRole("button", { name: "داشبورد", exact: true })).toHaveCount(0);
  await selectAdminSection(page, "پیام‌های تماس");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole("heading", { name: "درخواست بازدید 35", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "بعدی", exact: true }).click();
  await expect(page.getByRole("heading", { name: "درخواست بازدید 15", exact: true })).toBeVisible();
  await selectAdminSection(page, "تغییر رمز ادمین");
  await expect(page.getByLabel("رمز فعلی", { exact: true })).toBeVisible();
  await selectAdminSection(page, "پیام‌های تماس");
  await expect(page.getByRole("heading", { name: "درخواست بازدید 15", exact: true })).toBeVisible();
});

test("footer edits survive sidebar navigation and refresh without a database write", async ({ page }) => {
  let writes = 0;
  page.on("request", (request) => { if (request.method() === "PUT") writes++; });
  await page.goto("./admin");
  await selectAdminSection(page, "تنظیمات فوتر");
  await page.getByLabel("آدرس کسب‌وکار", { exact: true }).fill("پیش‌نویس محفوظ در پنل مدیریت");
  await selectAdminSection(page, "تغییر رمز ادمین");
  await selectAdminSection(page, "تنظیمات فوتر");
  await expect(page.getByLabel("آدرس کسب‌وکار", { exact: true })).toHaveValue("پیش‌نویس محفوظ در پنل مدیریت");
  await page.reload();
  await expect(page.getByLabel("آدرس کسب‌وکار", { exact: true })).toHaveValue("پیش‌نویس محفوظ در پنل مدیریت");
  expect(writes).toBe(0);
  await page.getByLabel("آدرس کسب‌وکار", { exact: true }).fill(DEFAULT_FOOTER.address);
});

test("mobile drawer closes with Escape and returns keyboard focus", async ({ page }) => {
  test.skip(page.viewportSize().width >= 1024, "Mobile drawer only");
  await page.goto("./admin");
  await expect(page.locator("#admin-sidebar")).toHaveAttribute("inert", "");
  await openAdminMenu(page);
  await expect(page.getByRole("navigation", { name: "بخش‌های مدیریت" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#admin-sidebar")).toHaveAttribute("inert", "");
  await expect(page.getByRole("button", { name: "باز کردن منوی مدیریت" })).toBeFocused();
  expect(await page.evaluate(() => document.body.style.overflow)).not.toBe("hidden");
});

test("password section validates confirmation, submits securely and asks for a fresh login", async ({ page }) => {
  let submitted = null;
  await page.route("**/api/admin/password", async (route) => { submitted = route.request().postDataJSON(); await route.fulfill({ json: { success: true } }); });
  await page.goto("./admin");
  await selectAdminSection(page, "تغییر رمز ادمین");
  await page.getByLabel("رمز فعلی", { exact: true }).fill("Existing-test-password");
  await page.getByLabel("رمز جدید", { exact: true }).fill("New-owner-password");
  await page.getByLabel("تکرار رمز جدید", { exact: true }).fill("Different-password");
  await page.getByRole("button", { name: "ذخیره رمز جدید", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("مطابقت ندارد");
  expect(submitted).toBeNull();
  await page.getByLabel("تکرار رمز جدید", { exact: true }).fill("New-owner-password");
  await page.getByRole("button", { name: "ذخیره رمز جدید", exact: true }).click();
  await expect(page.getByRole("heading", { name: "ورود ادمین", exact: true })).toBeVisible();
  await expect(page.getByRole("status")).toContainText("رمز با موفقیت تغییر کرد");
  expect(submitted.currentPassword).toBe("Existing-test-password");
  expect(submitted.newPassword).toBe("New-owner-password");
  expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("New-owner-password");
});
