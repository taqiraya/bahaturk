import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";

export async function productionFingerprint(root) {
  const hash = createHash("sha256");
  async function visit(path) {
    let entries;
    try { entries = await readdir(path, { withFileTypes: true }); }
    catch (error) { if (error.code === "ENOTDIR") { hash.update(relative(root, path)); hash.update(await readFile(path)); return; } if (error.code === "ENOENT") return; throw error; }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (entry.isDirectory() || entry.isFile()) await visit(resolve(path, entry.name));
    }
  }
  for (const path of ["src", "public", "shared", "build", "db.json", "index.html", "vite.config.js", "package.json", "pnpm-lock.yaml", "package-lock.json"]) await visit(resolve(root, path));
  return hash.digest("hex");
}
