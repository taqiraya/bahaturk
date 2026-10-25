import { readdir, stat, statfs } from "node:fs/promises";
import { resolve } from "node:path";

const excluded = new Set(["node_modules", ".git", ".codex", ".agents", ".aws", ".browser-cache", ".pnpm-store", ".npm-cache"]);
async function directoryBytes(directory, skipDependencies = false) {
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return 0; throw error; }
  let total = 0;
  for (const entry of entries) {
    if (skipDependencies && excluded.has(entry.name)) continue;
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) total += await directoryBytes(path, skipDependencies);
    else if (entry.isFile()) total += (await stat(path)).size;
  }
  return total;
}

export async function inspectStorage(root, database, limits = {}) {
  const runtimeBytes = await directoryBytes(resolve(root, ".runtime"));
  const workspaceBytes = await directoryBytes(root, true);
  const folders = {};
  for (const directory of ["dist", "releases", ".media-originals", "public"]) folders[directory] = await directoryBytes(resolve(root, directory));
  let diskFreeBytes = null;
  try { const volume = await statfs(root); diskFreeBytes = Number(volume.bavail) * Number(volume.bsize); } catch { /* Some shared hosts do not expose volume statistics. */ }
  const details = await database.storageStats();
  const warnings = [];
  if (runtimeBytes >= (limits.runtimeBytes ?? 100 * 1024 * 1024)) warnings.push("runtime_storage");
  if (details.databaseBytes >= (limits.databaseBytes ?? 500 * 1024 * 1024)) warnings.push("database_storage");
  if (details.retiredSessions >= (limits.retiredSessions ?? 100000)) warnings.push("retained_sessions");
  if (workspaceBytes >= (limits.workspaceBytes ?? 1024 * 1024 * 1024)) warnings.push("workspace_storage");
  if (diskFreeBytes === null) warnings.push("disk_space_unknown");
  else if (diskFreeBytes < (limits.minFreeBytes ?? 512 * 1024 * 1024)) warnings.push("disk_free_space");
  return { runtimeBytes, workspaceBytes, folders, diskFreeBytes, ...details, warnings };
}

export function startStorageMonitor(root, database, logger, limits) {
  let pending;
  let previous = "";
  const check = () => {
    if (pending) return pending;
    pending = inspectStorage(root, database, limits).then((status) => {
      const signature = status.warnings.join(",");
      if (signature !== previous) {
        logger.write(signature ? "storage_warning" : "storage_recovered", status);
        if (signature) console.warn("Storage needs attention:", signature, "Run npm run storage:status. No data was removed.");
        previous = signature;
      }
      return status;
    }).catch(() => { logger.write("storage_check_unavailable"); }).finally(() => { pending = null; });
    return pending;
  };
  const timer = setInterval(check, 60 * 60 * 1000);
  timer.unref();
  void check();
  return { async stop() { clearInterval(timer); await pending; } };
}
