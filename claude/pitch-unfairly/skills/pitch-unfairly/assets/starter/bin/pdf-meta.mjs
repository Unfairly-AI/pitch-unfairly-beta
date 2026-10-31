// Title, Author, Subject and Keywords for a PDF Chrome printed (Puppeteer has
// no options for them). Written as an incremental update: a new Info
// dictionary appended after the original bytes, with an xref section and a
// trailer that points back at the old one, so the tags, the outline and every
// page stay exactly as Chrome wrote them. Readers take the last trailer's Info.

/** A PDF text string: UTF-16BE with a byte-order mark, in hex, so any character survives. */
export function pdfString(s) {
  const units = [0xfeff, ...[...String(s)].flatMap((c) => {
    const code = c.codePointAt(0);
    if (code < 0x10000) return [code];
    const v = code - 0x10000;
    return [0xd800 + (v >> 10), 0xdc00 + (v & 0x3ff)];
  })];
  return `<${units.map((u) => u.toString(16).padStart(4, '0')).join('').toUpperCase()}>`;
}

/** The entries of a PDF dictionary body, as [key, raw value] pairs (strings, names, numbers, references). */
function entries(body) {
  const out = [];
  let i = 0;
  const skip = () => { while (i < body.length && /\s/.test(body[i])) i++; };
  while (i < body.length) {
    skip();
    if (body[i] !== '/') break;
    const key = /^\/[^\s/<>()[\]{}%]+/.exec(body.slice(i))[0];
    i += key.length;
    skip();
    const start = i;
    if (body[i] === '(') {
      let depth = 0;
      for (; i < body.length; i++) {
        if (body[i] === '\\') { i++; continue; }
        if (body[i] === '(') depth++;
        else if (body[i] === ')' && --depth === 0) { i++; break; }
      }
    } else if (body[i] === '<' || body[i] === '[') {
      i = body.indexOf(body[i] === '<' ? '>' : ']', i) + 1;
    } else {
      const m = /^(\d+\s+\d+\s+R|\/[^\s/<>()[\]{}%]+|[^\s/]+)/.exec(body.slice(i));
      i += m ? m[0].length : 1;
    }
    out.push([key, body.slice(start, i)]);
  }
  return out;
}

const FIELDS = { title: '/Title', author: '/Author', subject: '/Subject', keywords: '/Keywords' };

/** The body of object `ref` ("12 0 R"), or null. */
function objectBody(text, ref) {
  const m = /^(\d+)\s+(\d+)\s+R$/.exec(ref ?? '');
  if (!m) return null;
  return new RegExp(`(?:^|[\\r\\n\\s])${m[1]}\\s+${m[2]}\\s+obj\\s*<<([\\s\\S]*?)>>\\s*endobj`).exec(text)?.[1] ?? null;
}

/**
 * The PDF with its document info set and, given `outline` ([{ title, page }],
 * page counted from 0), a flat outline in place of Chrome's: one entry per
 * slide, where Chrome nests every slide under the cover's h1 and runs the
 * words of a wrapped headline together. Empty info fields are left as they
 * were. A PDF this can't update in place (a cross-reference stream rather
 * than a table) comes back unchanged.
 */
