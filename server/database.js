import { DEFAULT_FOOTER } from "../shared/footer-settings.js";
import mysql from "mysql2/promise";

// Connect only when an API operation needs MySQL. A database outage must not
// prevent the public website or the admin login page from loading.
export function createResilientDatabase(config, connect = connectDatabase, retryDelay = 3000) {
  let repository;
  let pending;
  let retryAfter = 0;
  let closed = false;
  async function ready() {
    if (closed) throw new Error("Database service is closed.");
    if (repository) return repository;
    if (Date.now() < retryAfter) throw new Error("Database is temporarily unavailable.");
    pending ||= connect(config).then(async (value) => {
      if (closed) { await value.close(); throw new Error("Database service is closed."); }
      repository = value;
      return value;
    }).catch((error) => {
      retryAfter = Date.now() + retryDelay;
      throw error;
    }).finally(() => { pending = null; });
    return pending;
  }
  return {
    async addMessage(input) { return (await ready()).addMessage(input); },
    async listMessages(page, size, snapshot) { return (await ready()).listMessages(page, size, snapshot); },
    async consumeLimit(...args) { return (await ready()).consumeLimit(...args); },
    async saveSession(...args) { return (await ready()).saveSession(...args); },
    async getSession(...args) { return (await ready()).getSession(...args); },
    async revokeSession(...args) { return (await ready()).revokeSession(...args); },
    async getAdminCredentials(...args) { return (await ready()).getAdminCredentials(...args); },
    async changeAdminPassword(...args) { return (await ready()).changeAdminPassword(...args); },
    async getFooter() { return (await ready()).getFooter(); },
    async getFooterState() { return (await ready()).getFooterState(); },
    async footerHistory(before) { return (await ready()).footerHistory(before); },
    async saveFooter(...args) { return (await ready()).saveFooter(...args); },
    async resetLimit(...args) { return (await ready()).resetLimit(...args); },
    async storageStats() { return (await ready()).storageStats(); },
    async health() { return (await ready()).health(); },
    async close() {
      closed = true;
      try { await pending; } catch { /* No connection was established. */ }
      await repository?.close();
    },
  };
}

