// A site as plain text for AI agents: dist-site/index.txt, from the same
// filled section HTML the page renders. Agents that fetch a site's link get
// the badged frame, not the page inside it; the host serves this file at
// <link>/index.txt behind the link's own gates and points agents at it.
//
// Markdown-flavored: headings, lists, links with their URLs, tables, code.
// Left out: scripts, styles, drawings, navigation (the page's own table of
// contents), buttons and form controls, anything
// hidden from readers (hidden, aria-hidden="true"), and anything a section
// marks data-text="skip" (say, a decorative marquee that repeats a heading).
// Relative links stay relative: the host serves a version's .txt and .json
// files beside <link>/index.txt, behind the same gates, so they resolve.

const DROP = new Set(['script', 'style', 'svg', 'template', 'nav', 'button', 'select', 'textarea', 'input', 'canvas', 'iframe', 'video', 'audio', 'object', 'head', 'title']);
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const BLOCK = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'nav', 'aside', 'figure', 'figcaption', 'blockquote', 'dl', 'dt', 'dd', 'form', 'fieldset', 'details', 'summary', 'address']);
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '-', ndash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"', middot: '·', times: '×', copy: '©', reg: '®', trade: '™', rarr: '→', larr: '←', bull: '•', euro: '€', pound: '£', yen: '¥', deg: '°', plusmn: '±', le: '≤', ge: '≥', minus: '−', thinsp: ' ', ensp: ' ', emsp: ' ', zwj: '', zwnj: '', shy: '' };

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (whole, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : whole;
    }
    return NAMED[e.toLowerCase()] ?? whole;
  });
}

