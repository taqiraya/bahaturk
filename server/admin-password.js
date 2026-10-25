// Explicit owner command. Retains old configuration and credential files.
import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";
import { hashPassword } from "./config.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
let values = {};
for (const file of [".env", ".env.local"]) {
  const path = resolve(root, file);
  if (existsSync(path)) values = { ...values, ...parseEnv(readFileSync(path, "utf8")) };
}
const username = process.env.ADMIN_USERNAME || values.ADMIN_USERNAME || "admin";
const password = randomBytes(24).toString("base64url");
const suffix = `${Date.now()}-${randomBytes(4).toString("hex")}`;
const file = `.env.admin-access.${suffix}.local`;
writeFileSync(resolve(root, file), `ADMIN_USERNAME=${JSON.stringify(username)}\nADMIN_PASSWORD=${password}\n`, { flag: "wx", mode: 0o600 });
appendFileSync(resolve(root, ".env.local"), `\nADMIN_USERNAME=${JSON.stringify(username)}\nADMIN_PASSWORD_HASH=${hashPassword(password)}\n`, { mode: 0o600 });
console.log(`New login saved in ${file}. Existing files and database records were retained.`);
console.log("Restart Node to apply the new password. If credentials are set in hosting environment variables, update those from the new login file first.");
