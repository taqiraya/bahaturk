import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: "list",
  use: { baseURL: "http://127.0.0.1:5180/", screenshot: "only-on-failure", trace: "retain-on-failure" },
  globalSetup: "./tests/browser-server.js",
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] } },
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
    { name: "mobile-webkit", use: { ...devices["iPhone 13"] } },
  ].map((project, index) => ({ ...project, use: { ...project.use, extraHTTPHeaders: { "X-Forwarded-For": `198.51.100.${index + 1}` } } })),
});
