import { isIP } from "node:net";

export function normalizeIp(value) {
  const ip = String(value || "").trim();
  return ip.startsWith("::ffff:") && isIP(ip.slice(7)) === 4 ? ip.slice(7) : ip;
}

// Only trust explicitly configured proxy addresses. Read the forwarded chain
// from the socket toward the client, stopping at the first untrusted hop.
export function getClientIp(req, trustedProxies = []) {
  const socket = normalizeIp(req.socket.remoteAddress);
  const trusted = new Set(trustedProxies.map(normalizeIp));
  if (!trusted.has(socket)) return socket || "unknown";
  const header = req.headers["x-forwarded-for"];
  if (typeof header !== "string") return socket;
  const chain = header.split(",").map(normalizeIp);
  if (chain.length > 20 || chain.some((ip) => !isIP(ip))) return socket;
  let client = socket;
  for (let i = chain.length - 1; i >= 0 && trusted.has(client); i--) client = chain[i];
  return client;
}
