import * as esbuild from "esbuild";
import { cpSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const outdir = join(root, "dist");
const watch = process.argv.includes("--watch");
const production = process.argv.includes("--production");
const defaultApiUrl = (process.env.LIGHT_API_URL || "http://localhost:4000").replace(/\/$/, "");

if (production) {
  let parsed;
  try {
    parsed = new URL(defaultApiUrl);
  } catch {
    throw new Error("LIGHT_API_URL must be a valid deployed API URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Production extension requires an HTTPS LIGHT_API_URL");
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuffer = Buffer.from(type, "ascii");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, checksum]);
}

function createLightIcon(size, destination) {
  const stride = size * 4 + 1;
  const raw = Buffer.alloc(stride * size);
  const margin = size * 0.08;
  const radius = size * 0.22;
  const left = Math.round(size * 0.28);
  const stemRight = Math.round(size * 0.43);
  const top = Math.round(size * 0.2);
  const bottom = Math.round(size * 0.74);
  const footTop = Math.round(size * 0.59);
  const footRight = Math.round(size * 0.73);

  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const offset = row + 1 + x * 4;
      const nearestX = Math.max(margin + radius, Math.min(x, size - margin - radius));
      const nearestY = Math.max(margin + radius, Math.min(y, size - margin - radius));
      const dx = x - nearestX;
      const dy = y - nearestY;
      const inside = dx * dx + dy * dy <= radius * radius;
      const isLetter =
        inside &&
        ((x >= left && x <= stemRight && y >= top && y <= bottom) ||
          (x >= left && x <= footRight && y >= footTop && y <= bottom));
      const ratio = (x + y) / Math.max(1, size * 2);
      raw[offset] = isLetter ? 255 : Math.round(71 + ratio * 68);
      raw[offset + 1] = isLetter ? 255 : Math.round(111 + ratio * 27);
      raw[offset + 2] = isLetter ? 255 : Math.round(255 - ratio * 65);
      raw[offset + 3] = inside ? 255 : 0;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(destination, png);
}

mkdirSync(outdir, { recursive: true });

function copyStatic() {
  cpSync(join(root, "manifest.json"), join(outdir, "manifest.json"));
  cpSync(join(root, "popup"), join(outdir, "popup"), { recursive: true });
  cpSync(join(root, "options"), join(outdir, "options"), { recursive: true });
  const popupPath = join(outdir, "popup", "popup.html");
  const popupHtml = readFileSync(popupPath, "utf8").replace(
    'value="http://localhost:4000"',
    `value="${defaultApiUrl}"`,
  );
  writeFileSync(popupPath, popupHtml);
  const iconDirectory = join(outdir, "icons");
  const iconSizes = [16, 48, 128];
  mkdirSync(iconDirectory, { recursive: true });
  for (const size of iconSizes) {
    createLightIcon(size, join(iconDirectory, `icon${size}.png`));
  }
  mkdirSync(join(outdir, "models"), { recursive: true });
  writeFileSync(join(outdir, "models", "README.md"), "# Place quantized ONNX models here for local vision.\n");
}

copyStatic();

const shared = {
  bundle: true,
  format: "esm",
  target: ["chrome120"],
  sourcemap: !production,
  logLevel: "info",
  define: {
    __LIGHT_API_URL__: JSON.stringify(defaultApiUrl),
  },
};

const contexts = await Promise.all([
  esbuild.context({
    ...shared,
    entryPoints: [join(root, "src/background/index.ts")],
    outfile: join(outdir, "background.js"),
  }),
  esbuild.context({
    ...shared,
    // Manifest content scripts and chrome.scripting.executeScript({ files })
    // are classic scripts. ESM output leaves an `export` token that Chrome
    // rejects before our message listener can register.
    format: "iife",
    entryPoints: [join(root, "src/content/index.ts")],
    outfile: join(outdir, "content.js"),
  }),
  esbuild.context({
    ...shared,
    entryPoints: [join(root, "src/popup/popup.ts")],
    outfile: join(outdir, "popup/popup.js"),
  }),
  esbuild.context({
    ...shared,
    entryPoints: [join(root, "src/options/options.ts")],
    outfile: join(outdir, "options/options.js"),
  }),
]);

if (watch) {
  await Promise.all(contexts.map((c) => c.watch()));
  console.log("Watching extension sources...");
} else {
  await Promise.all(contexts.map((c) => c.rebuild()));
  await Promise.all(contexts.map((c) => c.dispose()));
  const contentBundle = readFileSync(join(outdir, "content.js"), "utf8");
  if (/^\s*export\s/m.test(contentBundle)) {
    throw new Error("Content script must be a classic script; ESM export found");
  }
  console.log("Extension built to apps/extension/dist");
}
