import { expect } from "@playwright/test";

export async function openAdminMenu(page) {
  await expect(page.locator("#admin-sidebar")).toHaveCount(1);
  const toggle = page.getByRole("button", { name: "باز کردن منوی مدیریت", exact: true });
  if (await toggle.isVisible() && await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
}

export async function selectAdminSection(page, label) {
  if (label === "تنظیمات فوتر") label = "فوتر و اطلاعات تماس";
  await openAdminMenu(page);
  await page.getByRole("navigation", { name: "بخش‌های مدیریت", exact: true }).getByRole("button").filter({ hasText: label }).click();
  await expect(page.getByRole("heading", { name: label, exact: true, level: 1 })).toBeVisible();
}
