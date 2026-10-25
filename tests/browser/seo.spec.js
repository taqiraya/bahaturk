import { test, expect } from "@playwright/test";

test("each public document exposes real content, unique metadata and resolved assets before JavaScript", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  const titles = new Set();
  try {
    for (const [route, heading] of [["", /Building Afghanistan/], ["about", /Building with Purpose/], ["projects", /Engineering Ideas/], ["contact", /Let's Build the Future/]]) {
      const response = await request.get(`./${route}`);
      expect(response.status()).toBe(200);
      const html = await response.text();
      expect(html).not.toContain("<!--bt-page-content-->");
      expect(html).not.toContain("/BahaTurk/src/assets/");
      expect(html).toContain('type="application/ld+json"');
      titles.add(html.match(/<title>(.*?)<\/title>/)[1]);
      await page.goto(new URL(route, response.url().replace(/[^/]*$/, "")).href);
      await expect(page.locator("h1")).toHaveCount(1);
      await expect(page.locator("h1")).toContainText(heading);
      await expect(page.locator("main")).toHaveCount(1);
      await expect(page.locator("footer")).toHaveCount(1);
      await expect(page.locator('footer a[href="tel:+93749171717"]')).toHaveText("+93 749 17 17 17");
      await expect(page.locator('footer a[href="mailto:info@bahaturk.com"]')).toHaveText("info@bahaturk.com");
      await expect(page.locator("[data-initial-loader]")).toBeHidden();
    }
    expect(titles.size).toBe(4);
  } finally { await context.close(); }
});

test("client navigation keeps one graph and canonical URL; dynamic footer updates its business details", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("[data-route-loader]")).toHaveCount(0);
  const settings = await (await page.request.get("./api/footer")).json();
  await page.route("**/api/footer", (route) => route.fulfill({ json: { ...settings, email: "updated-business@example.invalid" } }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect.poll(() => page.locator("#bt-structured-data").textContent()).toContain("updated-business@example.invalid");
  await page.goto("./contact?utm_source=test");
  await expect(page.locator("[data-route-loader]")).toHaveCount(0);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/contact$/);
  await expect(page.locator("#bt-structured-data")).toHaveCount(1);
  await page.goto("./admin");
  await expect(page.locator("#bt-structured-data")).toHaveCount(0);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex,nofollow");
});
