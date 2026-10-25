// Static checks on a site's source, before any browser runs. Errors block the
// audit; warnings are judgment calls to read and decide on.
import { runModel } from './model.mjs';
import { fillTokens } from './fill.mjs';
import { ENGINE, engineProblem } from './version.mjs';
import { copyExemptionProblems, copyFindings, simplicityFindings, LIMITS } from './copy.mjs';
import { element, isLead, leadFindings } from './lead.mjs';

const text = (html) =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ');

const RAW_COLOR = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|\b(?:rgba?|hsla?|oklch|oklab)\([^)]*\)/gi;

/** "#e7751e is a color" or "4 colors (#e7751e, #b83828, #7132a1 and 1 more) are colors". */
const colorList = (raw) => (raw.length === 1 ? `${raw[0]} is a color` : `${raw.length} colors (${raw.slice(0, 3).join(', ')}${raw.length > 3 ? ` and ${raw.length - 3} more` : ''}) are colors`);

const CALENDAR = /^(January|February|March|April|May|June|July|August|September|October|November|December|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)$/;

/** Every string fact worth matching ([path, value]), longest first. */
function factStrings(facts, prefix = '') {
  const out = [];
  for (const [k, v] of Object.entries(facts ?? {})) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) out.push(...factStrings(v, path));
    // A bare number (a year) or a month or weekday on its own matches too much
    // ordinary text to police.
    else if (typeof v === 'string' && v.length >= 4 && !/^\d+$/.test(v) && !CALENDAR.test(v)) out.push([path, v]);
  }
  return out.sort((a, b) => b[1].length - a[1].length);
}

/**
 * site: parsed site.json. sections: [{ name, html }]. extras: header/footer html.
 * exists(path): whether a local file referenced by the page exists.
 * today: an ISO day, for how old dated proof is (defaults to today).
 */
