import { ArrowUpLeft, Clock, Inbox, Mail, PanelBottom, RefreshCw } from "lucide-react";
import styles from "./Admin.module.css";

export default function AdminDashboard({ summary, username, updatedAt, loading, onNavigate, onOpenMessage, onRefresh }) {
  const latest = summary?.messages.slice(0, 5) || [];
  return <section aria-label="داشبورد مدیریت" className={styles.dashboard}>
    <div className={styles.welcome}>
      <div><span className={styles.eyebrow}>نمای کلی مدیریت</span><h2>خوش آمدید، <bdi>{username}</bdi></h2><p>پیام‌های مشتریان و اطلاعات تماس کسب‌وکارتان را از اینجا مدیریت کنید.</p></div>
      <button type="button" className={styles.primaryAction} onClick={() => onNavigate("messages")}><Inbox size={18} />مشاهدهٔ پیام‌ها<ArrowUpLeft size={17} /></button>
    </div>
    <div className={styles.stats}>
      <article className={styles.statCard}><span className={styles.statIcon}><Inbox size={23} /></span><div><p>کل پیام‌های دریافتی</p><strong>{summary ? summary.total.toLocaleString("fa-IR") : "—"}</strong><small>ثبت‌شده در فورم تماس سایت</small></div></article>
      <article className={styles.statCard}><span className={`${styles.statIcon} ${styles.purple}`}><Mail size={23} /></span><div><p>جدیدترین پیام</p><strong className={styles.statDate}>{latest.length ? new Date(latest[0].createdAt).toLocaleDateString("fa-IR") : "—"}</strong><small>{latest.length ? "تاریخ آخرین پیام ثبت‌شده" : summary ? "هنوز پیامی ثبت نشده است" : "در حال دریافت اطلاعات"}</small></div></article>
      <article className={styles.statCard}><span className={`${styles.statIcon} ${styles.green}`}><Clock size={23} /></span><div><p>آخرین همگام‌سازی</p><strong className={styles.statDate}>{updatedAt ? new Date(updatedAt).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" }) : "—"}</strong><small>زمان آخرین دریافت موفق پیام‌ها</small></div></article>
    </div>
    <div className={styles.sectionHeading}><div><h2>دسترسی سریع</h2><p>بخش مورد نیازتان را انتخاب کنید.</p></div></div>
    <div className={styles.quickGrid}>
      <button type="button" className={styles.quickCard} onClick={() => onNavigate("messages")}><span className={styles.quickIcon}><Inbox size={24} /></span><span><strong>مدیریت پیام‌ها</strong><small>مشاهدهٔ پیام‌ها و مشخصات فرستنده</small></span><ArrowUpLeft size={20} /></button>
      <button type="button" className={styles.quickCard} onClick={() => onNavigate("footer")}><span className={`${styles.quickIcon} ${styles.purple}`}><PanelBottom size={24} /></span><span><strong>اطلاعات فوتر سایت</strong><small>ویرایش شماره‌ها، آدرس و شبکه‌های اجتماعی</small></span><ArrowUpLeft size={20} /></button>
    </div>
    <div className={styles.latestCard}>
      <div className={styles.cardHeading}><div><h2>آخرین پیام‌های تماس</h2><p>پنج پیام آخر ثبت‌شده در سایت</p></div><button type="button" className={styles.textButton} disabled={loading} onClick={onRefresh}><RefreshCw size={16} className={loading ? styles.spinning : undefined} />تازه‌سازی</button></div>
      {latest.length ? <div className={styles.tableScroll}><table className={styles.latestTable}><thead><tr><th scope="col">فرستنده</th><th scope="col">موضوع</th><th scope="col">تاریخ دریافت</th><th scope="col"><span className={styles.srOnly}>جزئیات</span></th></tr></thead><tbody>{latest.map((item) => <tr key={item.id}><td><div className={styles.sender}><span className={styles.avatar}>{item.fullName.trim().slice(0, 1)}</span><span dir="auto">{item.fullName}</span></div></td><td dir="auto">{item.subject || "بدون موضوع"}</td><td><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleDateString("fa-IR")}</time></td><td><button type="button" className={styles.rowAction} aria-label={`مشاهدهٔ پیام ${item.id}`} onClick={() => onOpenMessage(item.id)}><ArrowUpLeft size={19} /></button></td></tr>)}</tbody></table></div> : <div className={styles.dashboardEmpty}><span><Mail size={30} /></span><h3>{summary ? "هنوز پیامی دریافت نشده است" : "در حال دریافت پیام‌ها"}</h3><p>پیام‌های فورم تماس وبسایت در این بخش نمایش داده می‌شوند.</p></div>}
      <button type="button" className={styles.cardFooter} onClick={() => onNavigate("messages")}>مشاهدهٔ همهٔ پیام‌ها<ArrowUpLeft size={16} /></button>
    </div>
  </section>;
}
