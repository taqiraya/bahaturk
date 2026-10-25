import { PUBLIC_PAGES, injectPageMetadata } from "./shared/page-metadata.js";
import { confirmedFooterMarkup } from "./shared/seo-footer.js";
import { sitemapXml } from "./shared/sitemap.js";
import { ensureProductionBuild } from "./server/ensure-build.js";
import { sendHtml, serveStatic } from "./server/static-response.js";
import { startStorageMonitor } from "./server/storage-monitor.js";
import { createFooterCache, injectFooterSnapshot } from "./server/footer-cache.js";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve, extname, sep } from "node:path";
import { loadConfig } from "./server/config.js";
import { createResilientDatabase } from "./server/database.js";
import { createApi } from "./server/api.js";
import { createLogger } from "./server/logger.js";

const root = dirname(fileURLToPath(import.meta.url));

export async function startApp(overrides = {}) {
  const appRoot = overrides.root || root;
  const config = overrides.config || loadConfig(appRoot);
  let BASE = "/BahaTurk/";
  try {
    const build = JSON.parse(await readFile(resolve(appRoot, "dist/.build-state.json"), "utf8"));
    if (typeof build.base === "string" && /^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(build.base)) BASE = build.base;
  } catch { /* Compatibility with previously prepared releases and test fixtures. */ }
  const seoBase = config.publicSitePath || BASE;
  const database = overrides.database || createResilientDatabase(config.database);
  const logger = overrides.logger || createLogger(appRoot);
  const footerCache = overrides.footerCache === false ? null : (overrides.footerCache || createFooterCache(appRoot));
  const api = createApi({ database, config, logger, footerCache });
  let storageMonitor;
  let vite;
  let pageSnapshot;
  let pageStamp;
  async function publicMarkup(route, footer) {
    const file = resolve(appRoot, "dist/.seo-pages.json");
    try {
      const info = await stat(file);
      const stamp = `${info.mtimeMs}:${info.size}`;
      if (stamp !== pageStamp) {
        pageSnapshot = JSON.parse(await readFile(file, "utf8"));
        pageStamp = stamp;
      }
      return Object.hasOwn(pageSnapshot, route) ? pageSnapshot[route] + confirmedFooterMarkup(pageSnapshot.__footer, footer) : "";
    } catch (error) {
      if (error.code !== "ENOENT") logger.write("public_html_unavailable");
      return "";
    }
  }
  const server = createServer(async (req, res) => {
    // Informational labels only; do not alter caching, cookies or response bodies.
    res.setHeader("Server", "cloudflare");
    res.setHeader("X-Powered-By", "PHP");
    res.setHeader("X-Framework", "Laravel");
    res.setHeader("X-CDN", "Shopify");
    // This site is opened directly; Google Maps embeds inside it remain allowed.
    res.setHeader("Content-Security-Policy", "frame-ancestors 'none'");
    res.setHeader("X-Frame-Options", "DENY");
    let url;
    try { url = new URL(req.url, `http://${req.headers.host}`); }
    catch { res.writeHead(400).end(); return; }
    let pathname;
    try { pathname = decodeURIComponent(url.pathname); }
    catch { res.writeHead(400).end(); return; }
    // Preserve old bookmarks, query strings and in-flight API calls after moving
    // the public application from /BahaTurk/ to the domain root.
    if (BASE === "/" && (url.pathname === "/BahaTurk" || url.pathname.startsWith("/BahaTurk/"))) {
      const target = "/" + url.pathname.slice("/BahaTurk".length).replace(/^\/+/, "");
      res.writeHead(308, { Location: target + url.search }).end(); return;
    }
    const relative = pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname.slice(1);
    if (/(?:^|[\\/])\./.test(relative)) { res.writeHead(404).end(); return; }
    // Neither local credentials nor server source are public assets.
    if (/(?:^|\/)\.(?:env|git)|(?:^|\/)\.(?:npm-cache|pnpm-store|runtime|media-originals)(?:\/|$)|(?:^|\/)server(?:\/|$)|(?:^|\/)app\.js$/.test(relative)) {
      res.writeHead(404).end(); return;
    }
    if (pathname === "/api" || pathname.startsWith("/api/") || relative.startsWith("api/")) {
      res.setHeader("X-Robots-Tag", "noindex, nofollow");
      url.pathname = pathname.startsWith(BASE) ? `/${relative}` : pathname;
      await api(req, res, url);
      return;
    }
    const siteOrigin = config.publicSiteUrl ? new URL(config.publicSiteUrl).origin : `${config.secureCookie ? "https" : "http"}://${req.headers.host}`;
    if (["/robots.txt", `${BASE}robots.txt`].includes(pathname) && ["GET", "HEAD"].includes(req.method)) {
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" });
      res.end(`User-agent: *\nAllow: ${BASE}\nDisallow: ${BASE}admin\nDisallow: ${BASE}api/\nSitemap: ${siteOrigin}${seoBase}sitemap.xml\n`); return;
    }
    if (pathname === `${BASE}sitemap.xml` && ["GET", "HEAD"].includes(req.method)) {
      let index = {};
      try { index = JSON.parse(await readFile(resolve(appRoot, "dist/.seo-index.json"), "utf8")); } catch { /* Compatibility with older releases. */ }
      res.writeHead(200, { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
      res.end(sitemapXml(siteOrigin, seoBase, index)); return;
    }
    if (pathname === BASE.slice(0, -1)) { res.writeHead(308, { Location: BASE + url.search }).end(); return; }
    if (pathname === BASE + "index.html") { res.writeHead(308, { Location: BASE + url.search }).end(); return; }
    const pageRoute = relative.replace(/\/$/, "").toLowerCase();
    const knownPage = PUBLIC_PAGES.includes(pageRoute) || pageRoute === "admin";
    if (pathname.startsWith(BASE) && relative && knownPage && relative !== pageRoute) { res.writeHead(308, { Location: BASE + pageRoute + url.search }).end(); return; }
    if (pathname === "/" && BASE !== "/") { res.writeHead(302, { Location: BASE }).end(); return; }
    if (!config.production) {
      vite.middlewares(req, res, () => { res.writeHead(404).end(); });
      return;
    }
    if (!pathname.startsWith(BASE) || !["GET", "HEAD"].includes(req.method)) { res.writeHead(404).end(); return; }
    const dist = resolve(appRoot, "dist");
    const isPage = !extname(relative) || relative === "index.html";
    const file = resolve(dist, isPage ? "index.html" : relative);
    if (!file.startsWith(dist + sep)) { res.writeHead(404).end(); return; }
    if (!existsSync(file) || !extname(file)) { res.writeHead(404).end(); return; }
    if (isPage) {
      let snapshot;
      try { snapshot = await footerCache?.read(); } catch { logger.write("footer_cache_failure"); }
      const route = relative === "index.html" ? "" : pageRoute;
      if (!PUBLIC_PAGES.includes(route)) res.setHeader("X-Robots-Tag", "noindex, nofollow");
      const markup = PUBLIC_PAGES.includes(route) ? await publicMarkup(route, snapshot) : "";
      const source = (await readFile(file, "utf8")).replace("<!--bt-page-content-->", () => markup);
      const html = injectPageMetadata(injectFooterSnapshot(source, snapshot), route, siteOrigin, seoBase, snapshot);
      await sendHtml(req, res, html, knownPage || relative === "index.html" ? 200 : 404);
      return;
    }
    const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".webp": "image/webp", ".woff2": "font/woff2" };
    await serveStatic(req, res, file, types[extname(file)] || "application/octet-stream", relative.startsWith("assets/") || relative.startsWith("images/responsive/") ? "public, max-age=31536000, immutable" : "no-cache");
  });
  try {
    if (config.production) {
      if (!existsSync(resolve(appRoot, "dist/index.html"))) throw new Error("Run npm run build before starting in production.");
    } else {
      const { createServer: createViteServer } = await import("vite");
      vite = await createViteServer({
        root: appRoot,
        plugins: [{ name: "confirmed-footer-snapshot", async transformIndexHtml(html) {
          try { return injectFooterSnapshot(html, await footerCache?.read()); }
          catch { logger.write("footer_cache_failure"); return html; }
        } }],
        cacheDir: "node_modules/.vite-app",
        optimizeDeps: {
          noDiscovery: true,
          include: ["react", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime", "react-router-dom", "lucide-react"],
        },
        server: { middlewareMode: true, ws: { server }, fs: { deny: [".env", ".env.*", "*.{crt,pem}", "**/.git/**", "**/.runtime/**", "**/.media-originals/**", "**/server/**", "**/app.js"] } },
      });
    }
    await new Promise((done, reject) => { server.once("error", reject); server.listen(config.port, config.host, done); });
  } catch (error) {
    await vite?.close();
    await database.close();
    throw error;
  }
  const address = server.address();
  console.log(`Website: http://${config.host}:${address.port}${BASE}`);
  console.log(`Admin:   http://${config.host}:${address.port}${BASE}admin`);
  if (!overrides.database) storageMonitor = startStorageMonitor(appRoot, database, logger, config.storageLimits);
  if (!overrides.database && footerCache) void database.getFooterState().then((state) => footerCache.write(state.settings, state.revision)).catch(() => { logger.write("footer_cache_seed_unavailable"); });
  logger.write("server_started", { production: config.production });
  return {
    server,
    async close() {
      await vite?.close();
      server.closeAllConnections();
      await new Promise((done) => server.close(done));
      await storageMonitor?.stop();
      await database.close();
      logger.write("server_stopped");
      await logger.flush();
    },
  };
}

export async function startWebsite() {
  const config = loadConfig(root);
  if (config.production) await ensureProductionBuild(root);
  return startApp({ config });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const app = await startWebsite();
    for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { void app.close(); });
  } catch (error) {
    console.error("Unable to start Baha Turk:", error.code || error.message);
    console.error("Check that MySQL is running and DB_HOST / DB_PORT / DB_USER / DB_PASSWORD are correct.");
    process.exitCode = 1;
  }
}
