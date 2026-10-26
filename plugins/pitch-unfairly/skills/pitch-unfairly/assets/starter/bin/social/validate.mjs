// Checks one rendered file against its format's spec. Pure: give it what was measured.
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';
import { execFileSync } from 'node:child_process';

/** Pixel size of a PNG or JPEG from its header, or null. */
export function imageSize(buf) {
  if (buf.length > 24 && buf.readUInt32BE(0) === 0x89504e47) return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const m = buf[i + 1];
      if (m >= 0xc0 && m <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(m)) return { w: buf.readUInt16BE(i + 7), h: buf.readUInt16BE(i + 5) };
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  if (buf.length > 10 && buf.toString('ascii', 0, 3) === 'GIF') return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  return null;
}

let ffprobeOk;
/** Video facts via ffprobe, or null when ffprobe isn't installed. */
export function probeVideo(file) {
  if (ffprobeOk === false) return null;
  try {
    const j = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=width,height,codec_name,codec_type:format=duration', '-of', 'json', file]).toString());
    ffprobeOk = true;
    const v = j.streams.find((s) => s.codec_type === 'video') ?? {};
    return { w: v.width, h: v.height, codec: v.codec_name, audio: j.streams.some((s) => s.codec_type === 'audio'), duration: Number(j.format?.duration) };
  } catch (e) {
    if (e.code === 'ENOENT') { ffprobeOk = false; return null; }
    throw e;
  }
}

/** The byte limit for a still, in KB, or null. */
export const maxKb = (spec) => spec.file?.max_kb ?? (spec.file?.max_mb ? spec.file.max_mb * 1024 : null);

/**
 * Checks for one file. `facts` = { w, h, kb, ext, duration?, codec? }. Returns [{ ok, m }].
 * Document pages (cards of a document format) are PDF pages, so their file type isn't checked.
 */
export function checkFile(spec, name, facts, { page = false } = {}) {
  const out = [];
  const fail = (m) => out.push({ ok: false, m: `${name}: ${m}` });
  const pass = (m) => out.push({ ok: true, m: `${name}: ${m}` });
  if (facts.w == null) pass('size not measured (ffprobe isn\'t installed)');
  else if (facts.w !== spec.canvas.w || facts.h !== spec.canvas.h) fail(`${facts.w}×${facts.h}, spec ${spec.canvas.w}×${spec.canvas.h}`);
  else pass(`${facts.w}×${facts.h}`);
  if (spec.min && facts.w != null && (facts.w < (spec.min.w ?? 0) || facts.h < (spec.min.h ?? 0))) fail(`below the ${spec.min.w}×${spec.min.h} minimum`);
  const types = (spec.file?.types ?? []).map((t) => t.toLowerCase());
  if (facts.ext === 'mp4') {
    const v = spec.video ?? {};
    if (facts.duration != null) {
      if (v.min_s != null && facts.duration < v.min_s - 0.05) fail(`${facts.duration.toFixed(1)}s, under the ${v.min_s}s minimum`);
      else if (v.max_s != null && facts.duration > v.max_s + 0.05) fail(`${facts.duration.toFixed(1)}s, over the ${v.max_s}s maximum`);
      else pass(`${facts.duration.toFixed(1)}s`);
      const [lo, hi] = v.recommended_s ?? [];
      if ((lo != null && facts.duration < lo - 0.05) || (hi != null && facts.duration > hi + 0.05)) {
        out.push({ ok: true, warn: true, m: `${name}: ${facts.duration.toFixed(1)}s is outside the ${lo ?? 0}–${hi ?? '∞'}s the platform recommends` });
      }
    }
    if (v.max_mb && facts.kb > v.max_mb * 1024) fail(`${facts.kb}KB, over ${v.max_mb}MB`);
    const vt = (v.types ?? []).map((t) => t.toLowerCase());
    if (vt.length && !vt.includes('mp4')) fail(`mp4 isn't among ${vt.join(', ')}`);
  } else if (facts.ext !== 'gif' && !page) {
    const lim = maxKb(spec);
    if (lim && facts.kb > lim) fail(`${facts.kb}KB, over ${lim}KB`);
    else pass(`${facts.kb}KB${lim ? ` of ${lim}KB` : ''}`);
    const ok = !types.length || types.includes(facts.ext) || (facts.ext === 'jpg' && types.includes('jpeg'));
    if (!ok) fail(`.${facts.ext} isn't among ${types.join(', ')}`);
  }
  return out;
}

/** Facts for a file on disk. */
export function fileFacts(file) {
  const ext = extname(file).slice(1).toLowerCase();
  const kb = Math.round(statSync(file).size / 1024);
  if (ext === 'mp4') return { ext, kb, ...(probeVideo(file) ?? {}) };
  return { ext, kb, ...(imageSize(readFileSync(file)) ?? {}) };
}
