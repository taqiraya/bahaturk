import { readDraft, keepDraft, footerDraftKey } from "../../api/drafts";
import { useUnsavedChanges } from "../../hooks/useUnsavedChanges";
import { useEffect, useRef, useState } from "react";
import { contactRequest } from "../../api/contact";
import { rememberFooter } from "../../api/footer";
import styles from "./Admin.module.css";

const fields = [
  ["address", "آدرس کسب‌وکار", "text", 300],
  ["mapUrl", "لینک گوگل مپ", "url", 2048],
  ["phone1", "شماره تماس اول", "tel", 40],
  ["phone2", "شماره تماس دوم", "tel", 40],
  ["email", "ایمیل کسب‌وکار", "email", 254],
  ["facebook", "لینک فیسبوک", "url", 2048],
  ["instagram", "لینک اینستاگرام", "url", 2048],
  ["youtube", "لینک یوتیوب", "url", 2048],
];

export default function FooterSettings({ csrf, username, onDirtyChange }) {
  const storageKey = footerDraftKey(username);
  const draft = useRef(readDraft(storageKey));
  const usable = draft.current?.dirty && draft.current.settings && typeof draft.current.revision === "string" && fields.every(([key]) => typeof draft.current.settings[key] === "string");
  const baseSettings = useRef(usable ? draft.current.baseSettings : null);
  const [value, setValue] = useState(usable ? draft.current.settings : null);
  const [dirty, setDirty] = useState(Boolean(usable));
  const [loadingSettings, setLoadingSettings] = useState(false);
  useUnsavedChanges(dirty, "تغییرات هنوز ذخیره نشده است. از این صفحه خارج شوید؟");
  useEffect(() => { onDirtyChange?.(dirty); return () => onDirtyChange?.(false); }, [dirty, onDirtyChange]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [retry, setRetry] = useState(0);
  const [revision, setRevision] = useState(usable ? draft.current.revision : "0");
  const [history, setHistory] = useState([]);
  const [moreHistory, setMoreHistory] = useState(false);
  const [conflict, setConflict] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const historyRequest = useRef(null);
  useEffect(() => () => historyRequest.current?.abort(), []);
  async function loadHistory(older = false) {
    if (historyRequest.current || (older && !history.length)) return;
    const controller = new AbortController(); historyRequest.current = controller; setHistoryBusy(true);
    try {
      const suffix = older ? `?before=${history.at(-1).revision}` : "";
      const { versions } = await contactRequest(`/admin/footer/history${suffix}`, { signal: controller.signal });
      if (controller.signal.aborted || historyRequest.current !== controller) return;
      setHistory((previous) => [...new Map([...(older ? previous : []), ...versions].map((entry) => [entry.revision, entry])).values()]);
      setMoreHistory(versions.length === 20);
    } catch (failure) { if (!controller.signal.aborted) setError(failure.message); }
    finally { if (historyRequest.current === controller) { historyRequest.current = null; setHistoryBusy(false); } }
  }
  function changeSettings(settings) {
    const changed = !baseSettings.current || fields.some(([key]) => settings[key] !== baseSettings.current[key]);
    setValue(settings); setDirty(changed); setSaved(false);
    draft.current = { settings, revision, baseSettings: baseSettings.current, dirty: changed };
    if (!keepDraft(storageKey, draft.current)) setError("مرورگر پیش‌نویس را ذخیره نکرد؛ تا ذخیرهٔ نهایی، این صفحه را باز نگه دارید.");
  }
  useEffect(() => {
    const controller = new AbortController();
    setError(""); setLoadingSettings(true);
    contactRequest("/admin/footer", { signal: controller.signal }).then((state) => {
      if (controller.signal.aborted) return;
      if (retry === 0 && draft.current?.dirty && draft.current.settings && fields.every(([key]) => typeof draft.current.settings[key] === "string")) {
        baseSettings.current = draft.current.baseSettings || state.settings;
        setValue(draft.current.settings); setRevision(draft.current.revision); setDirty(true);
        const stale = draft.current.revision !== state.revision; setConflict(stale);
        if (stale) setError("پیش‌نویس شما محفوظ است؛ اطلاعات ذخیره‌شده در تب دیگری تغییر کرده. آخرین نسخه را دریافت و تغییرات خود را دوباره اعمال کنید.");
      } else {
        baseSettings.current = state.settings; setValue(state.settings); setRevision(state.revision); setConflict(false); setDirty(false);
        draft.current = { settings: state.settings, revision: state.revision, baseSettings: state.settings, dirty: false };
        keepDraft(storageKey, draft.current);
      }
    }).catch((failure) => { if (!controller.signal.aborted) setError(failure.message); }).finally(() => { if (!controller.signal.aborted) setLoadingSettings(false); });
    return () => controller.abort();
  }, [retry, storageKey]);
  async function save(event) {
    event.preventDefault();
    if (busy || loadingSettings) return;
    setBusy(true); setError(""); setSaved(false);
    try {
      const state = await contactRequest("/admin/footer", { method: "PUT", headers: { "X-CSRF-Token": csrf }, body: JSON.stringify({ settings: value, revision }) });
      historyRequest.current?.abort(); historyRequest.current = null; setHistoryBusy(false);
      baseSettings.current = state.settings; setDirty(false);
      draft.current = { settings: state.settings, revision: state.revision, baseSettings: state.settings, dirty: false }; keepDraft(storageKey, draft.current);
      setValue(state.settings); setRevision(state.revision); rememberFooter(state.settings); setSaved(true); setHistory([]); setMoreHistory(false);
    } catch (failure) { setError(failure.message); if (failure.status === 409) setConflict(true); }
    finally { setBusy(false); }
  }
  return <section className={styles.settings} aria-label="تنظیمات فوتر">
    <h2>ویرایش اطلاعات فوتر</h2>
    <p className={styles.hint}>اطلاعات تماس و لینک‌ها را ویرایش کنید و ذخیره را بزنید.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {conflict && <button onClick={() => { if (window.confirm("متن ویرایش‌شدهٔ این فرم با آخرین نسخهٔ ذخیره‌شده جایگزین شود؟")) setRetry((n) => n + 1); }}>دریافت آخرین نسخه</button>}
    {!value ? <button onClick={() => setRetry((n) => n + 1)}>دریافت اطلاعات فوتر</button> : <form onSubmit={save}>
      <div className={styles.settingsGrid}>{fields.map(([key, label, type, maxLength]) => <label key={key} htmlFor={`footer-${key}`}>
        {label}<input id={`footer-${key}`} type={type} maxLength={maxLength} required dir={key === "address" ? "auto" : "ltr"} value={value[key]} disabled={busy || loadingSettings} onChange={(e) => { changeSettings({ ...value, [key]: e.target.value }); }} />
      </label>)}</div>
      <button disabled={busy || loadingSettings}>{busy ? "در حال ذخیره…" : "ذخیره اطلاعات فوتر"}</button>
      {saved && <p role="status">اطلاعات فوتر ذخیره شد.</p>}
    </form>}
    {value && <div className={styles.history}>
      <button type="button" disabled={busy || loadingSettings || historyBusy} onClick={() => { void loadHistory(); }}>نمایش نسخه‌های قبلی فوتر</button>
      {history.map((entry) => <p key={entry.revision}>
        نسخهٔ {entry.revision} — {new Date(entry.createdAt).toLocaleString("fa-IR")}{" "}
        <button type="button" disabled={busy} onClick={() => {
          if (window.confirm("اطلاعات این نسخه در فرم قرار بگیرد؟ برای اعمال آن باید ذخیره را بزنید.")) { changeSettings(entry.settings); }
        }}>انتخاب این نسخه</button>
      </p>)}
      {moreHistory && <button type="button" disabled={busy || loadingSettings || historyBusy} onClick={() => { void loadHistory(true); }}>نسخه‌های قدیمی‌تر</button>}
    </div>}
  </section>;
}
