// Static checks on a site's source, before any browser runs. Errors block the
// audit; warnings are judgment calls to read and decide on.
import { runModel } from './model.mjs';
import { fillTokens } from './fill.mjs';

const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');

/** Every string fact worth matching ([path, value]), longest first. */
function factStrings(facts, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(facts ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...factStrings(v, path));
    // A bare number (a year) matches too much ordinary text to police.
    else if (typeof v === 'string' && v.length >= 4 && !/^\d+$/.test(v)) out.push([path, v]);
  }
  return out.sort((a, b) => b[1].length - a[1].length);
}

/**
 * site: parsed site.json. sections: [{ name, html }]. extras: header/footer html.
 * exists(path): whether a local file referenced by the page exists.
 */
export function checkSite({ site, sections, header = '', footer = '', exists = () => true }) {
  const errors = [];
  const warnings = [];
  if (!site.title) errors.push('site.json: add a "title".');
  if (!site.description) warnings.push('site.json: add a "description" (it shows in link previews).');
  try {
    runModel(site.model ?? {});
  } catch (e) {
    errors.push(`site.json model: ${e.message}`);
  }
  if (!sections.length) errors.push('site/sections has no .html files.');

  const ids = new Set();
  for (const { name, html } of sections) {
    const where = `sections/${name}`;
    const roots = html.match(/<section\b[^>]*>/gi) ?? [];
    const marked = roots.filter((t) => /\sdata-section(=|\s|>)/.test(t));
    if (marked.length !== 1) errors.push(`${where}: needs exactly one <section data-section="name"> (found ${marked.length}). Views are counted per section.`);
    const id = /\sid="([^"]+)"/.exec(marked[0] ?? '')?.[1];
    if (id) {
      if (ids.has(id)) errors.push(`${where}: id "${id}" is used twice.`);
      ids.add(id);
    }
    const { missing } = fillTokens(html, site);
    for (const m of missing) errors.push(`${where}: ${m} doesn't resolve to a model value or fact.`);

    // Figures come from the model or the facts, never typed into the page:
    // that's what keeps a copied site's numbers right when its inputs change.
    const untokened = html.replace(/\{\{[\s\S]*?\}\}/g, ' ');
    const plain = text(untokened);
    const decode = (v) => {
      try {
        return decodeURIComponent(v);
      } catch {
        return v;
      }
    };
    const said = `${plain} ${[...untokened.matchAll(/\s(?:alt|title|aria-label|download|href)="([^"]*)"/g)].map((m) => decode(m[1])).join(' ')}`;
    const typed = plain.match(/[$€£]\s?\d[\d,.]*\s?[KkMmBb]?|\b\d[\d,.]*\s?%|\b\d+(\.\d+)?×/g) ?? [];
    for (const t of new Set(typed.filter((x) => !/^[$€£]\s?0$|^0\s?%$/.test(x.trim())))) errors.push(`${where}: "${t.trim()}" is typed in. Put it in site.json (model or facts) and use a {{token}}, so it updates when the site is copied.`);

    // Names and other facts too: a copied site must not keep the last customer's name.
    for (const [path, value] of factStrings(site.facts)) {
      if (said.includes(value)) errors.push(`${where}: "${value}" is typed in. Use {{facts.${path}}}.`);
    }
    if (/—/.test(plain)) errors.push(`${where}: has an em dash. Rewrite the sentence.`);
    if (/<script\b/i.test(html)) errors.push(`${where}: has a <script>. Interactivity comes from data attributes (see the sites guide).`);
    if (/\son\w+\s*=/i.test(html)) errors.push(`${where}: has an inline event handler. Use data attributes instead.`);
    if (/<img\b(?![^>]*\salt=)/i.test(html)) errors.push(`${where}: an <img> has no alt (use alt="" for decoration).`);
    for (const [, attr, ref] of html.matchAll(/\s(src|href|srcset)="([^"#][^"]*)"/g)) {
      if (/^https?:/.test(ref)) {
        // Links out are fine; the content host refuses anything it would load from elsewhere.
        if (attr !== 'href') errors.push(`${where}: loads ${ref} from another site. Save it into site/assets/.`);
        continue;
      }
      if (/^(mailto:|tel:)/.test(ref) || ref === 'deck.pdf' || ref.includes('{{')) continue;
      if (!exists(ref.split(/[?#\s]/)[0])) errors.push(`${where}: ${ref} doesn't exist (paths are relative to the page: assets/..., brand/...).`);
    }
    for (const m of html.matchAll(/role="tab"[^>]*aria-controls="([^"]+)"/g)) {
      if (!html.includes(`id="${m[1]}"`)) errors.push(`${where}: a tab controls #${m[1]}, which isn't in the section.`);
    }
  }
  for (const [name, html] of [['header.html', header], ['footer.html', footer]]) {
    if (!html) continue;
    for (const m of fillTokens(html, site).missing) errors.push(`${name}: ${m} doesn't resolve.`);
    const raw = html.replace(/\{\{[\s\S]*?\}\}/g, ' ');
    const words = `${text(raw)} ${[...raw.matchAll(/\s(?:alt|title|aria-label|download|href)="([^"]*)"/g)].map((m) => { try { return decodeURIComponent(m[1]); } catch { return m[1]; } }).join(' ')}`;
    for (const [path, value] of factStrings(site.facts)) if (words.includes(value)) errors.push(`${name}: "${value}" is typed in. Use {{facts.${path}}}.`);
    for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) if (href !== 'top' && !ids.has(href)) warnings.push(`${name}: links to #${href}, which no section has.`);
  }
  if (site.sample && !sections.some(({ html }) => /sample/i.test(text(html)))) errors.push('site.json says sample, but no section tells the reader it is one.');
  return { errors, warnings };
}
