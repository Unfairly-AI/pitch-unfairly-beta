// Seam detector for transparent print art (merch PNGs).
//   node tools/engine/collateral/seams.mjs artifacts/collateral/print/tee-art.png [more.png …]
// A hairline row is a pixel row where more than `minRun` pixels are partly transparent (alpha < 250)
// while the pixels directly above and below are opaque: the faint line a sliced headline leaves where
// two separately clipped slices meet. Exits 1 when any file has one.
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

/** Decodes an 8-bit, non-interlaced RGBA or RGB PNG (what Chrome screenshots write) to { width, height, channels, data }. */
export function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let off = 8, width, height, depth, type, interlace;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const kind = buf.toString('latin1', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (kind === 'IHDR') { width = body.readUInt32BE(0); height = body.readUInt32BE(4); depth = body[8]; type = body[9]; interlace = body[12]; }
    else if (kind === 'IDAT') idat.push(body);
    else if (kind === 'IEND') break;
    off += 12 + len;
  }
  if (depth !== 8 || interlace !== 0 || (type !== 6 && type !== 2)) throw new Error(`unsupported PNG (depth ${depth}, type ${type}, interlace ${interlace})`);
  const channels = type === 6 ? 4 : 3;
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const data = Buffer.alloc(stride * height);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = data.subarray(y * stride, (y + 1) * stride);
    const prev = y ? data.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= channels ? row[i - channels] : 0;
      const b = prev ? prev[i] : 0;
      const c = prev && i >= channels ? prev[i - channels] : 0;
      let v = src[i];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      row[i] = v & 255;
    }
  }
  return { width, height, channels, data };
}

/** Rows (y) that hold a seam in an RGBA image. */
export function hairlineRows({ width, height, channels, data }, minRun = 20) {
  if (channels !== 4) return [];
  const A = (x, y) => data[(y * width + x) * 4 + 3];
  const rows = [];
  for (let y = 1; y < height - 1; y++) {
    let n = 0;
    for (let x = 0; x < width; x++) if (A(x, y) < 250 && A(x, y - 1) > 250 && A(x, y + 1) > 250) n++;
    if (n > minRun) rows.push(y);
  }
  return rows;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let bad = 0;
  for (const file of process.argv.slice(2)) {
    const rows = hairlineRows(decodePng(readFileSync(file)));
    console.log(`${rows.length ? '✗' : '✓'} ${file}: ${rows.length} hairline row${rows.length === 1 ? '' : 's'}${rows.length ? ` (y ${rows.slice(0, 12).join(', ')}${rows.length > 12 ? ', …' : ''})` : ''}`);
    if (rows.length) bad++;
  }
  process.exit(bad ? 1 : 0);
}
