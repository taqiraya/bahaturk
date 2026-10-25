const base = process.argv[2] || "http://127.0.0.1:3000/";
try {
  const response = await fetch(new URL("api/health", base.endsWith("/") ? base : `${base}/`), { signal: AbortSignal.timeout(10000) });
  if (!response.ok || (await response.json()).status !== "ok") throw new Error("unavailable");
  console.log("Website API and MySQL: OK");
} catch {
  console.error("Website API or MySQL is unavailable. Check the protected .runtime event log.");
  process.exitCode = 1;
}
