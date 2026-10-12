// Check story.md before designing anything: the header names the audience,
// the action, the format, the angle, and a template from the library; every
// slide has a job, a claim for a headline, and its proof; the deck covers the
// template's beats and fits its category's length.
//
//   node bin/story-check.mjs --templates <library url or path> [story.md]
//
// The library URL comes with the deck guide's templates topic (deck_guide).
//
// Exits 1 on errors. Warnings are judgment calls: read them, then decide.
import { readFile } from 'node:fs/promises';

/** Headlines that name a topic instead of making a point. */
const LABELS = new Set([
  'agenda', 'problem', 'the problem', 'solution', 'the solution', 'market', 'market size', 'the market',
  'team', 'the team', 'traction', 'competition', 'business model', 'product', 'overview', 'introduction',
  'summary', 'why now', 'the ask', 'ask', 'financials', 'roadmap', 'next steps', 'thank you', 'thanks',
  'questions', 'q&a', 'appendix', 'vision', 'timeline', 'results', 'kpis', 'metrics', 'highlights', 'lowlights',
]);

const HEADER_FIELDS = [
  ['audience', /^audience$/],
  ['action', /^after the last slide/],
  ['format', /^format$/],
  ['template', /^template$/],
  ['angle', /^angle$/],
];

export function parseStory(text) {
  const header = {};
  const slides = [];
  let current = null;
  const body = text.replace(/<!--[\s\S]*?-->/g, '');
  for (const raw of body.split('\n')) {
    const line = raw.trim();
    const slide = /^##\s+(.+)$/.exec(line);
    if (slide) {
      current = { title: slide[1].trim(), fields: {} };
      slides.push(current);
      continue;
    }
    const field = /^(?:-\s*)?([A-Za-z][A-Za-z ]*?)\s*:\s*(.+)$/.exec(line);
    if (!field) continue;
    const key = field[1].toLowerCase();
    if (current) current.fields[key] = field[2].trim();
    else header[key] = field[2].trim();
  }
  return { header, slides };
}

const words = (s) => s.replace(/[*_`]/g, '').split(/\s+/).filter(Boolean);

export function checkStory(story, library) {
  const errors = [];
  const warnings = [];
  const h = story.header;
  const pick = (re) => Object.entries(h).find(([k]) => re.test(k))?.[1];

  for (const [name, re] of HEADER_FIELDS) {
    if (!pick(re)) errors.push(`Header: add "${name === 'action' ? 'After the last slide they should' : name[0].toUpperCase() + name.slice(1)}: ..." before the first slide.`);
  }

  const templateRef = pick(/^template$/);
  const templateId = templateRef && (/`?([a-z0-9-]+)`?/i.exec(templateRef.split(/[\s(,]/)[0]) ?? [])[1];
  const template = library?.templates.find((t) => t.id === templateId || t.modelName === templateRef);
  const category = template && library.categories.find((c) => c.id === template.category);
  if (templateRef && library && !template) {
    errors.push(`Header: template "${templateRef}" is not in the library. Use an id from templates.md, e.g. ${library.templates.slice(0, 3).map((t) => t.id).join(', ')}.`);
  }

  if (story.slides.length === 0) errors.push('No slides yet: add one "## NN name" block per slide.');

  const jobs = new Map();
  story.slides.forEach((s, i) => {
    const where = `Slide ${String(i + 1).padStart(2, '0')} (${s.title})`;
    const f = s.fields;
    if (!f.job) errors.push(`${where}: add "Job:", what this slide must make the audience believe or do.`);
    if (!f.headline) errors.push(`${where}: add "Headline:", the point as a sentence.`);
    else {
      const head = f.headline.replace(/[.!?]+$/, '').trim();
      if (LABELS.has(head.toLowerCase())) errors.push(`${where}: "${f.headline}" is a topic label. State the point as a claim.`);
      else if (words(head).length < 3 && i > 0) warnings.push(`${where}: "${f.headline}" is very short. Is it a claim the audience could repeat?`);
      if (words(head).length > 16) warnings.push(`${where}: the headline has ${words(head).length} words. Tighten it to about 12 so it fits in three lines.`);
    }
    if (!f.proof && i > 0) errors.push(`${where}: add "Proof:", the one visual or fact that makes the headline believable. No proof usually means it's a speaker line, not a slide.`);
    if (f.proof && !f.source && /\d{2,}|[$%€£]|\d(?:\.\d+)?\s?[kmb]\b/i.test(`${f.proof} ${f.headline ?? ''}`)) warnings.push(`${where}: numbers with no "Source:". Cite it, or mark it "example" and label it on the slide.`);
    if (f.job) {
      const key = f.job.toLowerCase().replace(/[^a-z ]/g, '').trim();
      if (jobs.has(key)) warnings.push(`${where}: same job as slide ${jobs.get(key)}. Merge them.`);
      else jobs.set(key, String(i + 1).padStart(2, '0'));
    }
  });

  if (template) {
    const covered = new Set(story.slides.map((s) => (s.fields.beat ?? '').toLowerCase()).filter(Boolean));
    if (covered.size > 0) {
      const missing = template.beats.filter((b) => !covered.has(b.beat.toLowerCase()));
      if (missing.length) warnings.push(`Template ${template.id}: no slide carries ${missing.map((b) => `"${b.beat}"`).join(', ')}. Cut on purpose, or add the beat.`);
    } else {
      warnings.push(`Template ${template.id}: add "Beat:" to each slide (one of ${template.beats.map((b) => b.beat).join(', ')}) so coverage can be checked.`);
    }
    const max = Math.max(...(category?.length.match(/\d+/g) ?? ['0']).map(Number));
    if (max && story.slides.length > max) warnings.push(`Length: ${story.slides.length} slides, more than the ${max} a ${category.name.toLowerCase()} deck usually needs (${category.length}).`);
  }

  return { errors, warnings, template, category };
}

/** The template library from a URL (the deck guide serves it) or a local file. Unreachable means structure-only, not a failed check. */
async function loadLibrary(source) {
  try {
    if (/^https?:\/\//.test(source)) {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    }
    return JSON.parse(await readFile(source, 'utf8'));
  } catch (error) {
    console.log(`Couldn't load the template library (${error.message}); checking structure only.`);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const t = args.indexOf('--templates');
  const templatesPath = t >= 0 ? args[t + 1] : process.env.PITCH_UNFAIRLY_TEMPLATES;
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--templates') ?? 'story.md';
  const story = parseStory(await readFile(file, 'utf8'));
  const library = templatesPath ? await loadLibrary(templatesPath) : null;
  if (!library) console.log('No template library given (--templates); checking structure only.');
  const { errors, warnings, template, category } = checkStory(story, library);

  console.log(`${file}: ${story.slides.length} slides${template ? `, template ${template.id} (${template.template}, ${category?.name})` : ''}`);
  if (category) {
    console.log(`\nRules for ${category.name.toLowerCase()}:`);
    for (const r of category.rules) console.log(`  · ${r}`);
  }
  for (const w of warnings) console.log(`  ! ${w}`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log(errors.length ? `\n${errors.length} to fix before designing.` : '\nStory holds. Show the outline to the user before composing.');
  process.exitCode = errors.length ? 1 : 0;
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
