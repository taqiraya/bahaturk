import { resolve } from "node:path";
import { loadConfig } from "../server/config.js";
import { connectDatabase } from "../server/database.js";
import { inspectStorage } from "../server/storage-monitor.js";

const root = resolve(import.meta.dirname, "..");
const config = loadConfig(root);
const database = await connectDatabase(config.database);
try {
  const status = await inspectStorage(root, database, config.storageLimits);
  console.log(JSON.stringify(status, null, 2));
  if (status.warnings.length) process.exitCode = 1;
} finally { await database.close(); }
