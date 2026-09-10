import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  const both = Buffer.concat([t, data]);
  crc.writeUInt32BE(crc32(both));
  return Buffer.concat([len, both, crc]);
}

function png(size, rgb) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const stride = 1 + size * 3;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y++) {
    raw[y * stride] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * stride + 1 + x * 3;
      const cx = x - size / 2;
      const cy = y - size / 2;
      const d = Math.sqrt(cx * cx + cy * cy);
      const on = d < size * 0.42;
      raw[i] = on ? rgb[0] : 7;
      raw[i + 1] = on ? rgb[1] : 11;
      raw[i + 2] = on ? rgb[2] : 20;
    }
  }
  const idat = zlib.deflateSync(raw);
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

const dir = path.join(__dirname, "../icons");
fs.mkdirSync(dir, { recursive: true });
for (const s of [16, 48, 128]) {
  fs.writeFileSync(path.join(dir, `icon${s}.png`), png(s, [110, 168, 255]));
}
console.log("icons written");
