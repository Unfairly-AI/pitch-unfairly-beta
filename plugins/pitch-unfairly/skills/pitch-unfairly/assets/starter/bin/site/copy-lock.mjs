// The copy lock: a site's words are the client's drafts, both ways. Every
// source sentence appears on its page, in order; every string on the page
// appears in a source; a source typo is kept as written and listed for the
// client to confirm, never fixed in silence; and a {{?…}} placeholder fails a
// production build (a draft build lists it).
//
// Pure functions over strings; bin/site-copy-lock.mjs reads the files.
// Copy is either content JSON (every string value, walked in order) or HTML
// (the text of each block element, in order).

export const DEFAULTS = {
  // Editor annotations at the start of a line, not copy.
  labels: ['Title Tag', 'Meta Description', 'Current URL'],
  // JSON keys that are structure, not copy.
  skip_keys: ['slug', 'kind', 'source_file', 'type', 'id', 'href', 'src', 'image', 'images', 'photo', 'icon', 'to_confirm', 'offered_at', 'services_offered'],
  // JSON keys holding a sidebar or widget: its copy must be there, but its order isn't checked.
  sidebar_keys: ['info'],
  // JSON keys that join the copy only when they are themselves a whole source sentence (a design label).
  label_keys: ['eyebrow'],
  // In an object whose "type" is one of these, "name" is an identifier, not copy.
  shared_types: ['shared'],
};

/** Whitespace, curly quotes, dashes and bullets made comparable. */
export function norm(s) {
  return String(s ?? '').normalize('NFKC')
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—‑‒]/g, '-').replace(/•/g, ' ').replace(/ /g, ' ')
    .replace(/\s+/g, ' ').trim();
}
/** Copy markup reduced to the words a reader sees: {{?X}} -> X, {{X|target}} -> X. */
export const visible = (s) => String(s).replace(/\{\{\?([^}]*)\}\}/g, '$1').replace(/\{\{([^|}]*)\|[^}]*\}\}/g, '$1');

