import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fillTokens } from '../bin/site/fill.mjs';
import { checkSite } from '../bin/site/check.mjs';
import { buildSite } from '../bin/site-build.mjs';
import { loadSite } from '../bin/site-check.mjs';

// A fictional bakery quoting a catering plan: hand-written sections over a model.
const SITE = {
  title: 'Catering for Example Co',
  description: 'A catering plan for Example Co.',
  model: {
    inputs: { people: 40, per_head: 12, days: 5 },
    formulas: { weekly: 'people * per_head * days', yearly: 'weekly * 48' },
    formats: { weekly: 'money', yearly: 'money', per_head: 'money' },
  },
  facts: { client: { name: 'Example Co' } },
};
const SECTION = `<section id="price" data-section="price">
  <h2>Lunch for {{facts.client.name}} is {{weekly}} a week.</h2>
  <p>That's {{per_head}} a head, or {{= yearly / 12 | money}} a month.</p>
  <input type="number" data-input="people" value="40" aria-label="People">
</section>`;

test('fills model values live, facts as text, and one-off formulas', () => {
  const { html, missing } = fillTokens(SECTION, SITE);
  assert.deepEqual(missing, []);
  assert.match(html, /Lunch for Example Co is <span data-v="weekly">\$2,400<\/span> a week\./);
  assert.match(html, /<span data-v="per_head">\$12<\/span>/);
  assert.match(html, /<span data-expr="yearly \/ 12" data-format="money">\$9,600<\/span>/);
});

test('tokens inside a tag fill as plain text', () => {
  const { html } = fillTokens('<img alt="{{facts.client.name}} pays {{weekly}}" src="a.png">', SITE);
  assert.equal(html, '<img alt="Example Co pays $2,400" src="a.png">');
});

test('reports tokens that resolve to nothing', () => {
  const { missing } = fillTokens('<p>{{nope}} {{facts.client.size}} {{= nope * 2}}</p>', SITE);
  assert.equal(missing.length, 3);
});

test('a clean hand-written section passes the check', () => {
  const { errors } = checkSite({ site: SITE, sections: [{ name: '01-price.html', html: SECTION }] });
  assert.deepEqual(errors, []);
});

test('figures typed into the page are refused, so a copied site stays right', () => {
  const html = SECTION.replace('{{weekly}}', '$2,400').replace('a head', 'a head (save 15%)');
  const { errors } = checkSite({ site: SITE, sections: [{ name: '01-price.html', html }] });
  assert.ok(errors.some((e) => e.includes('"$2,400" is typed in')));
  assert.ok(errors.some((e) => e.includes('"15%" is typed in')));
});

test('a fact typed in is refused (a copy would keep the old name); $0 is a term, not a figure', () => {
  const html = SECTION.replace('{{facts.client.name}}', 'Example Co').replace('a head', 'a head, $0 delivery');
  const { errors } = checkSite({ site: SITE, sections: [{ name: '01-price.html', html }] });
  assert.deepEqual(errors, ['sections/01-price.html: "Example Co" is typed in. Use {{facts.client.name}}.']);
  const alt = checkSite({ site: SITE, sections: [{ name: '01-price.html', html: SECTION.replace('</h2>', '</h2><img src="assets/l.svg" alt="Example Co">') }] });
  assert.ok(alt.errors.some((e) => e.includes('"Example Co" is typed in')));
});

test('a fact hiding in a link or a download name is caught too; a bare year is not policed', () => {
  const site = { ...SITE, facts: { ...SITE.facts, year: '2027' } };
  const html = SECTION.replace('</h2>', '</h2><a href="mailto:a@b.co?subject=Lunch%20for%20Example%20Co">Ask</a><p>Opening through 2027.</p>');
  const { errors } = checkSite({ site, sections: [{ name: '01-price.html', html }] });
  assert.deepEqual(errors, ['sections/01-price.html: "Example Co" is typed in. Use {{facts.client.name}}.']);
});

test('each section must report itself, and pages carry no scripts or em dashes', () => {
  const html = '<section id="a"><p>One — two</p><script>x()</script><img src="assets/x.png"></section>';
  const { errors } = checkSite({ site: SITE, sections: [{ name: '01-a.html', html }], exists: () => false });
  assert.ok(errors.some((e) => e.includes('data-section')));
  assert.ok(errors.some((e) => e.includes('em dash')));
  assert.ok(errors.some((e) => e.includes('<script>')));
  assert.ok(errors.some((e) => e.includes('no alt')));
  assert.ok(errors.some((e) => e.includes("assets/x.png doesn't exist")));
});

test('a sample site has to say so on the page', () => {
  const { errors } = checkSite({ site: { ...SITE, sample: true }, sections: [{ name: '01-price.html', html: SECTION }] });
  assert.ok(errors.some((e) => e.includes('sample')));
});

async function project() {
  const root = await mkdtemp(join(tmpdir(), 'site-'));
  await mkdir(join(root, 'site/sections'), { recursive: true });
  await mkdir(join(root, 'site/assets'), { recursive: true });
  await mkdir(join(root, 'brand'), { recursive: true });
  await writeFile(join(root, 'site/site.json'), JSON.stringify(SITE));
  await writeFile(join(root, 'site/sections/01-price.html'), SECTION);
  await writeFile(join(root, 'site/styles.css'), 'h2 { color: var(--accent); }');
  await writeFile(join(root, 'site/assets/dot.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await writeFile(
    join(root, 'brand/brand.json'),
    JSON.stringify({
      schema: 'brand-kit@1',
      identity: { name: 'Example Bakery' },
      palette: { paper: '#ffffff', ink: '#222222', accent: '#aa3300' },
      typography: { display: { family: 'Georgia', source: 'system', fallback: 'serif' }, body: { family: 'Arial', source: 'system' } },
    }),
  );
  return root;
}

test('builds a self-contained page: brand tokens, the site styles, the model, and the script', async () => {
  const root = await project();
  const r = await buildSite({ root });
  assert.deepEqual(r.missing, []);
  const html = await readFile(join(root, 'dist-site/index.html'), 'utf8');
  assert.match(html, /--accent: #aa3300/);
  assert.match(html, /h2 \{ color: var\(--accent\); \}/);
  assert.match(html, /<main id="top">[\s\S]*data-section="price"/);
  assert.match(html, /"per_head":12/);
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/.test(html), 'no third-party requests');
  for (const f of ['js/app.js', 'js/model.mjs', 'assets/dot.svg', 'brand/brand.json']) assert.ok(existsSync(join(root, 'dist-site', f)), f);
});

test('a copied site with new inputs recomputes every figure', async () => {
  const root = await project();
  const copy = await mkdtemp(join(tmpdir(), 'site-copy-'));
  await cp(join(root, 'site'), join(copy, 'site'), { recursive: true });
  await cp(join(root, 'brand'), join(copy, 'brand'), { recursive: true });
  const site = JSON.parse(await readFile(join(copy, 'site/site.json'), 'utf8'));
  site.model.inputs.people = 100;
  site.facts.client.name = 'Other Co';
  await writeFile(join(copy, 'site/site.json'), JSON.stringify(site));
  assert.deepEqual(checkSite(await loadSite(copy)).errors, []);
  await buildSite({ root: copy });
  const html = await readFile(join(copy, 'dist-site/index.html'), 'utf8');
  assert.match(html, /Lunch for Other Co is <span data-v="weekly">\$6,000<\/span>/);
});
