import { pathToFileURL } from "node:url";
import { PUBLIC_PAGES } from "../shared/page-metadata.js";

const decode = (value = "") => value.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#(?:39|x27);/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
function attributes(tag) { return Object.fromEntries([...tag.matchAll(/([\w:-]+)="([^"]*)"/g)].map((match) => [match[1].toLowerCase(), decode(match[2])])); }

export async function auditSeo(target, publicUrl = target) {
  const errors = [], pages = [], titles = new Set(), descriptions = new Set(), links = new Set();
  const base = new URL(target), canonicalBase = new URL(publicUrl);
  const get = (url, method = "GET") => fetch(url, { method, redirect: "manual", signal: AbortSignal.timeout(15000) });
  for (const route of PUBLIC_PAGES) {
    const response = await get(new URL(route, base));
    const html = await response.text();
    const check = (okay, message) => { if (!okay) errors.push(`${route || "home"}: ${message}`); };
    check(response.status === 200, `HTTP ${response.status}`);
    const title = decode(html.match(/<title>([\s\S]*?)<\/title>/i)?.[1]).trim();
    const metas = [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributes(match[0]));
    const description = metas.find((meta) => meta.name === "description")?.content;
    const canonicals = [...html.matchAll(/<link\b[^>]*>/gi)].map((match) => attributes(match[0])).filter((link) => link.rel === "canonical");
    check(title && !titles.has(title), "missing or duplicate title"); titles.add(title);
    check(description && !descriptions.has(description), "missing or duplicate description"); descriptions.add(description);
    check(canonicals.length === 1 && canonicals[0].href === new URL(route, canonicalBase).href, "canonical mismatch");
    check(!metas.find((meta) => meta.name === "robots")?.content.includes("noindex"), "public page is noindex");
    check((html.match(/<h1\b/gi) || []).length === 1, "expected one H1 in initial HTML");
    check(html.includes("<footer"), "missing business footer in initial HTML");
    try { const graphs = [...html.matchAll(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)]; check(graphs.length === 1 && JSON.parse(graphs[0][1])["@graph"].length >= 3, "structured data missing or duplicated"); } catch { check(false, "invalid structured JSON"); }
    for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
      const href = attributes(match[0]).href;
      if (!href || href.startsWith("#") || /^(?:mailto:|tel:)/i.test(href)) continue;
      const url = new URL(href, response.url);
      if (url.origin === base.origin && url.pathname.startsWith(base.pathname)) { url.hash = ""; links.add(url.href); }
    }
    pages.push({ route: route || "home", status: response.status, title });
  }
  for (const link of links) { const response = await get(link, "HEAD"); if (response.status !== 200) errors.push(`Internal link HTTP ${response.status}: ${link}`); }
  const sitemapResponse = await get(new URL("sitemap.xml", base));
  const sitemap = await sitemapResponse.text();
  if (sitemapResponse.status !== 200) errors.push("Sitemap unavailable");
  for (const route of PUBLIC_PAGES) if (!sitemap.includes(`<loc>${new URL(route, canonicalBase).href}</loc>`)) errors.push(`Missing sitemap page: ${route || "home"}`);
  const images = [...new Set([...sitemap.matchAll(/<image:loc>(.*?)<\/image:loc>/g)].map((match) => decode(match[1])))];
  if (!images.length) errors.push("Sitemap has no discoverable images");
  for (const image of images) {
    const url = new URL(image);
    if (url.origin !== canonicalBase.origin || !url.pathname.startsWith(canonicalBase.pathname)) { errors.push(`Image outside public URL: ${image}`); continue; }
    const response = await get(new URL(url.pathname.slice(canonicalBase.pathname.length), base), "HEAD");
    if (response.status !== 200 || !response.headers.get("content-type")?.startsWith("image/")) errors.push(`Sitemap image unavailable: ${image}`);
  }
  const robots = await get(new URL("robots.txt", base));
  if (robots.status !== 200 || !(await robots.text()).includes(new URL("sitemap.xml", canonicalBase).href)) errors.push("robots.txt sitemap mismatch");
  return { target: base.href, canonicalBase: canonicalBase.href, pages, internalLinksChecked: links.size, imagesChecked: images.length, errors, passed: errors.length === 0 };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const report = await auditSeo(process.argv[2] || "http://127.0.0.1:3000/", process.argv[3] || "https://bahaturk.com/");
    console.log(JSON.stringify(report, null, 2));
    if (!report.passed) process.exitCode = 1;
  } catch (error) { console.error("SEO audit failed:", error.message); process.exitCode = 1; }
}
