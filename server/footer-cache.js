import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { validateFooter } from "../shared/footer-settings.js";

export function injectFooterSnapshot(html, settings) {
  if (!settings) return html;
  const text = JSON.stringify(validateFooter(settings)).replace(/[<>&\u2028\u2029]/g, (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`);
  return html.replace("</head>", () => `<script id="bt-footer-snapshot" type="application/json">${text}</script></head>`);
}

// Public business details only. Immutable snapshots retain every confirmed value.
export function createFooterCache(root) {
  const directory = resolve(root, ".runtime", "footer-cache");
  let current;
  let currentRevision = -1n;
  return {
    async read() {
      let files;
      try { files = (await readdir(directory)).filter((name) => /^\d+-[a-f0-9]{64}\.json$/.test(name)).sort((a, b) => BigInt(a.split("-")[0]) > BigInt(b.split("-")[0]) ? -1 : 1); }
      catch (error) { if (error.code === "ENOENT") return current || null; throw error; }
      for (const name of files) {
        const revision = BigInt(name.split("-")[0]);
        if (current && revision <= currentRevision) return current;
        try { current = validateFooter(JSON.parse(await readFile(resolve(directory, name), "utf8"))); currentRevision = revision; return current; }
        catch { /* A partial snapshot never replaces an older valid snapshot. */ }
      }
      return current || null;
    },
    async write(settings, revision) {
      const value = validateFooter(settings);
      if (BigInt(revision) >= currentRevision) { current = value; currentRevision = BigInt(revision); }
      const text = JSON.stringify(value);
      const hash = createHash("sha256").update(text).digest("hex");
      await mkdir(directory, { recursive: true, mode: 0o700 });
      try { await writeFile(resolve(directory, `${revision}-${hash}.json`), text, { flag: "wx", mode: 0o600 }); }
      catch (error) { if (error.code !== "EEXIST") throw error; }
    },
  };
}
