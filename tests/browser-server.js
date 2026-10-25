import { startApp } from "../app.js";
import { hashPassword } from "../server/config.js";
import { createMemoryDatabase } from "./fixtures/memory-database.js";

// Browser tests have no access to the owner's database or login credentials.
export default async function setupBrowserServer() {
const database = createMemoryDatabase();
const app = await startApp({
  database,
  footerCache: false,
  logger: { write() {}, async flush() {} },
  config: { production: true, host: "127.0.0.1", port: 5180, trustedProxies: ["127.0.0.1"], adminUsername: "browser-admin", adminPasswordHash: hashPassword("Browser-test-only-2026!") },
});
return () => app.close();
}
