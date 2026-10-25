const migrations = new Map();
let tabId;
try {
  tabId = sessionStorage.getItem("bahaturk-draft-tab");
  if (!tabId) { tabId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join(""); sessionStorage.setItem("bahaturk-draft-tab", tabId); }
} catch { tabId = `memory-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export function readDraft(key) {
  try {
    const parse = (name) => { try { const value = JSON.parse(localStorage.getItem(name)); return value && typeof value === "object" && !Array.isArray(value) ? value : null; } catch { return null; } };
    const own = parse(key);
    if (own) return own;
    const oldKey = import.meta.env.BASE_URL === "/" ? key.replace(":/:", ":/BahaTurk/:") : key;
    if (oldKey !== key) { const old = parse(oldKey); if (old) return old; }
    const prefix = key.split(":tab:")[0];
    const prefixes = [...new Set([prefix, oldKey.split(":tab:")[0]])];
    let latest = null;
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (typeof name !== "string") continue;
      if (!prefixes.some((candidate) => name === candidate || name.startsWith(candidate + ":tab:"))) continue;
      const value = parse(name);
      if (!value || value.migratedTo || !(value.dirty || (value.form && value.submitted === false))) continue;
      if (!latest || (value.updatedAt || 0) > (latest.value.updatedAt || 0)) latest = { name, value };
    }
    if (latest && latest.name === prefix) migrations.set(key, latest.name);
    return latest?.value || null;
  }
  catch { return null; }
}
export function keepDraft(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ ...value, updatedAt: Date.now() }));
    const legacy = migrations.get(key);
    if (legacy) {
      const previous = JSON.parse(localStorage.getItem(legacy));
      localStorage.setItem(legacy, JSON.stringify({ ...previous, migratedTo: key }));
      migrations.delete(key);
    }
    return true;
  }
  catch { return false; }
}
export function footerDraftKey(username) { return `bahaturk-footer-draft:${import.meta.env.BASE_URL}:${username}:tab:${tabId}`; }
export const contactDraftKey = `bahaturk-contact-draft:${import.meta.env.BASE_URL}:tab:${tabId}`;
