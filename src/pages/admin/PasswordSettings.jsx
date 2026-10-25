import { useState } from "react";
import { contactRequest } from "../../api/contact";
import styles from "./Admin.module.css";

export default function PasswordSettings({ csrf, onChanged }) {
  const [value, setValue] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function save(event) {
    event.preventDefault();
    if (busy) return;
    if (value.newPassword !== value.confirmPassword) { setError("تکرار رمز جدید مطابقت ندارد."); return; }
    setBusy(true); setError("");
    try {
      await contactRequest("/admin/password", { method: "POST", headers: { "X-CSRF-Token": csrf }, body: JSON.stringify(value) });
      setValue({ currentPassword: "", newPassword: "", confirmPassword: "" });
      onChanged();
    } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  return <section className={`${styles.settings} ${styles.passwordSettings}`} aria-label="تغییر رمز ادمین">
    <h2>تغییر رمز ادمین</h2>
    <p className={styles.hint}>رمز جدید باید حداقل ۸ کاراکتر باشد. پس از ذخیره، با رمز جدید دوباره وارد شوید.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <form onSubmit={save}>
      <div className={styles.passwordFields}>{[["currentPassword", "رمز فعلی", "current-password"], ["newPassword", "رمز جدید", "new-password"], ["confirmPassword", "تکرار رمز جدید", "new-password"]].map(([key, label, autoComplete]) => <label key={key} htmlFor={`admin-${key}`}>{label}<input id={`admin-${key}`} type="password" autoComplete={autoComplete} dir="ltr" required minLength={key === "currentPassword" ? undefined : 8} maxLength={key === "currentPassword" ? 256 : 128} disabled={busy} value={value[key]} onChange={(event) => setValue((previous) => ({ ...previous, [key]: event.target.value }))} /></label>)}</div>
      <button type="submit" disabled={busy}>{busy ? "در حال ذخیره…" : "ذخیره رمز جدید"}</button>
    </form>
  </section>;
}
