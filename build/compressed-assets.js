import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

export function compressedAssetsPlugin() {
  return {
    name: "compressed-production-assets",
    async writeBundle(options) {
      async function visit(directory) {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const file = resolve(directory, entry.name);
          if (entry.isDirectory()) await visit(file);
          else if (/\.(js|css|svg|json)$/.test(entry.name)) {
            const source = await readFile(file);
            if (source.length < 1024) continue;
            for (const [suffix, result] of [[".br", brotliCompressSync(source, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } })], [".gz", gzipSync(source, { level: 9 })]]) {
              if (result.length < source.length) await writeFile(file + suffix, result);
            }
          }
        }
      }
      await visit(resolve(options.dir));
    },
  };
}
