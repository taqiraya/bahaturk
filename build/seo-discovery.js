import { createHash } from "node:crypto";
import { stat } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { metadataValues, pageMetadata } from "../shared/page-metadata.js";

export async function discoverPublicPage(html, route, base, dist, previous, now = new Date().toISOString()) {
  const images = new Set();
  const urls = [...html.matchAll(/\bsrc="([^"]+)"|url\((?:&quot;|["'])?([^\s)"']+?)(?:&quot;|["'])?\)/g)].map((match) => match[1] || match[2]);
  for (const value of urls) {
    if (/^(?:data:|https?:|\/\/)/i.test(value)) continue;
    const path = value.startsWith(base) ? value.slice(base.length) : value.replace(/^\//, "");
    if (!/^(?:images|assets)\/[a-zA-Z0-9_./-]+\.(?:webp|jpe?g|png|avif)$/i.test(path) || path.split("/").includes("..") || path.includes("/responsive/")) continue;
    const file = resolve(dist, path);
    if (!file.startsWith(resolve(dist) + sep)) continue;
    try { if ((await stat(file)).size >= 10000) images.add(path); } catch { /* Exclude missing files from the sitemap. */ }
  }
  const metadata = metadataValues(pageMetadata(route, "https://example.invalid", base));
  const hash = createHash("sha256").update(html).update(JSON.stringify(metadata)).digest("hex");
  const lastmod = previous?.hash === hash && !Number.isNaN(Date.parse(previous.lastmod)) ? previous.lastmod : now;
  return { hash, lastmod, images: [...images].sort() };
}