export function checkSite({ site, sections, header = '', footer = '', styles = '', exists = () => true, today }) {
  const errors = [];
  const warnings = [];
  if (!site.title) errors.push('site.json: add a "title".');
  if (!site.description) warnings.push('site.json: add a "description" (it shows in link previews).');
  if (!site.engine) warnings.push(`site.json: pin the engine with "engine": "sites@${ENGINE.split('.').slice(0, 2).join('.')}", so the site keeps building the same way as the engine moves on.`);
  const pinProblem = engineProblem(site.engine);
  if (pinProblem) errors.push(pinProblem);
  let values = {};
  try {
    values = runModel(site.model ?? {});
  } catch (e) {
    errors.push(`site.json model: ${e.message}`);
  }
  if (!sections.length) errors.push('site/sections has no .html files.');
  // The copy rules that block came with engine 1.2; a site pinned earlier gets
  // them as warnings until it's rebuilt and re-pinned, as its pin promises.
  const pinnedMinor = /^sites@1\.(\d+)/.exec(String(site.engine ?? ''))?.[1];
  const copyBlocks = pinnedMinor === undefined || Number(pinnedMinor) >= 2;
  const copy = (where, html) => {
    const requireAttribution = pinnedMinor === undefined || Number(pinnedMinor) >= 7;
    for (const problem of copyExemptionProblems(html)) (requireAttribution ? errors : warnings).push(`${where}: ${problem}`);
    const { blocking, advisory } = copyFindings(fillTokens(html, site).html, { requireAttribution });
    // Before 1.2 the em dash was already an error of its own (below).
    for (const b of blocking) if (copyBlocks) errors.push(`${where}: ${b}`); else if (!b.startsWith('has an em dash')) warnings.push(`${where}: ${b}`);
    for (const a of advisory) warnings.push(`${where}: ${a}`);
  };

  const ids = new Set();
  // The hero is the section named hero, or the first one.
  const heroAt = Math.max(0, sections.findIndex(({ html }) => /<section\b[^>]*\sdata-section="hero"/i.test(html)));
  for (const [at, { name, html, missingParts = [] }] of sections.entries()) {
    const where = `sections/${name}`;
    for (const m of missingParts) errors.push(`${where}: ${m} doesn't exist.`);
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

    // A plain number that equals a model value is usually that value typed in
    // ("92 of 133 enrolled"): it won't follow when the site is copied. Years and
    // one-digit numbers match too much ordinary text to call.
    const byValue = new Map();
    for (const [k, v] of Object.entries(values)) {
      if (Number.isInteger(v) && v >= 10 && !(v >= 1900 && v <= 2100) && !byValue.has(v)) byValue.set(v, k);
    }
    const plainNoSvg = text(untokened.replace(/<svg[\s\S]*?<\/svg>/gi, ' '));
    for (const n of new Set(plainNoSvg.match(/(?<![\w.,$€£-])\d{2,}(?![\w.,%×]|\.\d)/g) ?? [])) {
      const name = byValue.get(Number(n));
      if (name) warnings.push(`${where}: "${n}" is the model's ${name}. If that's what it means, write {{${name}}} so it follows a copy.`);
    }

    // Names and other facts too: a copied site must not keep the last customer's name.
    for (const [path, value] of factStrings(site.facts)) {
      if (said.includes(value)) errors.push(`${where}: "${value}" is typed in. Use {{facts.${path}}}.`);
    }
    if (/—/.test(plain) && !copyBlocks) errors.push(`${where}: has an em dash. Rewrite the sentence.`);
    copy(where, html);
    // Simple copy (voice.md): long headlines, ledes, paragraphs and sentences, and a crowded hero.
    const hero = at === heroAt;
    // In the hero's file, only the hero itself is held to the hero's limits: a
    // glance band beside it (a <section> with no data-section) is where numbers go.
    const own = hero ? (/<section\b[^>]*\sdata-section[\s\S]*?<\/section>/i.exec(html)?.[0] ?? html) : html;
    const rest = hero ? html.replace(own, ' ') : '';
    for (const w of simplicityFindings(fillTokens(own, site).html, { hero })) warnings.push(`${where}: ${w}`);
    if (rest.trim()) for (const w of simplicityFindings(fillTokens(rest, site).html)) warnings.push(`${where}: ${w}`);
    if (hero) {
      const figures = [...own.replace(/<details[\s\S]*?<\/details>/gi, ' ').matchAll(/\{\{\s*(=?)\s*([\w.]+)/g)].filter(([, expr, k]) => expr || (!k.startsWith('facts.') && k in values));
      if (figures.length > LIMITS.heroFigures) warnings.push(`${where}: the hero shows ${figures.length} figures. Keep it to ${LIMITS.heroFigures} or fewer and put the numbers that matter in a glance band right below it (see the site toolbox).`);
    }
    // Motion for charts and figures (the sites guide, "Motion for charts").
    for (const [tag] of html.matchAll(/<[a-z]+\b[^>]*\sdata-bar="[^"]*"[^>]*>/gi)) {
      if (!/\bclass="[^"]*\b(?:wipe|grow)\b/.test(tag)) warnings.push(`${where}: a chart bar (${/data-bar="([^"]*)"/.exec(tag)[1]}) has no entrance. Give it class "wipe" (a bar) or "grow" (a column), with a staggered --d.`);
    }
    for (const m of html.matchAll(/<(\w+)\b([^>]*\bclass="[^"]*\b(?:tb-g-n|tb-stat-n|tb-answer-n|tb-vs-n)\b[^"]*"[^>]*)>([\s\S]*?)<\/\1>/g)) {
      if (/data-count/.test(m[2] + m[3])) continue;
      const shown = text(fillTokens(m[3], site).html).trim();
      // Zero has nothing to count up from.
      if (/^[+\u2212-]?[$€£]?\d[\d,.]*\s?(?:[%×KMBkmb+]|mo)?$/.test(shown) && /[1-9]/.test(shown)) warnings.push(`${where}: the figure "${shown}" doesn't count up. Add data-count so it counts in when it comes into view.`);
    }
    // Calls to action (deck:cta): a short id, and a link out that opens in a new tab so the frame can report it.
    for (const [tag] of html.matchAll(/<[a-z]+\b[^>]*\sdata-cta="[^"]*"[^>]*>/gi)) {
      const id = /data-cta="([^"]*)"/.exec(tag)[1];
      if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) errors.push(`${where}: data-cta="${id}" isn't a valid id (letters, digits, _ and -, up to 40; "accept" and "book_meeting" are the standard ones).`);
      const href = /\shref="([^"]*)"/.exec(tag)?.[1] ?? '';
      if (/^(https?:|mailto:)/.test(href) && !/\starget="_blank"/.test(tag)) warnings.push(`${where}: the call to action "${id}" leaves the page in the same tab, so the frame can't report it. Add target="_blank" rel="noopener".`);
    }
    for (const [, d] of html.matchAll(/\sdata-date="([^"]*)"/g)) if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) errors.push(`${where}: data-date="${d}" should be an ISO day like "2026-11-20".`);
    // A quote is someone's real words: it lives in the facts with who said it, so it
    // can be checked against the source and never gets tidied in the page.
    for (const [, inner] of html.matchAll(/<blockquote\b[^>]*>([\s\S]*?)<\/blockquote>/gi)) {
      if (/[A-Za-z]{3}/.test(text(inner.replace(/\{\{[\s\S]*?\}\}/g, ' ')))) warnings.push(`${where}: a quote is typed into the page ("${text(inner).trim().slice(0, 60)}"). Put the exact words in site.json's facts with who said it, and use {{facts.quotes...}}.`);
    }
    // Colors come from the brand: a raw color in the page is a color the brand doesn't have.
    const rawInPage = [...new Set([...html.matchAll(/\sstyle="([^"]*)"|<style\b[^>]*>([\s\S]*?)<\/style>/gi)].flatMap((m) => (m[1] ?? m[2]).match(RAW_COLOR) ?? []))];
    if (rawInPage.length) warnings.push(`${where}: ${colorList(rawInPage)} the brand kit doesn't name. Use brand tokens (var(--accent), var(--ink), var(--surface)...).`);
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
    copy(name, html);
    for (const [, href] of html.matchAll(/href="#([^"]+)"/g)) if (href !== 'top' && !ids.has(href)) warnings.push(`${name}: links to #${href}, which no section has.`);
  }
  // One line for the whole stylesheet: it's the site's (or kit's) own file, not something a fill can fix.
  const rawInStyles = [...new Set(String(styles).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/url\("?data:[^)]*\)/g, ' ').match(RAW_COLOR) ?? [])];
  if (rawInStyles.length) warnings.push(`styles.css: ${colorList(rawInStyles)} the brand kit doesn't name. Use brand tokens, or add the colors to the brand kit.`);
  // A lead sample ("sample": { "lead": true }) has rules of its own (lead.mjs): its band says
  // "Example: a proposal" and carries one "Made by Unfairly" link, never our booking pitch.
  const lead = isLead(site);
  if (site.sample && !lead && !sections.some(({ html }) => /sample/i.test(text(html)))) errors.push('site.json says sample, but no section tells the reader it is one.');
  // A sample says so in a slim band on screen (the toolbox's sample component, data-sample;
  // the PDF strip doesn't count), so the
  // reader knows it isn't the provider's own page. It carries no pitch of ours (lead.mjs, S).
  const banded = [header, ...sections.map(({ html }) => html), footer].some((html) => [...html.matchAll(/<[a-z]+\b([^>]*\sdata-sample\b[^>]*)>/gi)].some((m) => !/\bpdf-only\b/.test(m[1])));
  if (site.sample && !lead && !banded) warnings.push('site.json says sample, but the page has no sample band. Use the toolbox\'s sample band (header.html, data-sample): one line saying the client and its numbers are fictional, with at most one "Made by Unfairly" link.');
  // The one-shot rules came with engine 1.8, the sample-pitch rules with 1.10: each blocks
  // unpinned or pinned at its version or later, and warns on an older pin.
  const files = [{ where: 'header.html', html: header, section: false }, ...sections.map(({ name, html }) => ({ where: `sections/${name}`, html, section: true })), { where: 'footer.html', html: footer, section: false }].filter((f) => f.html);
  const found = leadFindings({ site, files, blocks: pinnedMinor === undefined || Number(pinnedMinor) >= 8, sampleBlocks: pinnedMinor === undefined || Number(pinnedMinor) >= 10, ...(today ? { today } : {}) });
  errors.push(...found.errors);
  warnings.push(...found.warnings);
  return { errors, warnings };
}
