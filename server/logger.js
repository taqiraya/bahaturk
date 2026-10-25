import { mkdir, appendFile } from "node:fs/promises";
import { resolve } from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

const compress = promisify(gzip);

export function createLogger(root) {
  let pending = Promise.resolve();
  const directory = resolve(root, ".runtime");
  return {
    write(event, details = {}) {
      // Log operational metadata only; never form content, credentials or cookies.
      const item = { time: new Date().toISOString(), event, ...details };
      // Concatenated gzip members are append-only and readable with gunzip.
      // Hourly files bound individual file growth; older files are never erased.
      const file = resolve(directory, `events-${item.time.slice(0, 13).replace("T", "-")}.jsonl.gz`);
      pending = pending.then(async () => {
        await mkdir(directory, { recursive: true, mode: 0o700 });
        await appendFile(file, await compress(`${JSON.stringify(item)}\n`), { mode: 0o600 });
      }).catch(() => { console.error("Operational log could not be written."); });
    },
    async flush() { await pending; },
  };
}
