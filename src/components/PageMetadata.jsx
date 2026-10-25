import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { pageMetadata, metadataValues, pageStructuredData, serializeStructuredData } from "../../shared/page-metadata.js";
import { readConfirmedFooter } from "../api/footer";

export default function PageMetadata() {
  const { pathname } = useLocation();
  const [footer, setFooter] = useState(readConfirmedFooter);
  useEffect(() => {
    const update = (event) => setFooter(event.detail);
    window.addEventListener("bt:footer-updated", update);
    return () => window.removeEventListener("bt:footer-updated", update);
  }, []);
  useEffect(() => {
    const origin = document.querySelector('meta[name="bt-site-origin"]')?.content || window.location.origin;
    const publicPath = document.querySelector('meta[name="bt-site-path"]')?.content || import.meta.env.BASE_URL;
    const page = pageMetadata(pathname, origin, publicPath);
    document.title = page.title;
    const values = metadataValues(page);
    for (const [name, content] of Object.entries(values)) {
      const attribute = name.startsWith("og:") ? "property" : "name";
      let element = document.querySelector(`meta[${attribute}="${name}"]`);
      if (!element) { element = document.createElement("meta"); element.setAttribute(attribute, name); element.setAttribute("data-bt-seo", ""); document.head.append(element); }
      element.content = content;
    }
    let canonical = document.querySelector('link[rel="canonical"]');
    if (page.index) {
      if (!canonical) { canonical = document.createElement("link"); canonical.rel = "canonical"; canonical.setAttribute("data-bt-seo", ""); document.head.append(canonical); }
      canonical.href = page.canonical;
    } else canonical?.remove();
    const data = pageStructuredData(pathname, origin, publicPath, footer);
    let script = document.getElementById("bt-structured-data");
    if (data) {
      if (!script) { script = document.createElement("script"); script.id = "bt-structured-data"; script.type = "application/ld+json"; document.head.append(script); }
      script.textContent = serializeStructuredData(data);
    } else script?.remove();
  }, [pathname, footer]);
  return null;
}