function attrs(src) {
  const out = {};
  for (const m of src.matchAll(/([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? m[4] ?? '');
  return out;
}

/** Parse just enough HTML into a tree: elements, text, comments dropped. Unclosed tags close with their parent. */
function parse(html) {
  const root = { tag: '#root', attrs: {}, kids: [] };
  const stack = [root];
  const re = /<!--[\s\S]*?-->|<(\/?)([a-zA-Z][\w:-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>|([^<]+|<)/g;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const [, closing, rawTag, rest, text] = m;
    if (text !== undefined) {
      stack.at(-1).kids.push({ text: decodeEntities(text) });
      continue;
    }
    if (!rawTag) continue;
    const tag = rawTag.toLowerCase();
    if (closing) {
      const at = stack.findLastIndex((n) => n.tag === tag);
      if (at > 0) stack.length = at;
      continue;
    }
    const node = { tag, attrs: attrs(rest ?? ''), kids: [] };
    stack.at(-1).kids.push(node);
    // Raw-text elements: skip to their close tag without parsing what's inside.
    if (tag === 'script' || tag === 'style') {
      const end = html.indexOf(`</${tag}`, m.index + m[0].length);
      re.lastIndex = end < 0 ? html.length : end;
      continue;
    }
    if (!VOID.has(tag) && !/\/\s*$/.test(rest ?? '')) stack.push(node);
  }
  return root;
}

const hiddenNode = (n) =>
  DROP.has(n.tag) || 'hidden' in n.attrs || n.attrs['aria-hidden'] === 'true' || n.attrs['data-text'] === 'skip' || /(^|;)\s*display\s*:\s*none/i.test(n.attrs.style ?? '');

const squash = (s) => s.replace(/[ \t\r\n\f]+/g, ' ');

/** The inline text of a node: links keep their URL, code its backticks. */
function inline(n) {
  if (n.text !== undefined) return squash(n.text);
  if (hiddenNode(n)) return '';
  if (n.tag === 'br') return '\n';
  if (n.tag === 'img') return n.attrs.alt ? `[${n.attrs.alt}]` : '';
  const inner = joinInline(n.kids);
  if (n.tag === 'code' || n.tag === 'kbd') return inner.trim() ? `\`${inner.trim()}\`` : '';
  if (n.tag === 'a') {
    const href = n.attrs.href ?? '';
    const label = inner.trim();
    if (!href || href.startsWith('#') || href.startsWith('javascript:') || label === href || !label) return inner;
    return `${inner} (${href})`;
  }
  return inner;
}

// Tags that format words inside a sentence. Any other inline element next to
// another (a step number beside its title, a label beside its value) is laid
// out apart by CSS, so its text gets a space rather than running together.
const FORMATTING = new Set(['a', 'b', 'strong', 'i', 'em', 'u', 's', 'mark', 'code', 'kbd', 'sup', 'sub', 'abbr', 'q', 'cite', 'data', 'var']);
const apart = (k) => k.text === undefined && !FORMATTING.has(k.tag);

function joinInline(kids) {
  let out = '';
  let prev = null;
  for (const k of kids) {
    const t = inline(k);
    if (!t) continue;
    if (prev && (apart(prev) || apart(k)) && prev.text === undefined && k.text === undefined && /\S$/.test(out) && /^\S/.test(t)) out += ' ';
    out += t;
    prev = k;
  }
  return out;
}

const clean = (s) => s.split('\n').map((l) => l.replace(/ +/g, ' ').trim()).join('\n').trim();

function table(n) {
  const rows = [];
  const walk = (x) => {
    for (const k of x.kids ?? []) {
      if (k.text !== undefined || hiddenNode(k)) continue;
      if (k.tag === 'tr') rows.push(k.kids.filter((c) => c.tag === 'td' || c.tag === 'th').map((c) => clean(inline(c)).replace(/\n/g, ' ').replace(/\|/g, '\\|')));
      else walk(k);
    }
  };
  walk(n);
  if (!rows.length) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (r) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
  return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n');
}

/** Block-level rendering: each block is separated by a blank line. */
function blocks(n, out, list = null) {
  let run = '';
  let prevInline = null;
  const flush = () => {
    const t = clean(run);
    if (t) out.push(t);
    run = '';
  };
  for (const k of n.kids) {
    if (k.text !== undefined) {
      run += squash(k.text);
      if (k.text.trim()) prevInline = k;
      continue;
    }
    if (hiddenNode(k)) continue;
    const h = /^h([1-6])$/.exec(k.tag);
    if (h) {
      flush();
      const t = clean(inline(k)).replace(/\n+/g, ' ');
      if (t) out.push(`${'#'.repeat(Math.min(6, Number(h[1]) + 1))} ${t}`);
    } else if (k.tag === 'ul' || k.tag === 'ol') {
      flush();
      const items = [];
      let i = 0;
      for (const li of k.kids) {
        if (li.tag !== 'li' || hiddenNode(li)) continue;
        i += 1;
        const inner = [];
        blocks(li, inner);
        const body = inner.join('\n').replace(/\n/g, '\n  ');
        if (body) items.push(`${k.tag === 'ol' ? `${i}.` : '-'} ${body}`);
      }
      if (items.length) out.push(items.join('\n'));
    } else if (k.tag === 'pre') {
      flush();
      const raw = textOf(k).replace(/^\n+|\s+$/g, '');
      if (raw) out.push('```\n' + raw + '\n```');
    } else if (k.tag === 'table') {
      flush();
      const t = table(k);
      if (t) out.push(t);
    } else if (k.tag === 'hr') {
      flush();
    } else if (BLOCK.has(k.tag) || k.tag === 'li') {
      flush();
      blocks(k, out, list);
    } else {
      const t = inline(k);
      if (t && prevInline && (apart(prevInline) || apart(k)) && /\S$/.test(run) && /^\S/.test(t)) run += ' ';
      run += t;
      if (t) prevInline = k;
      continue;
    }
    prevInline = null;
  }
  flush();
  return out;
}

const textOf = (n) => (n.text !== undefined ? n.text : hiddenNode(n) ? '' : n.tag === 'br' ? '\n' : n.kids.map(textOf).join(''));

/** Section HTML (header, sections, footer) as plain text, blocks separated by blank lines. */
export function htmlToText(html) {
  return blocks(parse(html), []).join('\n\n');
}

/** dist-site/index.txt: the site's title and description, then its page. */
export function siteText({ site, body }) {
  const title = `${site.sample ? 'Sample: ' : ''}${site.title ?? 'Site'}`;
  const head = [`# ${title}`, site.description ? String(site.description).trim() : ''].filter(Boolean);
  return `${[...head, htmlToText(body)].filter(Boolean).join('\n\n')}\n`;
}
