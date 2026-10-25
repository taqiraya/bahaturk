import { DEFAULT_FOOTER, phoneHref, validateFooter } from "./footer-settings.js";
import { escapeMetadata } from "./page-metadata.js";

// Replace only trusted default values in the build-time React footer, in one
// pass. Escaping covers both text and quoted attributes, including hostile input.
export function confirmedFooterMarkup(template, settings) {
  if (!template) return "";
  let footer;
  try { footer = validateFooter(settings); } catch { footer = DEFAULT_FOOTER; }
  const values = new Map(Object.keys(DEFAULT_FOOTER).map((key) => [escapeMetadata(DEFAULT_FOOTER[key]), escapeMetadata(footer[key])]));
  for (const key of ["phone1", "phone2"]) values.set(phoneHref(DEFAULT_FOOTER[key]), escapeMetadata(phoneHref(footer[key])));
  const alternatives = [...values.keys()].sort((a, b) => b.length - a.length).map((text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  return template.replace(new RegExp(alternatives.join("|"), "g"), (match) => values.get(match));
}
