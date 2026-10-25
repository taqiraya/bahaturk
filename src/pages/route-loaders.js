const original = {
  about: () => import("./about/About"),
  projects: () => import("./projects/Projects"),
  contact: () => import("./contact/Contact"),
  admin: () => import("./admin/Admin"),
};
const sourceIds = { about: "src/pages/about/About.jsx", projects: "src/pages/projects/Projects.jsx", contact: "src/pages/contact/Contact.jsx", admin: "src/pages/admin/Admin.jsx" };
const pending = new Map();
async function loadRoute(key) {
  if (!pending.has(key)) {
    let nonce;
    try { nonce = sessionStorage.getItem("bt-route-retry:" + key); } catch { /* The query parameter also supports restricted storage. */ }
    nonce ||= new URLSearchParams(window.location.search).get("__bt_retry");
    const promise = nonce && import.meta.env.PROD ? (async () => {
      const response = await fetch(import.meta.env.BASE_URL + "route-manifest.json", { cache: "no-store" });
      if (!response.ok) throw new Error("Route recovery is unavailable.");
      const manifest = await response.json();
      const entry = manifest[sourceIds[key]];
      if (!entry || !/^assets\/[^?#]+\.js$/.test(entry.file)) throw new Error("Invalid route recovery resource.");
      const url = new URL(import.meta.env.BASE_URL + entry.file, window.location.origin);
      url.searchParams.set("bt_retry", nonce);
      return import(/* @vite-ignore */ url.href);
    })() : original[key]();
    pending.set(key, promise);
  }
  return pending.get(key);
}
export const loadAbout = () => loadRoute("about");
export const loadProjects = () => loadRoute("projects");
export const loadContact = () => loadRoute("contact");
export const loadAdmin = () => loadRoute("admin");
export function preloadRoute(path) {
  const key = path.replace(/^#?\/?/, "").split(/[/?]/)[0];
  return Object.hasOwn(original, key) ? loadRoute(key) : undefined;
}
export function retryCurrentRoute() {
  const key = location.pathname.slice(import.meta.env.BASE_URL.length).split("/")[0];
  const nonce = String(Date.now());
  try { sessionStorage.setItem("bt-route-retry:" + key, nonce); } catch { /* Keep retry usable without browser storage. */ }
  const url = new URL(location.href); url.searchParams.set("__bt_retry", nonce);
  location.replace(url.pathname + url.search);
}
