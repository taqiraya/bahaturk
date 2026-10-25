import { DEFAULT_FOOTER } from "../../shared/footer-settings.js";
// Test-only shared store. Production always uses the MySQL repository.
export function createMemoryDatabase() {
  const rows = [];
  const revisions = [];
  const sessions = new Map();
  const limits = new Map();
  const credentials = [];
  return {
    rows,
    fail: false,
    async addMessage(input) {
      if (this.fail) throw new Error("database offline");
      const previous = rows.find((item) => item.requestId === input.requestId);
      if (previous) return { id: previous.id, duplicate: true };
      const row = { ...input, id: String(rows.length + 1), createdAt: new Date().toISOString() };
      rows.push(row);
      return { id: row.id, duplicate: false };
    },
    async listMessages(page = 1, pageSize = 20, snapshot = null) {
      snapshot ??= String(rows.length);
      const selected = rows.filter((item) => Number(item.id) <= Number(snapshot)).toReversed();
      return { messages: selected.slice((page - 1) * pageSize, page * pageSize), total: selected.length, page, pageSize, snapshot };
    },
    async consumeLimit(key, max, duration, now) {
      const old = limits.get(key);
      const value = old && old.until > now ? old : { count: 0, until: now + duration };
      if (value.count >= max) return false;
      value.count++;
      limits.set(key, value);
      return true;
    },
    async resetLimit(key, now) { limits.set(key, { count: 0, until: now + 15 * 60 * 1000 }); },
    async saveSession(token, value) { sessions.set(token, { ...value, revoked: false }); },
    async getSession(token, version, now) {
      const session = sessions.get(token);
      return session && !session.revoked && session.expires > now && session.version === version ? session : null;
    },
    async revokeSession(token) { if (sessions.has(token)) sessions.get(token).revoked = true; },
    async getAdminCredentials(username, baseVersion) { return credentials.findLast((row) => row.username === username && row.baseVersion === baseVersion) || null; },
    async changeAdminPassword(username, baseVersion, expectedRevision, passwordHash) {
      const latest = credentials.findLast((row) => row.username === username && row.baseVersion === baseVersion);
      if ((latest?.revision || "0") !== expectedRevision) throw Object.assign(new Error("Password changed concurrently"), { status: 409 });
      const row = { username, baseVersion, revision: String(credentials.length + 1), passwordHash }; credentials.push(row); return row;
    },
    async getFooterState() { if (this.fail) throw new Error("database offline"); return { revision: String(revisions.length), settings: { ...(revisions.at(-1) || DEFAULT_FOOTER) } }; },
    async getFooter() { return (await this.getFooterState()).settings; },
    async footerHistory(before = null) { return revisions.map((settings, i) => ({ settings, revision: String(i + 1), createdAt: new Date().toISOString() })).toReversed().filter((row) => !before || Number(row.revision) < Number(before)).slice(0, 20); },
    async saveFooter(value, expected) {
      if (expected !== String(revisions.length)) throw Object.assign(new Error("Footer changed in another tab."), { status: 409 });
      if (!revisions.length) revisions.push({ ...DEFAULT_FOOTER });
      revisions.push({ ...value }); return this.getFooterState();
    },
    async storageStats() { return { databaseBytes: 0, retiredSessions: 0 }; },
    async health() { if (this.fail) throw new Error("database offline"); return true; },
    async close() {},
  };
}