export async function connectDatabase(config) {
  const { database, ...connectionOptions } = config;
  // The name is validated before interpolation; all user data uses parameters.
  if (!/^[a-zA-Z0-9_]{1,64}$/.test(database)) throw new Error("Invalid database name.");
  const connection = await mysql.createConnection(connectionOptions);
  try {
    const [rows] = await connection.execute("SELECT SCHEMA_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?", [database]);
    if (!rows.length) await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await connection.end();
  }
  const pool = mysql.createPool(config);
  try {
    // Additive setup only: no DROP, TRUNCATE, UPDATE, DELETE or import of db.json.
    await pool.query(`CREATE TABLE IF NOT EXISTS bt_contact_messages (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      request_id CHAR(36) NOT NULL UNIQUE,
      full_name VARCHAR(150) NOT NULL,
      phone_number VARCHAR(40) NOT NULL DEFAULT '',
      email_address VARCHAR(254) NOT NULL,
      subject VARCHAR(200) NOT NULL DEFAULT '',
      message TEXT NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_created_at (created_at, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
    await pool.query(`CREATE TABLE IF NOT EXISTS bt_footer_revisions (id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY, settings LONGTEXT NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS bt_admin_sessions (
      token_hash CHAR(64) NOT NULL PRIMARY KEY,
      username VARCHAR(150) NOT NULL,
      csrf CHAR(64) NOT NULL,
      credential_version CHAR(64) NOT NULL,
      expires_at BIGINT NOT NULL,
      revoked TINYINT NOT NULL DEFAULT 0
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS bt_request_limits (
      limit_key CHAR(64) NOT NULL PRIMARY KEY,
      window_start BIGINT NOT NULL,
      attempts INT UNSIGNED NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    await pool.query(`CREATE TABLE IF NOT EXISTS bt_admin_credentials (
      id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(150) NOT NULL,
      base_version CHAR(64) NOT NULL,
      password_hash VARCHAR(200) NOT NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      INDEX idx_admin_base (username, base_version, id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  } catch (error) {
    await pool.end();
    throw error;
  }
  return createContactRepository(pool);
}

export function createContactRepository(pool) {
  return {
    async addMessage(input) {
      const values = [input.requestId, input.fullName, input.phoneNumber, input.emailAddress, input.subject, input.message];
      try {
        const [result] = await pool.execute(
          "INSERT INTO bt_contact_messages (request_id, full_name, phone_number, email_address, subject, message, created_at) VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(3))", values,
        );
        return { id: String(result.insertId), duplicate: false };
      } catch (error) {
        if (error.code !== "ER_DUP_ENTRY") throw error;
        const [rows] = await pool.execute("SELECT id, full_name, phone_number, email_address, subject, message FROM bt_contact_messages WHERE request_id = ?", [input.requestId]);
        const row = rows[0];
        if (!row || [row.full_name, row.phone_number, row.email_address, row.subject, row.message].some((v, i) => v !== values[i + 1])) {
          const conflict = new Error("This submission key belongs to a different message. Please submit again.");
          conflict.status = 409;
          throw conflict;
        }
        return { id: String(row.id), duplicate: true };
      }
    },
    async listMessages(page = 1, pageSize = 20, snapshot = null) {
      if (!snapshot) {
        const [last] = await pool.query("SELECT CAST(COALESCE(MAX(id), 0) AS CHAR) AS snapshot FROM bt_contact_messages");
        snapshot = String(last[0].snapshot);
      }
      const [counts] = await pool.execute("SELECT COUNT(*) AS total FROM bt_contact_messages WHERE id <= ?", [snapshot]);
      const [rows] = await pool.query(
        "SELECT id, full_name AS fullName, phone_number AS phoneNumber, email_address AS emailAddress, subject, message, created_at AS createdAt FROM bt_contact_messages WHERE id <= ? ORDER BY id DESC LIMIT ? OFFSET ?",
        [snapshot, pageSize, (page - 1) * pageSize],
      );
      return { messages: rows.map((row) => ({ ...row, id: String(row.id) })), total: Number(counts[0].total), page, pageSize, snapshot };
    },
    async consumeLimit(key, maximum, duration, now) {
      // Atomic across every Node worker; retain the row when its window rolls over.
      const [result] = await pool.execute(`INSERT INTO bt_request_limits (limit_key, window_start, attempts) VALUES (?, ?, 1)
        ON DUPLICATE KEY UPDATE
        attempts = IF(window_start <= ?, 1, IF(attempts < ?, attempts + 1, attempts)),
        window_start = IF(window_start <= ?, ?, window_start)`,
      [key, now, now - duration, maximum, now - duration, now]);
      // FOUND_ROWS is disabled for this pool: a no-op means the quota was full.
      return result.affectedRows > 0;
    },
    async resetLimit(key, now) {
      await pool.execute("UPDATE bt_request_limits SET attempts = 0, window_start = ? WHERE limit_key = ?", [now, key]);
    },
    async saveSession(token, session) {
      await pool.execute("INSERT INTO bt_admin_sessions (token_hash, username, csrf, credential_version, expires_at) VALUES (?, ?, ?, ?, ?)", [token, session.username, session.csrf, session.version, session.expires]);
    },
    async getSession(token, version, now) {
      const [rows] = await pool.execute("SELECT username, csrf, expires_at AS expires FROM bt_admin_sessions WHERE token_hash = ? AND credential_version = ? AND revoked = 0 AND expires_at > ?", [token, version, now]);
      return rows[0] || null;
    },
    async revokeSession(token) {
      await pool.execute("UPDATE bt_admin_sessions SET revoked = 1 WHERE token_hash = ?", [token]);
    },
    async getAdminCredentials(username, baseVersion) {
      const [rows] = await pool.execute("SELECT CAST(id AS CHAR) AS revision, password_hash AS passwordHash FROM bt_admin_credentials WHERE username = ? AND base_version = ? ORDER BY id DESC LIMIT 1", [username, baseVersion]);
      return rows[0] || null;
    },
    async changeAdminPassword(username, baseVersion, expectedRevision, passwordHash) {
      const connection = pool.getConnection ? await pool.getConnection() : pool;
      let acquired = false;
      let destroyed = false;
      try {
        const [locks] = await connection.query("SELECT GET_LOCK(CONCAT('bt-admin:', LEFT(SHA2(DATABASE(), 256), 40)), 5) AS acquired");
        if (Number(locks[0].acquired) !== 1) throw Object.assign(new Error("تغییر رمز در حال انجام است؛ دوباره تلاش کنید."), { status: 409 });
        acquired = true;
        const [rows] = await connection.execute("SELECT CAST(id AS CHAR) AS revision FROM bt_admin_credentials WHERE username = ? AND base_version = ? ORDER BY id DESC LIMIT 1", [username, baseVersion]);
        if ((rows[0]?.revision || "0") !== expectedRevision) throw Object.assign(new Error("رمز در نشست دیگری تغییر کرده است؛ دوباره وارد شوید."), { status: 409 });
        const [result] = await connection.execute("INSERT INTO bt_admin_credentials (username, base_version, password_hash) VALUES (?, ?, ?)", [username, baseVersion, passwordHash]);
        return { revision: String(result.insertId), passwordHash };
      } finally {
        if (acquired) { try { await connection.query("SELECT RELEASE_LOCK(CONCAT('bt-admin:', LEFT(SHA2(DATABASE(), 256), 40)))"); } catch { connection.destroy(); destroyed = true; } }
        if (pool.getConnection && !destroyed) connection.release();
      }
    },
    async getFooterState() {
      const [rows] = await pool.query("SELECT CAST(id AS CHAR) AS revision, settings FROM bt_footer_revisions ORDER BY id DESC LIMIT 1");
      return rows.length ? { revision: rows[0].revision, settings: JSON.parse(rows[0].settings) } : { revision: "0", settings: { ...DEFAULT_FOOTER } };
    },
    async getFooter() { return (await this.getFooterState()).settings; },
    async footerHistory(before = null) {
      const [rows] = await pool.query(`SELECT CAST(id AS CHAR) AS revision, settings, created_at AS createdAt FROM bt_footer_revisions ${before ? "WHERE id < ?" : ""} ORDER BY id DESC LIMIT 20`, before ? [before] : []);
      return rows.map((row) => ({ ...row, settings: JSON.parse(row.settings) }));
    },
    async saveFooter(value, expectedRevision) {
      // A connection-owned lock serializes revision checks across Node workers.
      // A single INSERT keeps history intact; no edits or deletes of prior values.
      const connection = pool.getConnection ? await pool.getConnection() : pool;
      let locked = false;
      try {
        const [lock] = await connection.query("SELECT GET_LOCK(SHA2(CONCAT(DATABASE(), ':footer'), 256), 5) AS acquired");
        if (Number(lock[0].acquired) !== 1) throw new Error("Footer is busy.");
        locked = true;
        const [rows] = await connection.query("SELECT CAST(COALESCE(MAX(id), 0) AS CHAR) AS revision FROM bt_footer_revisions");
        if (String(expectedRevision) !== rows[0].revision) throw Object.assign(new Error("اطلاعات فوتر در تب دیگری تغییر کرده است؛ آخرین نسخه را دریافت و تغییرات خود را دوباره اعمال کنید."), { status: 409 });
        if (rows[0].revision === "0") await connection.execute("INSERT INTO bt_footer_revisions (settings, created_at) VALUES (?, UTC_TIMESTAMP(3))", [JSON.stringify(DEFAULT_FOOTER)]);
        const [result] = await connection.execute("INSERT INTO bt_footer_revisions (settings, created_at) VALUES (?, UTC_TIMESTAMP(3))", [JSON.stringify(value)]);
        return { revision: String(result.insertId), settings: value };
      } finally {
        if (locked) await connection.query("SELECT RELEASE_LOCK(SHA2(CONCAT(DATABASE(), ':footer'), 256))");
        if (pool.getConnection) connection.release();
      }
    },
    async storageStats() {
      const [tables] = await pool.query("SELECT COALESCE(SUM(data_length + index_length), 0) AS bytes FROM information_schema.TABLES WHERE table_schema = DATABASE() AND table_name IN ('bt_admin_sessions', 'bt_request_limits', 'bt_footer_revisions', 'bt_contact_messages', 'bt_admin_credentials')");
      const [sessions] = await pool.execute("SELECT COUNT(*) AS count FROM bt_admin_sessions WHERE revoked = 1 OR expires_at <= ?", [Date.now()]);
      return { databaseBytes: Number(tables[0].bytes), retiredSessions: Number(sessions[0].count) };
    },
    async health() { await pool.query("SELECT 1"); return true; },
    close: () => pool.end(),
  };
}
