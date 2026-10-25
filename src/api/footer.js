import { useEffect, useState } from "react";
import { contactRequest } from "./contact";
import { DEFAULT_FOOTER, validateFooter } from "../../shared/footer-settings.js";

const cacheKey = `bahaturk-footer:${import.meta.env.BASE_URL}`;
export function readConfirmedFooter() {
  try {
    const snapshot = document.getElementById("bt-footer-snapshot");
    if (snapshot) {
      const settings = validateFooter(JSON.parse(snapshot.textContent));
      rememberFooter(settings);
      snapshot.remove(); // Later route changes use the newer confirmed browser value.
      return settings;
    }
  } catch { /* Fall back to the browser's last confirmed snapshot. */ }
  for (const key of [...new Set([cacheKey, "bahaturk-footer:/BahaTurk/"])]) {
    try { return validateFooter(JSON.parse(localStorage.getItem(key))); } catch { /* Try the retained cache from the previous URL. */ }
  }
  return DEFAULT_FOOTER;
}
export function rememberFooter(value) {
  try { localStorage.setItem(cacheKey, JSON.stringify(validateFooter(value))); } catch { /* Restricted browser storage must not interrupt display. */ }
  try { window.dispatchEvent(new CustomEvent("bt:footer-updated", { detail: validateFooter(value) })); } catch { /* Server rendering has no browser event target. */ }
}

export function useFooter() {
  const [value, setValue] = useState(readConfirmedFooter);
  useEffect(() => {
    const controller = new AbortController();
    let pending = false;
    const refresh = async () => {
      if (pending || document.hidden) return;
      pending = true;
      try {
        const settings = validateFooter(await contactRequest("/footer", { signal: controller.signal }));
        if (!controller.signal.aborted) { rememberFooter(settings); setValue(settings); }
      } catch { /* Retain the last confirmed values while the service is unavailable. */ }
      finally { pending = false; }
    };
    void refresh();
    const timer = setInterval(refresh, 30000);
    window.addEventListener("focus", refresh);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener("focus", refresh); };
  }, []);
  return value;
}
