import { resolve } from "node:path";
import { selectPublicData } from "../src/api/public-fields.js";

export function publicDataPlugin(root = process.cwd()) {
  let databasePath = resolve(root, "db.json").replaceAll("\\", "/");
  return {
    name: "public-data-only",
    enforce: "pre",
    configResolved(config) { databasePath = resolve(config.root, "db.json").replaceAll("\\", "/"); },
    transform(code, id) {
      if (id.split("?")[0].replaceAll("\\", "/") !== databasePath) return;
      // Redact before Vite's JSON compiler, not merely after the JSON reached JS.
      return { code: JSON.stringify(selectPublicData(JSON.parse(code))), map: null };
    },
  };
}
