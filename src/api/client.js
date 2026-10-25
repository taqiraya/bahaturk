import source from "../../db.json";
import { selectPublicData } from "./public-fields";

// One build-time snapshot for every page; never writes to the source database.
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

// Explicit public fields only. Private legacy records must never enter the bundle.
export const siteData = freeze(structuredClone(selectPublicData(source)));
export const featuredProject = (siteData.projects ?? []).find((project) => project.is_featured) ?? null;

export async function getData(endpoint = "") {
  const key = endpoint.replace(/^\/+|\/+$/g, "");
  if (!key) return structuredClone(siteData);
  if (!Object.hasOwn(siteData, key)) throw new Error("Unknown data section: " + key);
  return structuredClone(siteData[key]);
}
