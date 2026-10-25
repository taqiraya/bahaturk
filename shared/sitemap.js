import { PUBLIC_PAGES, escapeMetadata } from "./page-metadata.js";

export function sitemapXml(origin, base, index = {}) {
  const home = new URL(base, origin);
  const entries = PUBLIC_PAGES.map((route) => {
    const page = Object.hasOwn(index, route) ? index[route] : {};
    const date = typeof page.lastmod === "string" && !Number.isNaN(Date.parse(page.lastmod)) ? `<lastmod>${escapeMetadata(page.lastmod)}</lastmod>` : "";
    const images = [...new Set(page.images || [])].filter((path) => typeof path === "string" && /^(?:images|assets)\/[a-zA-Z0-9_./-]+\.(?:webp|jpe?g|png|avif)$/i.test(path) && !path.split("/").includes("..")).slice(0, 1000).map((path) => `<image:image><image:loc>${escapeMetadata(new URL(path, home).href)}</image:loc></image:image>`).join("");
    return `<url><loc>${escapeMetadata(new URL(route, home).href)}</loc>${date}${images}</url>`;
  });
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${entries.join("")}</urlset>`;
}
