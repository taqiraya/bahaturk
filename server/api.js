import { validateFooter } from "../shared/footer-settings.js";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { verifyPassword, hashPasswordAsync } from "./config.js";
import { getClientIp } from "./client-ip.js";

const SESSION_LIFETIME = 8 * 60 * 60 * 1000;

export function validateMessage(body) {
  const limits = { fullName: 150, phoneNumber: 40, emailAddress: 254, subject: 200, message: 10000 };
  const data = {};
  for (const [field, limit] of Object.entries(limits)) {
    if (body[field] != null && typeof body[field] !== "string") throw httpError(422, "Please enter valid text in the form fields.");
    data[field] = (body[field] ?? "").trim();
    if (data[field].length > limit) throw httpError(422, `${field} must not exceed ${limit} characters.`);
  }
  if (!data.fullName || !data.message) throw httpError(422, "Please enter your full name and message.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.emailAddress)) throw httpError(422, "Please enter a valid email address.");
  if (typeof body.requestId !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(body.requestId)) throw httpError(422, "Invalid submission identifier. Please reload the page.");
  return { ...data, requestId: body.requestId };
}

function httpError(status, message) {
  return Object.assign(new Error(message), { status });
}

async function readJson(req) {
  if (!String(req.headers["content-type"]).toLowerCase().startsWith("application/json")) throw httpError(415, "Content-Type must be application/json.");
  let length = 0;
  const parts = [];
  for await (const part of req) {
    length += part.length;
    if (length > 65536) throw httpError(413, "The message is too large.");
    parts.push(part);
  }
  try {
    const value = JSON.parse(Buffer.concat(parts).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw httpError(400, "Invalid JSON request.");
  }
}

export function createApi({ database, config, now = Date.now, logger = { write() {} }, footerCache = null }) {
  const version = config.adminCredentialVersion || createHash("sha256").update(config.adminPasswordHash || "").digest("hex");
  const digest = (value) => createHash("sha256").update(value).digest("hex");
  async function credentials() {
    const saved = await database.getAdminCredentials?.(config.adminUsername, version);
    return saved ? { ...saved, version: digest(`${version}\0${saved.revision}\0${saved.passwordHash}`) } : { revision: "0", passwordHash: config.adminPasswordHash, version };
  }
  async function limited(key, maximum, duration) {
    if (!await database.consumeLimit(digest(key), maximum, duration, now())) throw httpError(429, "Too many attempts. Please try again later.");
  }
  async function sessionFor(req) {
    const token = String(req.headers.cookie || "").split(";").map((part) => part.trim()).find((part) => part.startsWith("bt_admin="))?.slice(9);
    if (!/^[a-f0-9]{64}$/.test(token || "")) return {};
    const current = await credentials();
    return { token, current, session: await database.getSession(digest(token), current.version, now()) };
  }
  const cookie = (token, age) => `bt_admin=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${config.secureCookie ? "; Secure" : ""}`;
  return async function handleApi(req, res, url) {
    const send = (status, data, headers = {}) => {
      res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...headers });
      res.end(JSON.stringify(data));
    };
    try {
      const ip = getClientIp(req, config.trustedProxies);
      if (url.pathname === "/api/footer" && req.method === "GET") {
        try {
          const state = await database.getFooterState();
          try { await footerCache?.write(state.settings, state.revision); } catch { logger.write("footer_cache_failure"); }
          send(200, state.settings);
        } catch (error) {
          const cached = await footerCache?.read();
          if (!cached) throw error;
          logger.write("footer_cache_used");
          send(200, cached);
        }
        return;
      }
      if (url.pathname === "/api/health" && req.method === "GET") {
        await database.health();
        send(200, { status: "ok" });
        return;
      }
      if (req.method !== "GET" && req.headers.origin) {
        let origin;
        try { origin = new URL(req.headers.origin); } catch { throw httpError(403, "Invalid request origin."); }
        if (origin.host !== req.headers.host) throw httpError(403, "Cross-site requests are not allowed.");
      }
      if (url.pathname === "/api/contact-messages" && req.method === "POST") {
        await limited(`contact:${ip}`, 10, 10 * 60 * 1000);
        const message = validateMessage(await readJson(req));
        const saved = await database.addMessage(message);
        logger.write("contact_saved", { id: saved.id, duplicate: saved.duplicate });
        send(saved.duplicate ? 200 : 201, { success: true, id: saved.id });
        return;
      }
      if (url.pathname === "/api/admin/login" && req.method === "POST") {
        const body = await readJson(req);
        const loginKey = `login:${ip}:${body.username === config.adminUsername ? "admin" : "unknown"}`;
        await limited(loginKey, 5, 15 * 60 * 1000);
        if (typeof body.username !== "string" || typeof body.password !== "string" || body.password.length > 256) throw httpError(401, "نام کاربری یا رمز عبور درست نیست.");
        const current = await credentials();
        const correctPassword = await verifyPassword(body.password, current.passwordHash);
        if (body.username !== config.adminUsername || !correctPassword) throw httpError(401, "نام کاربری یا رمز عبور درست نیست.");
        // Successful authentication clears its reservation and previous failures.
        await database.resetLimit(digest(loginKey), now());
        const previous = await sessionFor(req);
        if (previous.token) await database.revokeSession(digest(previous.token));
        const token = randomBytes(32).toString("hex");
        const csrf = randomBytes(32).toString("hex");
        await database.saveSession(digest(token), { username: config.adminUsername, csrf, expires: now() + SESSION_LIFETIME, version: current.version });
        logger.write("admin_login", { success: true });
        send(200, { username: config.adminUsername, csrf }, { "Set-Cookie": cookie(token, SESSION_LIFETIME / 1000) });
        return;
      }
      if (url.pathname.startsWith("/api/admin/")) {
        const { token, session, current } = await sessionFor(req);
        if (!session || session.expires <= now()) throw httpError(401, "لطفاً وارد پنل شوید.");
        if (req.method !== "GET") {
          const csrf = String(req.headers["x-csrf-token"] || "");
          if (!/^[a-f0-9]{64}$/.test(csrf) || !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))) throw httpError(403, "درخواست معتبر نیست؛ صفحه را دوباره باز کنید.");
        }
        if (url.pathname === "/api/admin/password" && req.method === "POST") {
          const key = `password:${ip}:${session.username}`;
          await limited(key, 5, 15 * 60 * 1000);
          const body = await readJson(req);
          if (typeof body.currentPassword !== "string" || body.currentPassword.length > 256 || typeof body.newPassword !== "string" || body.newPassword.length < 8 || body.newPassword.length > 128 || body.newPassword !== body.confirmPassword) throw httpError(422, "رمز جدید باید بین ۸ تا ۱۲۸ کاراکتر باشد و با تکرار آن مطابقت داشته باشد.");
          if (!await verifyPassword(body.currentPassword, current.passwordHash)) throw httpError(422, "رمز فعلی درست نیست.");
          if (body.currentPassword === body.newPassword) throw httpError(422, "رمز جدید باید با رمز فعلی متفاوت باشد.");
          await database.changeAdminPassword(session.username, version, current.revision, await hashPasswordAsync(body.newPassword));
          try { await database.resetLimit(digest(key), now()); } catch { logger.write("password_limit_reset_unavailable"); }
          logger.write("admin_password_changed", { success: true });
          send(200, { success: true }, { "Set-Cookie": cookie("", 0) });
        } else if (url.pathname === "/api/admin/footer" && req.method === "GET") {
          send(200, await database.getFooterState());
        } else if (url.pathname === "/api/admin/footer" && req.method === "PUT") {
          const body = await readJson(req);
          if (typeof body.revision !== "string" || !/^\d{1,20}$/.test(body.revision)) throw httpError(422, "شماره نسخهٔ فوتر معتبر نیست؛ صفحه را تازه کنید.");
          const value = validateFooter(body.settings);
          const state = await database.saveFooter(value, body.revision);
          try { await footerCache?.write(state.settings, state.revision); } catch { logger.write("footer_cache_failure"); }
          logger.write("footer_saved", { success: true });
          send(200, state);
        } else if (url.pathname === "/api/admin/footer/history" && req.method === "GET") {
          const before = url.searchParams.get("before");
          if (before && !/^\d{1,20}$/.test(before)) throw httpError(400, "Invalid history cursor.");
          send(200, { versions: await database.footerHistory(before) });
        } else if (url.pathname === "/api/admin/session" && req.method === "GET") {
          send(200, { username: session.username, csrf: session.csrf });
        } else if (url.pathname === "/api/admin/messages" && req.method === "GET") {
          const page = Number(url.searchParams.get("page") || 1);
          if (!Number.isSafeInteger(page) || page < 1 || page > 1000000) throw httpError(400, "Invalid page.");
          const snapshot = url.searchParams.get("snapshot") || null;
          if (snapshot && !/^\d{1,20}$/.test(snapshot)) throw httpError(400, "Invalid snapshot.");
          send(200, await database.listMessages(page, 20, snapshot));
        } else if (url.pathname === "/api/admin/logout" && req.method === "POST") {
          await database.revokeSession(digest(token));
          logger.write("admin_logout", { success: true });
          send(200, { success: true }, { "Set-Cookie": cookie("", 0) });
        } else {
          throw httpError(404, "API route not found.");
        }
        return;
      }
      throw httpError(404, "API route not found.");
    } catch (error) {
      logger.write(error.status ? "api_rejected" : "api_failure", { route: /^\/api\/(contact-messages|footer|admin\/(login|logout|session|messages|footer)|health)$/.test(url.pathname) ? url.pathname : "/api/unknown", status: error.status || 503, code: error.code || error.name });
      if (!error.status) console.error("Contact API failure:", error.code || error.name);
      send(error.status || 503, { error: error.status ? error.message : "Service temporarily unavailable. Your message has not been confirmed; please try again." });
    }
  };
}
