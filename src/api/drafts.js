const migrations = new Map();
let tabId;
try {
  tabId = sessionStorage.getItem("bahaturk-draft-tab");
  if (!tabId) { tabId = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join(""); sessionStorage.setItem("bahaturk-draft-tab", tabId); }
} catch { tabId = `memory-${Date.now()}-${Math.random().toString(36).slice(2)}`; }

const isContact = (key) => key.startsWith("bahaturk-contact-draft:");
const storeFor = (key) => isContact(key) ? sessionStorage : localStorage;

// Move legacy contact drafts before removing persistent copies. Preserve any
// unsent version if temporary storage is full or unavailable.
export function migrateContactDrafts() {
  try {
    const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)).filter((key) => typeof key === "string" && isContact(key));
    for (const key of keys) {
      const raw = localStorage.getItem(key);
      let value;
      try { value = JSON.parse(raw); } catch { continue; }
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      if (value.submitted) value = { submitted: true, updatedAt: value.updatedAt };
      const previous = sessionStorage.getItem(key);
      if (previous && previous !== JSON.stringify(value)) {
        sessionStorage.setItem(key + ":legacy", JSON.stringify(value));
      } else sessionStorage.setItem(key, JSON.stringify(value));
      localStorage.removeItem(key);
    }
    return true;
  } catch { return false; }
}

export function readDraft(key) {
  try {
    if (isContact(key)) migrateContactDrafts();
    const storage = storeFor(key);
    const parse = (name) => { try { const value = JSON.parse(storage.getItem(name)); return value && typeof value === "object" && !Array.isArray(value) ? value : null; } catch { return null; } };
    const own = parse(key);
    if (own) return own;
    const oldKey = import.meta.env.BASE_URL === "/" ? key.replace(":/:", ":/BahaTurk/:") : key;
    if (oldKey !== key) { const old = parse(oldKey); if (old) return old; }
    const prefix = key.split(":tab:")[0];
    const prefixes = [...new Set([prefix, oldKey.split(":tab:")[0]])];
    let latest = null;
    for (let i = 0; i < storage.length; i++) {
      const name = storage.key(i);
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
    const storage = storeFor(key);
    const safe = isContact(key) && value.submitted ? { submitted: true } : value;
    storage.setItem(key, JSON.stringify({ ...safe, updatedAt: Date.now() }));
    if (isContact(key) && value.submitted && value.requestId) {
      for (let i = 0; i < storage.length; i++) {
        const name = storage.key(i);
        if (typeof name !== "string" || !isContact(name)) continue;
        let old;
        try { old = JSON.parse(storage.getItem(name)); } catch { continue; }
        if (old?.requestId === value.requestId) storage.setItem(name, JSON.stringify({ submitted: true, updatedAt: Date.now() }));
      }
    }
    const legacy = migrations.get(key);
    if (legacy) {
      const previous = JSON.parse(storage.getItem(legacy));
      storage.setItem(legacy, JSON.stringify({ ...previous, migratedTo: key }));
      migrations.delete(key);
    }
    return true;
  }
  catch { return false; }
}
export function footerDraftKey(username) { return `bahaturk-footer-draft:${import.meta.env.BASE_URL}:${username}:tab:${tabId}`; }
export const contactDraftKey = `bahaturk-contact-draft:${import.meta.env.BASE_URL}:tab:${tabId}`;