export function stampPdf(bytes, { info = {}, outline = [] } = {}) {
  const src = Buffer.from(bytes);
  const text = src.toString('latin1');
  const at = text.lastIndexOf('trailer');
  const sx = /startxref\s+(\d+)/.exec(text.slice(at));
  if (at < 0 || !sx) return src;
  const t = Object.fromEntries(entries(/<<([\s\S]*?)>>\s*startxref/.exec(text.slice(at))?.[1] ?? ''));
  const size = Number(t['/Size']);
  if (!t['/Root'] || !Number.isInteger(size)) return src;

  // Keep what Chrome wrote (Creator, Producer, dates) and override the rest.
  const keep = new Map(entries(objectBody(text, t['/Info']) ?? ''));
  for (const [field, key] of Object.entries(FIELDS)) {
    const value = String(info[field] ?? '').replace(/\s+/g, ' ').trim();
    if (value) keep.set(key, pdfString(value));
  }
  const objects = [[size, `<<${[...keep].map(([k, v]) => `${k} ${v}`).join('\n')}>>`]];

  // The outline: needs the catalog and its pages, in order (Chrome groups them eight to a node).
  const catalog = objectBody(text, t['/Root']);
  const pages = [];
  let tree = true;
  const walk = (ref, depth = 0) => {
    const body = objectBody(text, ref);
    if (!body || depth > 8) return (tree = false);
    if (!/\/Type\s*\/Pages\b/.test(body)) return pages.push(ref);
    const kids = /\/Kids\s*\[([^\]]*)\]/.exec(body)?.[1] ?? '';
    for (const m of kids.matchAll(/(\d+)\s+(\d+)\s+R/g)) walk(`${m[1]} ${m[2]} R`, depth + 1);
  };
  walk(/\/Pages\s+(\d+\s+\d+\s+R)/.exec(catalog ?? '')?.[1]);
  const items = outline.filter((o) => String(o.title ?? '').trim() && pages[o.page]);
  if (catalog && tree && items.length && pages.every((p) => /\/Type\s*\/Page\b/.test(objectBody(text, p) ?? ''))) {
    const root = size + 1;
    const first = root + 1;
    const last = first + items.length - 1;
    objects.push([root, `<</Type /Outlines\n/First ${first} 0 R\n/Last ${last} 0 R\n/Count ${items.length}>>`]);
    items.forEach((o, i) => objects.push([first + i, `<</Title ${pdfString(String(o.title).replace(/\s+/g, ' ').trim())}\n/Parent ${root} 0 R\n/Dest [${pages[o.page]} /Fit]${i ? `\n/Prev ${first + i - 1} 0 R` : ''}${i < items.length - 1 ? `\n/Next ${first + i + 1} 0 R` : ''}>>`]));
    const body = /\/Outlines\s+\d+\s+\d+\s+R/.test(catalog) ? catalog.replace(/\/Outlines\s+\d+\s+\d+\s+R/, `/Outlines ${root} 0 R`) : `${catalog}\n/Outlines ${root} 0 R`;
    objects.push([Number(t['/Root'].split(/\s+/)[0]), `<<${body}>>`, Number(t['/Root'].split(/\s+/)[1])]);
  }

  let out = src.at(-1) === 0x0a ? '' : '\n';
  const offsets = [];
  for (const [num, dict, gen = 0] of objects) {
    offsets.push([num, gen, src.length + out.length]);
    out += `${num} ${gen} obj\n${dict}\nendobj\n`;
  }
  const xref = src.length + out.length;
  // One subsection per run of consecutive object numbers.
  const sections = [];
  for (const o of [...offsets].sort((a, b) => a[0] - b[0])) {
    const run = sections.at(-1);
    if (run && run.at(-1)[0] === o[0] - 1) run.push(o);
    else sections.push([o]);
  }
  out += [
    'xref',
    // The free list's head, as every table starts: strict readers expect object 0.
    '0 1',
    '0000000000 65535 f ',
    ...sections.flatMap((run) => [`${run[0][0]} ${run.length}`, ...run.map(([, gen, off]) => `${String(off).padStart(10, '0')} ${String(gen).padStart(5, '0')} n `)]),
    'trailer',
    `<</Size ${Math.max(size + 1, ...objects.map(([n]) => n + 1))}`,
    `/Root ${t['/Root']}`,
    `/Info ${size} 0 R`,
    ...(t['/ID'] ? [`/ID ${t['/ID']}`] : []),
    `/Prev ${sx[1]}>>`,
    'startxref',
    String(xref),
    '%%EOF',
    '',
  ].join('\n');
  return Buffer.concat([src, Buffer.from(out, 'latin1')]);
}
