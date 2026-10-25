const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");
const sharp = require(process.env.IMAGE_TOOLS_MODULE || "sharp");
const root = path.resolve(__dirname, "..");

async function main() {
  const inventory = JSON.parse(await fs.readFile(path.join(root, ".runtime/image-usage.json"), "utf8"));
  const { directory } = JSON.parse(await fs.readFile(path.join(root, ".runtime/performance-baseline.json"), "utf8"));
  const baseline = JSON.parse(await fs.readFile(path.join(root, directory, "browser-before.json"), "utf8"));
  const output = path.join(root, "public/images/responsive");
  await fs.mkdir(output, { recursive: true });
  const manifest = {};
  function imageKey(src) {
    if (src.includes("/assets/featured_project-")) return "@featured";
    return src.replace(/^\/BahaTurk\//, "").replace(/^\//, "");
  }
  for (const item of inventory.used) {
    const key = item.file.startsWith("public/") ? item.file.slice(7) : "@featured";
    const placements = baseline.flatMap((page) => page.layout.filter((element) => element.tag === "IMG" && element.width > 0 && imageKey(element.src) === key).map((element) => ({ ...element, viewport: page.width })));
    // CSS cover backgrounds retain their original resolution and crop.
    if (!placements.length) continue;
    const original = await fs.readFile(path.join(root, item.file));
    const metadata = await sharp(original).metadata();
    if (original.length < 50000 || metadata.width <= 768 || metadata.pages > 1) continue;
    const hash = crypto.createHash("sha256").update(original).digest("hex").slice(0, 12);
    const name = path.basename(item.file, path.extname(item.file));
    const variants = [];
    for (const width of [480, 768, 1024, 1440, 1920, 2560].filter((width) => width < metadata.width)) {
      const filename = `${name}-${hash}-${width}.webp`;
      const buffer = await sharp(original).resize({ width, withoutEnlargement: true }).webp({ quality: 90, effort: 4 }).toBuffer();
      if (buffer.length >= original.length) continue;
      const file = path.join(output, filename);
      try { await fs.writeFile(file, buffer, { flag: "wx" }); } catch (error) { if (error.code !== "EEXIST") throw error; }
      variants.push({ src: `images/responsive/${filename}`, width, bytes: buffer.length });
    }
    if (!variants.length) continue;
    const effectiveWidth = (element) => 1.25 * Math.max(element.width, element.height * metadata.width / metadata.height);
    const mobile = Math.ceil(Math.max(...placements.filter((element) => element.viewport < 768).map(effectiveWidth), 1));
    const desktop = Math.ceil(Math.max(...placements.filter((element) => element.viewport >= 768).map(effectiveWidth), mobile));
    // Account for object-cover's crop: the requested pixels also cover height.
    const sizes = `(min-width: 1280px) ${desktop}px, (min-width: 768px) max(100vw, ${desktop}px), max(100vw, ${mobile}px)`;
    manifest[key] = { width: metadata.width, height: metadata.height, sizes, variants };
    console.log(`${key}: ${variants.length} derivatives, original retained`);
  }
  await fs.writeFile(path.join(root, "src/api/responsive-images.json"), JSON.stringify(manifest, null, 2) + "\n");
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
