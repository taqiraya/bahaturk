import { stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { brotliCompress, gzip, constants } from "node:zlib";
import { promisify } from "node:util";

const encodeBrotli = promisify(brotliCompress);
const encodeGzip = promisify(gzip);

export function chooseEncoding(header, available = ["br", "gzip"]) {
  if (!header) return "identity";
  const weights = new Map();
  for (const item of header.toLowerCase().split(",")) {
    const [name, ...parameters] = item.trim().split(";");
    const parameter = parameters.find((value) => value.trim().startsWith("q="));
    const weight = parameter ? Number(parameter.trim().slice(2)) : 1;
    weights.set(name.trim(), Number.isFinite(weight) && weight >= 0 && weight <= 1 ? weight : 0);
  }
  const choices = available.map((encoding) => ({ encoding, weight: weights.get(encoding) ?? weights.get("*") ?? 0 }));
  choices.push({ encoding: "identity", weight: weights.get("identity") ?? (weights.get("*") === 0 ? 0 : .001) });
  return choices.filter((choice) => choice.weight > 0).sort((a, b) => b.weight - a.weight)[0]?.encoding ?? null;
}

export async function sendHtml(req, res, html, status = 200) {
  const encoding = chooseEncoding(req.headers["accept-encoding"]);
  if (!encoding) { res.writeHead(406, { Vary: "Accept-Encoding" }).end(); return; }
  let body = Buffer.from(html);
  if (encoding === "br") body = await encodeBrotli(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 5 } });
  else if (encoding === "gzip") body = await encodeGzip(body);
  res.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8", "X-Content-Type-Options": "nosniff", "Cache-Control": "no-store",
    Vary: "Accept-Encoding", "Content-Length": body.length,
    ...(encoding === "identity" ? {} : { "Content-Encoding": encoding }),
  });
  res.end(req.method === "HEAD" ? undefined : body);
}

export async function serveStatic(req, res, file, contentType, cacheControl) {
  const metadata = await stat(file);
  if (!metadata.isFile()) { res.writeHead(404).end(); return; }
  const variants = {};
  for (const [encoding, suffix] of [["br", ".br"], ["gzip", ".gz"]]) {
    try {
      const compressed = await stat(file + suffix);
      if (compressed.isFile() && compressed.mtimeMs >= metadata.mtimeMs && compressed.size < metadata.size) variants[encoding] = { file: file + suffix, size: compressed.size };
    } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
  const encoding = chooseEncoding(req.headers["accept-encoding"], Object.keys(variants));
  if (!encoding) { res.writeHead(406, { Vary: "Accept-Encoding" }).end(); return; }
  const selected = variants[encoding] || { file, size: metadata.size };
  const etag = `W/"${metadata.size.toString(16)}-${Math.floor(metadata.mtimeMs).toString(16)}-${encoding}"`;
  const headers = {
    "Content-Type": contentType, "X-Content-Type-Options": "nosniff", "Cache-Control": cacheControl,
    Vary: "Accept-Encoding", ETag: etag, "Last-Modified": metadata.mtime.toUTCString(),
    ...(encoding === "identity" ? {} : { "Content-Encoding": encoding }),
  };
  const unchanged = req.headers["if-none-match"] ? req.headers["if-none-match"].split(",").map((value) => value.trim()).some((value) => value === etag || value === "*")
    : req.headers["if-modified-since"] && Math.floor(metadata.mtimeMs / 1000) * 1000 <= Date.parse(req.headers["if-modified-since"]);
  if (unchanged) { res.writeHead(304, headers).end(); return; }
  res.writeHead(200, { ...headers, "Content-Length": selected.size });
  if (req.method === "HEAD") { res.end(); return; }
  const stream = createReadStream(selected.file);
  stream.on("error", () => res.destroy());
  stream.pipe(res);
}
