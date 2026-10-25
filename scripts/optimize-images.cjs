// Run after capturing the actual used-image inventory in .runtime/image-usage.json.
// Originals are copied outside public/ before any optimized file is written.
const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require(process.env.IMAGE_TOOLS_MODULE || "sharp");
const root = path.resolve(__dirname, "..");
const threshold = 150000;

function similarity(a, b, width, height) {
  let total = 0, count = 0;
  for (let y = 0; y < height; y += 8) for (let x = 0; x < width; x += 8) {
    let sx = 0, sy = 0, xx = 0, yy = 0, xy = 0, n = 0;
    for (let dy = y; dy < Math.min(y + 8, height); dy++) for (let dx = x; dx < Math.min(x + 8, width); dx++) {
      const p = (dy * width + dx) * 3;
      const u = .2126 * a[p] + .7152 * a[p + 1] + .0722 * a[p + 2];
      const v = .2126 * b[p] + .7152 * b[p + 1] + .0722 * b[p + 2];
      sx += u; sy += v; xx += u * u; yy += v * v; xy += u * v; n++;
    }
    const mx = sx / n, my = sy / n;
    const vx = Math.max(0, xx / n - mx * mx), vy = Math.max(0, yy / n - my * my), covariance = xy / n - mx * my;
    total += ((2 * mx * my + 6.5025) * (2 * covariance + 58.5225)) / ((mx * mx + my * my + 6.5025) * (vx + vy + 58.5225));
    count++;
  }
  return total / count;
}

async function main() {
  const inventory = JSON.parse(await fs.readFile(path.join(root, ".runtime/image-usage.json"), "utf8"));
  const directory = path.join(root, ".media-originals", `compression-${Date.now()}`);
  await fs.mkdir(directory, { recursive: true });
  const report = [];
  for (const item of inventory.used.filter((item) => item.bytes > threshold)) {
    const file = path.resolve(root, item.file);
    if (!file.startsWith(root + path.sep) || !/^(public|src)[/\\]/.test(item.file)) throw new Error("Invalid image path");
    const original = await fs.readFile(file);
    if (original.length !== item.bytes) throw new Error("Image inventory is stale; capture a fresh inventory before optimizing again.");
    const metadata = await sharp(original).metadata();
    if (metadata.pages > 1) throw new Error("Animated images require a separate lossless workflow");
    const sample = await sharp(original).resize({ width: Math.min(1440, metadata.width), withoutEnlargement: true }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
    let best;
    for (const quality of [90, 85, 80, 75]) {
      const pipeline = sharp(original);
      const result = await (metadata.format === "jpeg" ? pipeline.jpeg({ quality, mozjpeg: true }) : pipeline.webp({ quality, effort: 6 })).toBuffer();
      if (result.length >= original.length) continue;
      const preview = await sharp(result).resize({ width: sample.info.width, withoutEnlargement: true }).removeAlpha().toColourspace("srgb").raw().toBuffer();
      const score = similarity(sample.data, preview, sample.info.width, sample.info.height);
      if (score < .99) continue;
      best = { buffer: result, quality, similarity: score };
      if (result.length <= threshold) break;
    }
    const entry = { file: item.file, originalBytes: original.length, width: metadata.width, height: metadata.height, sha256: crypto.createHash("sha256").update(original).digest("hex") };
    if (best) {
      const backup = path.join(directory, item.file);
      await fs.mkdir(path.dirname(backup), { recursive: true });
      await fs.writeFile(backup, original, { flag: "wx" });
      const optimizedMetadata = await sharp(best.buffer).metadata();
      if (optimizedMetadata.width !== metadata.width || optimizedMetadata.height !== metadata.height) throw new Error("Image dimensions changed");
      await fs.writeFile(file, best.buffer);
      Object.assign(entry, { optimizedBytes: best.buffer.length, quality: best.quality, similarity: best.similarity, backup: path.relative(root, backup) });
    } else Object.assign(entry, { optimizedBytes: original.length, retained: "Already compressed; further reduction would exceed the visual quality limit." });
    report.push(entry);
    await fs.writeFile(path.join(directory, "manifest.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(entry));
  }
  console.log("Originals and manifest:", directory);
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