const SENTENCE = /(?<=[.!?])\s+(?=[A-Z"(])/;

/** Copy strings of a content JSON page, in document order: [{ path, text, sidebar }]. */
export function jsonSegments(page, cfg = DEFAULTS) {
  const out = [];
  const skip = new Set(cfg.skip_keys);
  const walk = (v, path, sidebar) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`, sidebar));
    else if (v && typeof v === 'object') {
      for (const [k, x] of Object.entries(v)) {
        if (skip.has(k)) continue;
        if (k === 'name' && cfg.shared_types.includes(v.type)) continue;
        if (cfg.label_keys.includes(k)) { if (typeof x === 'string' && x.trim()) out.push({ path: `${path}.${k}`, text: x, sidebar, label: true }); continue; }
        walk(x, `${path}.${k}`, sidebar || cfg.sidebar_keys.includes(k));
      }
    } else if (typeof v === 'string' && v.trim()) out.push({ path, text: v, sidebar });
  };
  walk(page, '$', false);
  return out;
}

const BLOCK = /<\/?(p|li|h[1-6]|dt|dd|td|th|figcaption|blockquote|summary|button|label|option|caption|div|section|header|footer|nav|ul|ol|table|tr|form|details|article|aside|main|br|title)\b[^>]*>/gi;
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rsquo: '’', lsquo: '‘', ldquo: '“', rdquo: '”', mdash: '—', ndash: '–', hellip: '…' };
/** Copy strings of an HTML page or section: the text of each block, in order. */
export function htmlSegments(html) {
  const text = String(html)
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style|svg|template|noscript)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(BLOCK, '\n').replace(/<[^>]+>/g, '')
    .replace(/&(#\d+|#x[0-9a-f]+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITIES[e.toLowerCase()] ?? m));
  return text.split('\n').map((t) => t.trim()).filter((t) => /[\p{L}\p{N}]/u.test(t)).map((t, i) => ({ path: `block ${i + 1}`, text: t, sidebar: false }));
}

/** Words a copy string contributes for bracket matching ({{X|…}} and {{?X}} labels included). */
function tokensOf(segs) {
  const toks = new Set();
  for (const { text } of segs) {
    toks.add(norm(visible(text)));
    for (const m of text.matchAll(/\{\{\??([^|}]*)/g)) toks.add(norm(m[1]));
  }
  return toks;
}

/**
 * Source sentences with editor annotations removed: [{ line, text }]. A
 * bracketed span is copy (brackets dropped) only when the copy carries exactly
 * that text; otherwise it's an annotation and ends the sentence.
 */
export function sourceSentences(source, toks = new Set(), cfg = DEFAULTS) {
  const notes = (cfg.notes ?? []).map((n) => new RegExp(n));
  const label = cfg.labels.length ? new RegExp(`^(${cfg.labels.map((l) => l.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\s*:\\s*`, 'i') : null;
  const out = [];
  String(source).split('\n').forEach((raw, i) => {
    let s = norm(raw);
    if (!s || notes.some((n) => n.test(s))) return;
    if (label) s = s.replace(label, '');
    s = s.replace(/(?<!\[)\bTab \d+\]/g, '\n').replace(/\[[^\]]*$/, '\n');
    s = s.replace(/\[([^\]]*)\]/g, (m, x) => (toks.has(norm(x)) ? norm(x) : '\n'));
    for (const piece of s.split('\n')) {
      for (const sent of norm(piece).split(SENTENCE)) {
        const t = norm(sent);
        if (t) out.push({ line: i + 1, text: t });
      }
    }
  });
  return out;
}

/** Levenshtein distance, capped (returns cap+1 when over). */
export function distance(a, b, cap = Infinity) {
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      best = Math.min(best, cur[j]);
    }
    if (best > cap) return cap + 1;
    prev = cur;
  }
  return prev[b.length];
}

const MISSPELLED = new Map(Object.entries({
  teh: 'the', recieve: 'receive', occured: 'occurred', seperate: 'separate', accomodate: 'accommodate', definately: 'definitely', untill: 'until', wich: 'which', thier: 'their', alot: 'a lot', occassion: 'occasion', reccomend: 'recommend', recomend: 'recommend', appointmnet: 'appointment', excercise: 'exercise', goverment: 'government', independant: 'independent', neccessary: 'necessary', noticable: 'noticeable', occurence: 'occurrence', persue: 'pursue', publically: 'publicly', refered: 'referred', succesful: 'successful', tommorow: 'tomorrow', truely: 'truly', wierd: 'weird',
}));

/**
 * Likely typos in the source, kept as written and listed for the client:
 * [{ line, text, why }]. Mechanical tells only (a doubled word, a missing or
 * stray space, unbalanced brackets or quotes, a common misspelling), so the
 * list stays short enough for a client to answer.
 */
export function sourceTypos(sentences) {
  const out = [];
  for (const { line, text } of sentences) {
    const why = [];
    const rep = /\b(\p{L}+)\s+\1\b/iu.exec(text);
    if (rep && !/^(that|had|is)$/i.test(rep[1])) why.push(`"${rep[0]}" repeats a word`);
    const glued = /\b\p{Ll}{2,}[.!?,;:]\p{Lu}\p{Ll}/u.exec(text);
    if (glued && !/\b(e\.g|i\.e|etc)\b/i.test(text) && !/\w\.\w+\.(com|org|edu|net|gov)/i.test(text)) why.push(`"${glued[0]}" is missing a space`);
    const spaced = /\s[,.;:!?](?!\d)/.exec(text);
    if (spaced) why.push(`a space before "${spaced[0].trim()}"`);
    for (const [open, close] of [['(', ')'], ['[', ']']]) if (text.split(open).length !== text.split(close).length) why.push(`unbalanced ${open}${close}`);
    if ((text.match(/"/g) ?? []).length % 2) why.push('unbalanced quotes');
    for (const w of text.match(/\p{L}+/gu) ?? []) if (MISSPELLED.has(w.toLowerCase())) why.push(`"${w}" (usually "${MISSPELLED.get(w.toLowerCase())}")`);
    if (why.length) out.push({ line, text, why: [...new Set(why)] });
  }
  return out;
}

/**
 * Check one page. source: the draft's text. segs: its copy (jsonSegments or
 * htmlSegments). removed: verbatim source text the client agreed to drop.
 * Returns { missing, order, extra, changed, placeholders, counts }.
 */
export function checkPage(source, segs, { removed = [], cfg = DEFAULTS } = {}) {
  const toks = tokensOf(segs);
  const sents = sourceSentences(source, toks, cfg);
  const texts = sents.map((s) => s.text);
  const sourceFull = texts.join(' ');
  const isSentence = new Set(texts);
  const main = segs.filter((s) => !s.sidebar && (!s.label || isSentence.has(norm(visible(s.text))))).map((s) => norm(visible(s.text)));
  const side = segs.filter((s) => s.sidebar).map((s) => norm(visible(s.text)));
  // A label key (an eyebrow) joins the copy when it is itself a whole source sentence.
  const stream = main.join(' ');
  const sideStream = side.join(' ');
  const gone = removed.map(norm);
  const res = { missing: [], order: [], extra: [], changed: [], placeholders: [], sentences: sents, counts: { source: sents.length, copy: segs.length, sidebar: 0, repeated: 0, removed: 0 } };
  let cursor = 0;
  for (const { line, text } of sents) {
    if (sideStream.includes(text)) { res.counts.sidebar++; continue; }
    const at = stream.indexOf(text, cursor);
    if (at >= 0) { cursor = at + text.length; continue; }
    if (stream.includes(text)) {
      if (texts.filter((t) => t === text).length > 1) res.counts.repeated++;
      else res.order.push({ line, text });
      continue;
    }
    if (gone.some((g) => g.includes(text))) { res.counts.removed++; continue; }
    res.missing.push({ line, text });
  }
  for (const { path, text, label } of segs) {
    const v = norm(visible(text));
    if (label && !isSentence.has(v)) continue; // a design label that isn't copy
    if (!sourceFull.includes(v)) res.extra.push({ path, text: v });
    for (const m of text.matchAll(/\{\{\?([^}]*)\}\}/g)) res.placeholders.push({ path, text: m[1] });
  }
  // A missing sentence with a near twin among the extras: the page edited the source (a typo
  // fixed, a word changed). Report it once, as a change, with both versions.
  for (const miss of [...res.missing]) {
    let best = null;
    for (const ex of res.extra) {
      for (const cand of [ex.text, ...ex.text.split(SENTENCE)]) {
        const cap = Math.max(3, Math.floor(miss.text.length * 0.15));
        const d = distance(miss.text, cand, cap);
        if (d <= cap && (!best || d < best.d)) best = { d, ex, cand };
      }
    }
    if (best) {
      res.changed.push({ line: miss.line, source: miss.text, page: best.cand, path: best.ex.path });
      res.missing.splice(res.missing.indexOf(miss), 1);
      // The extra string is accounted for when the change is all that differs from the source.
      const rest = best.ex.text.split(SENTENCE).filter((x) => x !== best.cand);
      if (rest.every((x) => sourceFull.includes(x)) && res.extra.includes(best.ex)) res.extra.splice(res.extra.indexOf(best.ex), 1);
    }
  }
  return res;
}

/** Problems that fail the lock. draft: placeholders are listed, not failed. */
export function lockErrors(res, { draft = false } = {}) {
  return [
    ...res.missing.map((m) => `MISSING  line ${m.line}: ${m.text}`),
    ...res.order.map((m) => `ORDER    line ${m.line}: ${m.text}`),
    ...res.changed.map((c) => `CHANGED  line ${c.line}: the source says "${c.source}" and the page says "${c.page}". Keep the source's words; if it's a typo, list it for the client to confirm`),
    ...res.extra.map((e) => `EXTRA    ${e.path}: ${e.text}`),
    ...(draft ? [] : res.placeholders.map((p) => `PLACEHOLDER ${p.path}: {{?${p.text}}} can't ship in a production build. Get the answer from the client, or remove the line (a draft build, --draft, lists it instead)`)),
  ];
}
