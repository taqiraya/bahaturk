import FooterSettings from "./FooterSettings";
import PasswordSettings from "./PasswordSettings";
import logo from "../../assets/images/logo.svg";
import { ArrowUpLeft, ChevronLeft, Inbox, KeyRound, LogOut, Menu, PanelBottom, X } from "lucide-react";
import { createElement, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { contactRequest } from "../../api/contact";
import styles from "./Admin.module.css";

export default function Admin() {
  const [session, setSession] = useState(null);
  const [checking, setChecking] = useState(true);
  const [credentials, setCredentials] = useState({ username: "", password: "" });
  const [result, setResult] = useState({ messages: [], total: 0, pageSize: 20 });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [section, setSection] = useState(() => { try { const saved = sessionStorage.getItem("bahaturk-admin-view"); return ["password", "messages", "footer"].includes(saved) ? saved : "messages"; } catch { return "messages"; } });
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobile, setMobile] = useState(() => window.innerWidth < 1024);
  const [notice, setNotice] = useState("");
  const menuButton = useRef(null);
  const sidebar = useRef(null);
  useEffect(() => {
    const update = () => { const small = window.innerWidth < 1024; setMobile(small); if (!small) setMenuOpen(false); };
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);
  const inFlight = useRef(null);
  const snapshot = useRef(null);
  const footerDirty = useRef(false);
  const rememberFooterDirty = useCallback((dirty) => { footerDirty.current = dirty; }, []);

  useEffect(() => {
    let cancelled = false;
    contactRequest("/admin/session")
      .then((value) => { if (!cancelled) setSession(value); })
      .catch((failure) => { if (!cancelled && failure.status !== 401) setError("سرویس در دسترس نیست. سایت را با node app.js اجرا کنید."); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async (signal) => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    const requestSignal = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    setLoading(true);
    setError("");
    try {
      const fixedSnapshot = page > 1 && snapshot.current ? `&snapshot=${snapshot.current}` : "";
      const value = await contactRequest(`/admin/messages?page=${page}${fixedSnapshot}`, { signal: requestSignal });
      if (!requestSignal.aborted) { snapshot.current = value.snapshot; setResult(value); }
    } catch (failure) {
      if (requestSignal.aborted) return;
      if (failure.status === 401) { setSession(null); setResult({ messages: [], total: 0, pageSize: 20 }); }
      setError(failure.message);
    } finally {
      if (inFlight.current === controller) { inFlight.current = null; setLoading(false); }
    }
  }, [page]);

  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    void refresh(controller.signal);
    // Poll quietly; keep pagination and existing rows while the list refreshes.
    const timer = setInterval(() => { if (!document.hidden) void refresh(controller.signal); }, 15000);
    return () => { controller.abort(); inFlight.current?.abort(); inFlight.current = null; clearInterval(timer); };
  }, [session, refresh]);

  function navigate(next) {
    setSection(next); setMenuOpen(false);
    try { sessionStorage.setItem("bahaturk-admin-view", next); } catch { /* Navigation still works with restricted storage. */ }
  }
  useEffect(() => {
    if (!menuOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => sidebar.current?.querySelector("button")?.focus());
    const keydown = (event) => {
      if (event.key === "Escape") setMenuOpen(false);
      if (event.key === "Tab") {
        const controls = [...sidebar.current.querySelectorAll("a,button:not(:disabled)")].filter((element) => element.getClientRects().length);
        const first = controls[0], last = controls.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    };
    const resize = () => { if (innerWidth >= 1024) setMenuOpen(false); };
    window.addEventListener("keydown", keydown); window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(frame); document.body.style.overflow = previous; window.removeEventListener("keydown", keydown); window.removeEventListener("resize", resize); menuButton.current?.focus(); };
  }, [menuOpen]);

  async function login(event) {
    event.preventDefault();
    if (loading) return;
    setLoading(true);
    setError("");
    try {
      const value = await contactRequest("/admin/login", { method: "POST", body: JSON.stringify(credentials) });
      setCredentials({ username: "", password: "" });
      setPage(1);
      snapshot.current = null;
      navigate("messages"); setNotice("");
      setSession(value);
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }

  async function logout() {
    if (footerDirty.current && !window.confirm("تغییرات فوتر هنوز ذخیره نشده است. خارج شوید؟")) return;
    setLoading(true);
    try {
      await contactRequest("/admin/logout", { method: "POST", headers: { "X-CSRF-Token": session.csrf } });
      setSession(null);
      setMenuOpen(false);
      snapshot.current = null;
      setResult({ messages: [], total: 0, pageSize: 20 });
      setError("");
    } catch (failure) { setError(failure.message); }
    finally { setLoading(false); }
  }

  if (checking || !session) return <main className={`${styles.panel} ${styles.authPage}`} dir="rtl">
    <div className={styles.authBrand}><img src={logo} alt="Baha Turk" width="325" height="65" /><span>پنل مدیریت وبسایت</span></div>
    {checking ? <p role="status" className={styles.checking}>در حال بررسی ورود…</p> : <>
        <form className={styles.login} onSubmit={login}>
          <h2>ورود ادمین</h2>
          <p>برای مدیریت پیام‌ها و اطلاعات کسب‌وکار وارد شوید.</p>
          {error && <p role="alert" className={styles.error}>{error}</p>}
          {notice && <p role="status" className={styles.success}>{notice}</p>}
          <label htmlFor="admin-user">نام کاربری</label>
          <input id="admin-user" autoComplete="username" dir="ltr" required maxLength={100} value={credentials.username} onChange={(e) => setCredentials({ ...credentials, username: e.target.value })} />
          <label htmlFor="admin-password">رمز عبور</label>
          <input id="admin-password" type="password" autoComplete="current-password" dir="ltr" required maxLength={256} value={credentials.password} onChange={(e) => setCredentials({ ...credentials, password: e.target.value })} />
          <button disabled={loading}>{loading ? "در حال ورود…" : "ورود"}</button>
        </form>
        <Link className={styles.authBack} to="/">بازگشت به وبسایت<ArrowUpLeft size={17} /></Link>
      </>}
    </main>;

  const titles = { password: "تغییر رمز ادمین", messages: "پیام‌های تماس", footer: "فوتر و اطلاعات تماس" };
  const navigation = [{ id: "footer", label: titles.footer, icon: PanelBottom }, { id: "password", label: titles.password, icon: KeyRound }, { id: "messages", label: titles.messages, icon: Inbox }];
  return <main className={styles.panel} dir="rtl">
    {menuOpen && <button type="button" className={styles.backdrop} aria-label="بستن منوی مدیریت" onClick={() => setMenuOpen(false)} />}
    <aside ref={sidebar} id="admin-sidebar" className={`${styles.sidebar} ${menuOpen ? styles.sidebarOpen : ""}`} aria-label="سایدبار مدیریت" inert={mobile && !menuOpen ? true : undefined}>
      <div className={styles.sideBrand}><div><img src={logo} alt="Baha Turk" width="325" height="65" /></div><span>پنل مدیریت</span><button type="button" className={styles.closeMenu} aria-label="بستن سایدبار" onClick={() => setMenuOpen(false)}><X size={22} /></button></div>
      <p className={styles.navLabel}>فضای کاری</p>
      <nav className={styles.sideNav} aria-label="بخش‌های مدیریت">{navigation.map(({ id, label, icon: Icon }) => <button type="button" key={id} className={`${styles.navItem} ${section === id ? styles.navActive : ""}`} aria-current={section === id ? "page" : undefined} onClick={() => navigate(id)}>{createElement(Icon, { size: 21 })}<span>{label}</span>{section === id && <ChevronLeft size={16} />}</button>)}</nav>
      <div className={styles.sideBottom}><Link className={styles.siteLink} to="/">مشاهدهٔ وبسایت<ArrowUpLeft size={18} /></Link><div className={styles.sideUser}><span className={styles.userAvatar}>{session.username.slice(0, 1).toUpperCase()}</span><div><strong dir="auto">{session.username}</strong><small>مدیر وبسایت</small></div><button type="button" aria-label="خروج" title="خروج" disabled={loading} onClick={logout}><LogOut size={20} /></button></div></div>
    </aside>
    <div className={styles.workspace}>
      <header className={styles.topbar}><div className={styles.pageTitle}><button ref={menuButton} type="button" className={styles.menuToggle} aria-label="باز کردن منوی مدیریت" aria-expanded={menuOpen} aria-controls="admin-sidebar" onClick={() => setMenuOpen(true)}><Menu size={23} /></button><h1>{titles[section]}</h1></div></header>
      <div className={styles.content}>
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <div hidden={section !== "messages"}>
        <section className={styles.inbox} aria-label="پیام‌های تماس">
          <div className={styles.toolbar}>
            <h2>پیام‌های دریافت‌شده <span>({result.total})</span></h2>
            <button disabled={loading} onClick={() => { void refresh(); }}>{loading ? "در حال دریافت…" : "تازه‌سازی"}</button>
          </div>
          <p className={styles.hint}>جدیدترین پیام‌ها در ابتدا نمایش داده می‌شوند. فهرست هر ۱۵ ثانیه تازه می‌شود.</p>
          {!result.messages.length && !loading && !error && <p className={styles.empty}>هنوز پیامی دریافت نشده است.</p>}
          {result.messages.map((item) => (
            <article key={item.id} className={styles.message}>
              <div className={styles.messageHeading}>
                <h3 dir="auto">{item.subject || "بدون موضوع"}</h3>
                <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString("fa-IR")}</time>
              </div>
              <dl className={styles.details}>
                <div><dt>نام</dt><dd dir="auto">{item.fullName}</dd></div>
                <div><dt>ایمیل</dt><dd><a href={`mailto:${item.emailAddress}`} dir="ltr">{item.emailAddress}</a></dd></div>
                <div><dt>تلفن</dt><dd dir="ltr">{item.phoneNumber || "—"}</dd></div>
                <div><dt>شمارهٔ پیام</dt><dd>{item.id}</dd></div>
              </dl>
              <p className={styles.body} dir="auto">{item.message}</p>
            </article>
          ))}
          <nav className={styles.pagination} aria-label="صفحه‌بندی پیام‌ها">
            <button disabled={loading || page === 1} onClick={() => setPage((value) => value - 1)}>قبلی</button>
            <span>صفحهٔ {page} از {Math.max(1, Math.ceil(result.total / result.pageSize))}</span>
            <button disabled={loading || page * result.pageSize >= result.total} onClick={() => setPage((value) => value + 1)}>بعدی</button>
          </nav>
        </section>
      </div>
      <div hidden={section !== "footer"}>
        <FooterSettings csrf={session.csrf} username={session.username} onDirtyChange={rememberFooterDirty} />
      </div>
      <div hidden={section !== "password"}><PasswordSettings csrf={session.csrf} onChanged={() => { setSession(null); setMenuOpen(false); setResult({ messages: [], total: 0, pageSize: 20 }); snapshot.current = null; setError(""); setNotice("رمز با موفقیت تغییر کرد؛ با رمز جدید وارد شوید."); navigate("messages"); }} /></div>
      </div>
    </div>
  </main>;
}
