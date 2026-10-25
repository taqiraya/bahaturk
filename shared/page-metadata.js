import { DEFAULT_FOOTER, validateFooter } from "./footer-settings.js";

export const PUBLIC_PAGES = ["", "about", "projects", "contact"];
const pages = {
  "": { title: "Baha Turk Construction Company", description: "Baha Turk delivers durable, high-quality residential projects in Afghanistan through advanced engineering and Tunnel Form construction technology." },
  about: { title: "About Baha Turk | Construction Since 2001", description: "Learn about Baha Turk's journey, engineering experience, values and commitment to quality construction since 2001." },
  projects: { title: "Solh Residential Project | Baha Turk", description: "Explore Solh Residential Project, its residences, floor configurations, amenities, location and construction gallery." },
  contact: { title: "Contact Baha Turk", description: "Contact Baha Turk about Solh Residential Project, construction enquiries and opportunities to work with our team." },
};
const previewImages = {
  "": { path: "images/about.webp", width: 4096, height: 2303, alt: "Baha Turk residential construction project" },
  about: { path: "images/aboutPageHeroImage.webp", width: 1440, height: 390, alt: "Baha Turk construction and engineering" },
  projects: { path: "images/projects/project-hero.webp", width: 1440, height: 480, alt: "Solh Residential Project in Kabul" },
  contact: { path: "images/Contact_hero.jpg", width: 2000, height: 1121, alt: "Baha Turk construction project" },
};
export function pageMetadata(route, origin, base = "/BahaTurk/") {
  const key = route.replace(/^\/+|\/+$/g, "").toLowerCase();
  const known = Object.hasOwn(pages, key);
  const page = known ? pages[key] : { title: key === "admin" ? "Admin | Baha Turk" : "Page Not Found | Baha Turk", description: "Baha Turk Construction Company" };
  const preview = known ? previewImages[key] : previewImages[""];
  return { ...page, route: key, index: known, canonical: new URL(base + (known ? key : ""), origin).href, image: new URL(base + preview.path, origin).href, imageAlt: preview.alt, imageWidth: preview.width, imageHeight: preview.height };
}
export function metadataValues(page) {
  return { description: page.description, robots: page.index ? "index,follow,max-image-preview:large" : "noindex,nofollow", "og:title": page.title, "og:description": page.description, "og:url": page.canonical, "og:image": page.image, "og:image:alt": page.imageAlt, "og:image:width": page.imageWidth, "og:image:height": page.imageHeight, "og:image:type": page.image.endsWith(".jpg") ? "image/jpeg" : "image/webp", "og:site_name": "Baha Turk", "og:type": "website", "twitter:card": "summary_large_image", "twitter:title": page.title, "twitter:description": page.description, "twitter:image": page.image, "twitter:image:alt": page.imageAlt };
}
export function pageStructuredData(route, origin, base = "/BahaTurk/", settings = DEFAULT_FOOTER) {
  const page = pageMetadata(route, origin, base);
  if (!page.index) return null;
  let footer;
  try { footer = validateFooter(settings); } catch { footer = DEFAULT_FOOTER; }
  const home = new URL(base, origin).href;
  const organization = { "@type": "Organization", "@id": home + "#organization", name: "Baha Turk Construction Company", url: home, logo: new URL(base + "images/company-logo.svg", origin).href, email: footer.email, telephone: footer.phone1, address: { "@type": "PostalAddress", streetAddress: footer.address }, sameAs: [footer.facebook, footer.instagram, footer.youtube], contactPoint: [footer.phone1, footer.phone2].map((telephone) => ({ "@type": "ContactPoint", telephone, contactType: "customer service" })) };
  const website = { "@type": "WebSite", "@id": home + "#website", url: home, name: "Baha Turk Construction Company", inLanguage: "en", publisher: { "@id": organization["@id"] } };
  const webpage = { "@type": { about: "AboutPage", contact: "ContactPage", projects: "CollectionPage" }[page.route] || "WebPage", "@id": page.canonical + "#webpage", url: page.canonical, name: page.title, description: page.description, inLanguage: "en", isPartOf: { "@id": website["@id"] }, about: { "@id": organization["@id"] }, primaryImageOfPage: { "@type": "ImageObject", url: page.image } };
  // Only describe real content. Do not invent reviews, prices or opening hours.
  return { "@context": "https://schema.org", "@graph": [organization, website, webpage] };
}
export function serializeStructuredData(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
}
export function escapeMetadata(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}
export function injectPageMetadata(html, route, origin, base = "/BahaTurk/", footer) {
  const page = pageMetadata(route, origin, base);
  html = html.replace(/<(?:meta|link)\b[^>]*\bdata-bt-seo(?:="[^"]*")?[^>]*>/g, "");
  html = html.replace(/<script\b[^>]*\bid="bt-structured-data"[^>]*>[\s\S]*?<\/script>/g, "");
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeMetadata(page.title)}</title>`);
  const tags = [
    `<meta data-bt-seo name="bt-site-origin" content="${escapeMetadata(new URL(origin).origin)}">`,
    `<meta data-bt-seo name="bt-site-path" content="${escapeMetadata(base)}">`,
    ...(page.index ? [`<link data-bt-seo rel="canonical" href="${escapeMetadata(page.canonical)}">`] : []),
    ...Object.entries(metadataValues(page)).map(([name, value]) => `<meta data-bt-seo ${name.startsWith("og:") ? "property" : "name"}="${name}" content="${escapeMetadata(value)}">`),
  ];
  const data = pageStructuredData(route, origin, base, footer);
  if (data) tags.push(`<script id="bt-structured-data" type="application/ld+json">${serializeStructuredData(data)}</script>`);
  return html.replace("</head>", () => tags.join("\n") + "</head>");
}
