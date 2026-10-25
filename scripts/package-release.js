import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const folder = `bahaturk-node-${new Date().toISOString().replace(/[:.]/g, "-")}`;
const target = resolve(root, "releases", folder);
const distSource = resolve(root, process.env.RELEASE_DIST_DIR || "dist");
await mkdir(target, { recursive: true });
// Explicit allowlist: never package owner credentials, databases, node_modules,
// old releases, raw db.json, or local configuration.
for (const file of ["dist", "shared", "app.js", "passenger.cjs", "package.json", "package-lock.json", ".env.example", "DEPLOYMENT.md", "RUN-FA.md"]) {
  await cp(file === "dist" ? distSource : resolve(root, file), resolve(target, file), { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
}
await mkdir(resolve(target, "server"));
for (const file of ["config.js", "database.js", "api.js", "client-ip.js", "admin-password.js", "logger.js", "footer-cache.js", "storage-monitor.js", "static-response.js", "ensure-build.js"]) {
  await cp(resolve(root, "server", file), resolve(target, "server", file), { errorOnExist: true, force: false });
}
await mkdir(resolve(target, "scripts"));
await cp(resolve(root, "scripts", "healthcheck.js"), resolve(target, "scripts", "healthcheck.js"), { errorOnExist: true, force: false });
await cp(resolve(root, "scripts", "storage-status.js"), resolve(target, "scripts", "storage-status.js"), { errorOnExist: true, force: false });
await cp(resolve(root, "scripts", "seo-audit.js"), resolve(target, "scripts", "seo-audit.js"), { errorOnExist: true, force: false });
const manifest = JSON.parse(await readFile(resolve(target, "package.json"), "utf8"));
manifest.scripts = {
  start: "node app.js --production",
  "start:production": "node app.js --production",
  "admin:password": "node server/admin-password.js",
  healthcheck: "node scripts/healthcheck.js",
  "storage:status": "node scripts/storage-status.js",
  "seo:audit": "node scripts/seo-audit.js",
};
await writeFile(resolve(target, "package.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Node.js hosting release: ${target}`);
