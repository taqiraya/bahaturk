import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { productionFingerprint } from "./fingerprint.js";

export function buildStatePlugin() {
  let root;
  let base;
  return {
    name: "production-build-state",
    configResolved(config) { root = config.root; base = config.base; },
    async writeBundle(options) {
      await writeFile(resolve(options.dir, ".build-state.json"), JSON.stringify({ fingerprint: await productionFingerprint(root), base }));
    },
  };
}
