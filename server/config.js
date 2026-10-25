import { existsSync, readFileSync, appendFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { randomBytes, scryptSync, scrypt, timingSafeEqual, createHash } from "node:crypto";
import { parseEnv, promisify } from "node:util";
import { resolve } from "node:path";

export function hashPassword(password, salt = randomBytes(16).toString("hex")) {
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const scryptAsync = promisify(scrypt);
export async function hashPasswordAsync(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scryptAsync(password, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(password, encoded) {
  const [salt, hash] = String(encoded).split(":");
  if (!salt || !/^[a-f0-9]{128}$/.test(hash ?? "")) return false;
  const actual = await scryptAsync(password, salt, 64);
  return timingSafeEqual(actual, Buffer.from(hash, "hex"));
}

export function secureRecoveryFiles(root, preferredHash = "") {
  const files = readdirSync(root).filter((name) => /^\.env\.admin-access(?:\.[\w-]+)?\.local$/.test(name));
  for (const name of files) {
    const path = resolve(root, name);
    const saved = parseEnv(readFileSync(path, "utf8"));
    if (!saved.ADMIN_PASSWORD) continue;
    let encoded = saved.ADMIN_PASSWORD_HASH;
    const [salt, hash] = preferredHash.split(":");
    if (salt && /^[a-f0-9]{128}$/.test(hash || "") && timingSafeEqual(scryptSync(saved.ADMIN_PASSWORD, salt, 64), Buffer.from(hash, "hex"))) encoded = preferredHash;
    saved.ADMIN_PASSWORD_HASH = encoded || hashPassword(saved.ADMIN_PASSWORD);
    delete saved.ADMIN_PASSWORD;
    writeFileSync(path, Object.entries(saved).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join("\n") + "\n", { mode: 0o600 });
  }
}

export function loadConfig(root) {
  let values = {};
  for (const file of [".env", ".env.local"]) {
    const path = resolve(root, file);
    if (existsSync(path)) values = { ...values, ...parseEnv(readFileSync(path, "utf8")) };
  }
  // A password supplied by the host supersedes a hash in a lower-priority file.
  if (process.env.ADMIN_PASSWORD && !process.env.ADMIN_PASSWORD_HASH) delete values.ADMIN_PASSWORD_HASH;
  values = { ...values, ...process.env };
  secureRecoveryFiles(root, values.ADMIN_PASSWORD_HASH);
  const production = process.argv.includes("--production") || (!process.argv.includes("--dev") && values.NODE_ENV !== "development");
  if (!values.ADMIN_PASSWORD_HASH && !values.ADMIN_PASSWORD) {
    const latestAccessFile = readdirSync(root)
      .filter((name) => /^\.env\.admin-access(?:\.[\w-]+)?\.local$/.test(name))
      .map((name) => ({ path: resolve(root, name), generation: Number(name.match(/^\.env\.admin-access\.(\d+)-/)?.[1] || 0), modified: statSync(resolve(root, name)).mtimeMs }))
      .sort((a, b) => b.generation - a.generation || b.modified - a.modified)[0]?.path;
    const accessFile = latestAccessFile || resolve(root, ".env.admin-access.local");
    // Recover the SAME login if only .env.local was lost. Do not overwrite the
    // owner's credential file or generate a different password silently.
    if (existsSync(accessFile)) {
      const saved = parseEnv(readFileSync(accessFile, "utf8"));
      if (!saved.ADMIN_PASSWORD_HASH) throw new Error("Admin access file has no password hash. Run node server/admin-password.js to recover access.");
      values.ADMIN_USERNAME ||= saved.ADMIN_USERNAME || "admin";
      values.ADMIN_PASSWORD_HASH = saved.ADMIN_PASSWORD_HASH;
      appendFileSync(resolve(root, ".env.local"), `\nADMIN_USERNAME=${JSON.stringify(values.ADMIN_USERNAME)}\nADMIN_PASSWORD_HASH=${values.ADMIN_PASSWORD_HASH}\n`, { mode: 0o600 });
    } else {
      if (production) throw new Error("Configure ADMIN_USERNAME and ADMIN_PASSWORD_HASH before production startup.");
      const password = randomBytes(18).toString("base64url");
      values.ADMIN_USERNAME ||= "admin";
      values.ADMIN_PASSWORD_HASH = hashPassword(password);
      // Only append missing local credentials; never replace an existing configuration.
      // This credential file is ignored by Git and denied by the web server.
      writeFileSync(accessFile, `ADMIN_USERNAME=${JSON.stringify(values.ADMIN_USERNAME)}\nADMIN_PASSWORD_HASH=${values.ADMIN_PASSWORD_HASH}\n`, { flag: "wx", mode: 0o600 });
      appendFileSync(resolve(root, ".env.local"), `\nADMIN_USERNAME=${JSON.stringify(values.ADMIN_USERNAME)}\nADMIN_PASSWORD_HASH=${values.ADMIN_PASSWORD_HASH}\n`, { mode: 0o600 });
      console.log(`Initial admin password (shown once): ${password}`);
      console.log("Only its scrypt hash is saved in the private admin recovery file.");
    }
  }
  const config = {
    host: values.HOST || "127.0.0.1",
    port: Number(values.PORT || 3000),
    production,
    publicSiteUrl: values.PUBLIC_SITE_URL || null,
    publicSitePath: values.PUBLIC_SITE_PATH || null,
    secureCookie: values.SECURE_COOKIE === "true",
    trustedProxies: (values.TRUSTED_PROXIES || "").split(",").map((ip) => ip.trim()).filter(Boolean),
    storageLimits: {
      runtimeBytes: Number(values.RUNTIME_WARN_MB || 100) * 1024 * 1024,
      databaseBytes: Number(values.DATABASE_WARN_MB || 500) * 1024 * 1024,
      retiredSessions: Number(values.RETIRED_SESSIONS_WARN || 100000),
      workspaceBytes: Number(values.WORKSPACE_WARN_MB || 1024) * 1024 * 1024,
      minFreeBytes: Number(values.MIN_FREE_DISK_MB || 512) * 1024 * 1024,
    },
    adminUsername: values.ADMIN_USERNAME || "admin",
    adminPasswordHash: values.ADMIN_PASSWORD_HASH || hashPassword(values.ADMIN_PASSWORD),
    adminCredentialVersion: createHash("sha256").update(`${values.ADMIN_USERNAME || "admin"}\0${values.ADMIN_PASSWORD_HASH || values.ADMIN_PASSWORD}`).digest("hex"),
    database: {
      host: values.DB_HOST || "127.0.0.1",
      port: Number(values.DB_PORT || 3306),
      user: values.DB_USER || "root",
      password: values.DB_PASSWORD || "",
      database: values.DB_NAME || "baha_turk",
      charset: "utf8mb4",
      timezone: "Z",
      waitForConnections: true,
      connectionLimit: 5,
      multipleStatements: false,
      connectTimeout: 3000,
      flags: ["-FOUND_ROWS"],
    },
  };
  if (Object.values(config.storageLimits).some((value) => !Number.isFinite(value) || value < 0)) throw new Error("Storage warning thresholds must be non-negative numbers.");
  if (config.publicSiteUrl) {
    const site = new URL(config.publicSiteUrl);
    if (!["http:", "https:"].includes(site.protocol) || site.username || site.password) throw new Error("Invalid PUBLIC_SITE_URL.");
    config.publicSiteUrl = site.origin;
  }
  if (config.publicSitePath && !/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(config.publicSitePath)) throw new Error("Invalid PUBLIC_SITE_PATH.");
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(config.database.database)) throw new Error("DB_NAME must contain only letters, digits and underscores.");
  if (!Number.isInteger(config.port) || config.port < 0 || config.port > 65535) throw new Error("Invalid PORT.");
  return config;
}
