// The Webflow push as a step machine, driven end to end against a fake Webflow that answers in the
// reply shapes the hosted MCP server returned on a live site (2026-11-05). No network.
import { describe, it } from 'node:test';
import { expect } from './webflow/expect.mjs';
import { compilePage } from '../bin/webflow/compile.mjs';
import { emptyLedger, nextStep, parseReply, recordStep, revealsIn } from '../bin/webflow/steps.mjs';
import { compareProbes, snapBands } from '../bin/webflow/verify.mjs';

// A made-up vendor page with a token, an alias, an image, a self-hosted font, a new-tab CTA, a focus
// ring and a two-step scroll reveal.
const PAGE = `<!doctype html><html><head><style>
@font-face { font-family: "Northline Sans"; src: url("fonts/northline-latin-wght-normal.woff2"); font-weight: 100 900; }
:root { --c-ink: #14213d; --ink: var(--c-ink); --pad: 24px; --font: "Northline Sans", sans-serif; }
body { font-family: var(--font); color: var(--ink); }
.lp-hero { padding: var(--pad); }
.lp-cta { color: var(--ink); }
.lp-cta:focus-visible { outline: 2px solid var(--ink); }
.lp-step { min-height: 100vh; }
.lp-card { padding: 20px; }
@media (max-width: 720px) { .lp-hero { padding: 12px; } }
</style></head><body><main>
<section id="hero" class="lp-hero"><img src="assets/mark.png" alt="" class="lp-img"><a class="lp-cta" href="https://example.com/start" target="_blank" rel="noopener">Start</a></section>
<section id="story" class="lp-story"><div class="lp-step" data-wf-step="1"><div class="lp-card" data-wf-reveal="1">One</div></div><div class="lp-step" data-wf-step="2"><div class="lp-card" data-wf-reveal="2" data-wf-y="8">Two</div></div></section>
</main></body></html>`;

const compiled = compilePage(PAGE);
const baseRun = () => ({
  site_id: 'site1',
  collection: 'Northline tokens',
  prefix: 'nl-',
  classPrefix: 'uf-',
  page: { title: 'Launch', slug: 'launch', path: '/launch' },
  compiled: { blocks: compiled.blocks, variables: compiled.variables },
  assets: [{ src: 'assets/mark.png', path: '/tmp/mark.png', file_name: 'mark.png', md5: '0'.repeat(32) }],
  fonts: [{ family: 'Northline Sans', italic: false, weight: 400, axis: [100, 900], path: '/tmp/northline.woff2', file_name: 'northline.woff2', md5: '1'.repeat(32) }],
});

let ids = 0;
const id = (p) => `${p}-${++ids}`;
/** Answers one call the way the hosted MCP server does. `existing` seeds what the site already has. */
function fakeWebflow(step, existing = {}) {
  const [action] = step.args.actions;
  const label = action.label;
  const [kind, body] = Object.entries(action).find(([k]) => k !== 'label') ?? [];
  const wrap = (result) => JSON.stringify({ label, action: kind, result });
  if (step.tool === 'data_whtml_builder') return JSON.stringify(step.args.actions.map((a) => ({ build_label: a.build_label, status: 'success', data: { id: { component: 'page1', element: id('el') } } })));
  if (step.tool === 'data_variable_tool' && kind?.startsWith('create_') && kind !== 'create_variable_collection') {
    return step.args.actions.map((a) => {
      const [k, b] = Object.entries(a).find(([x]) => x !== 'label');
      return JSON.stringify({ label: a.label, action: k, result: [{ id: id('variable'), name: b.variable_name }] });
    }).join('');
  }
  switch (kind) {
    case 'get_site': return wrap({ id: 'site1', shortName: 'northline-demo', customDomains: [] });
    case 'create_page': return wrap({ id: 'page1', slug: body.slug, publishedPath: `/${body.slug}` });
    case 'get_all_elements': return wrap([{ status: 'success', data: { id: { component: 'page1', element: 'body1' }, type: 'Body' } }]);
    case 'query_styles': return wrap([{ label: 'ours', matches: (existing.classes ?? []).map((name) => ({ name })) }]);
    case 'get_variable_collections': return wrap(existing.collection ? [{ id: 'collection-1', name: 'Northline tokens' }] : []);
    case 'get_variables': return wrap((existing.vars ?? []).map((name) => ({ id: id('variable'), name })));
    case 'create_variable_collection': return wrap([{ id: 'collection-1', name: body.name }]);
    case 'create_asset': return wrap({ id: 'asset1', uploadUrl: 'https://s3.example/', uploadDetails: { acl: 'public-read', key: 'k', policy: 'p', xAmzSignature: 's' }, assetUrl: 'https://s3.amazonaws.com/webflow-prod-assets/site1/asset1_mark.png' });
    case 'list_fonts': return wrap({ customFonts: (existing.fonts ?? []).map((fontFamily) => ({ fontFamily })) });
    case 'create_font': return wrap({ customFont: { fontFamily: body.font_family }, upload: { url: 'https://s3.example/', fields: { key: 'f' } } });
    case 'query_elements': return wrap([{ status: 'success', data: [
      { label: 'links', matches: [{ id: { component: 'page1', element: 'link1' }, attributes: { href: 'https://example.com/start' } }] },
      { label: 'steps', matches: [1, 2].map((n) => ({ id: { component: 'page1', element: `step${n}` }, attributes: { 'data-wf-step': String(n) } })) },
      { label: 'reveals', matches: [
        { id: { component: 'page1', element: 'card1' }, attributes: { 'data-wf-reveal': '1' } },
        { id: { component: 'page1', element: 'card2' }, attributes: { 'data-wf-reveal': '2', 'data-wf-y': '8' } },
        { id: { component: 'page1', element: 'note2' }, attributes: { 'data-wf-reveal': '2' } },
      ] },
    ] }]);
    case 'update_style': return wrap([{ name: body.style_name }]);
    case 'set_settings': return wrap([{ status: 'success' }]);
    case 'create_interaction': return step.args.actions.map((a) => JSON.stringify({ label: a.label, action: 'create_interaction', result: [{ id: id('i') }] })).join('');
    case 'publish_site': return wrap({ customDomains: [], publishToWebflowSubdomain: true });
    default: throw new Error(`fake Webflow has no answer for ${kind}`);
  }
}

function runAll(run, existing) {
  const ledger = emptyLedger();
  const calls = [];
  const uploads = [];
  for (let i = 0; i < 60; i++) {
    const step = nextStep(run, ledger);
    if (!step) return { ledger, calls, uploads };
    calls.push(step);
    uploads.push(...recordStep(run, ledger, step.step, `[session_id issued]\n${fakeWebflow(step, existing)}`));
  }
  throw new Error('run did not finish');
}

describe('site:webflow step machine', () => {
  it('runs every step in order and finishes by publishing to webflow.io only', () => {
    const { calls, ledger } = runAll(baseRun());
    expect(calls.map((c) => c.step.split(':')[0])).toEqual(['site', 'page', 'body', 'styles', 'collections', 'collection', 'variables', 'aliases', 'asset', 'fonts', 'font', 'insert', 'elements', 'states', 'links', 'interactions', 'publish']);
    const publish = calls.at(-1).args.actions[0].publish_site;
    expect(publish).toEqual({ site_id: 'site1', publishToWebflowSubdomain: true, customDomains: [] });
    expect(ledger.captures.page_path).toBe('/launch');
    expect(ledger.captures.short_name).toBe('northline-demo');
  });

  it('carries ids forward: aliases point at created variables, inserts at the body, images at the library URL', () => {
    const { calls, ledger } = runAll(baseRun());
    const alias = calls.find((c) => c.step.startsWith('aliases')).args.actions[0].create_color_variable;
    expect(alias.value).toEqual({ existing_variable_id: ledger.captures.var_ids['nl-c-ink'] });
    const insert = calls.find((c) => c.step.startsWith('insert')).args;
    expect(insert.actions[0].parent_element_id).toEqual({ component: 'page1', element: 'body1' });
    expect(insert.actions[0].html).toContain('src="https://s3.amazonaws.com/webflow-prod-assets/site1/asset1_mark.png"');
  });

  it('sets up the uploads Webflow hands back for images and fonts', () => {
    const { uploads } = runAll(baseRun());
    expect(uploads.map((u) => u.file)).toEqual(['/tmp/mark.png', '/tmp/northline.woff2']);
    expect(uploads[0].fields).toMatchObject({ acl: 'public-read', key: 'k', Policy: 'p', 'X-Amz-Signature': 's' });
  });

  it('turns focus rings into style-tool longhands bound to the token, and restores new-tab links', () => {
    const { calls, ledger } = runAll(baseRun());
    const state = calls.find((c) => c.step === 'states').args.actions[0].update_style;
    expect(state).toMatchObject({ pseudo: 'focus-visible' });
    expect(state.properties).toContainEqual({ property_name: 'outline-width', property_value: '2px' });
    expect(state.properties).toContainEqual({ property_name: 'outline-color', variable_as_value: ledger.captures.var_ids['nl-ink'] });
    const link = calls.find((c) => c.step === 'links').args.actions[0].set_settings.operations[0];
    expect(link).toMatchObject({ element_id: { component: 'page1', element: 'link1' }, settings: [{ key: 'link', static_link: { open_in_new_tab: true, rel: 'noopener' } }] });
  });

  it('builds one scroll reveal per declared step, triggered by the step and revealing its target', () => {
    const { calls } = runAll(baseRun());
    const ix = calls.find((c) => c.step === 'interactions').args.actions;
    expect(ix).toHaveLength(2);
    expect(ix[1].create_interaction.triggers[0]).toMatchObject({ extensionKey: 'wf:scroll', target: { value: ['page1', 'step2'] }, config: { scrollTriggerConfig: { leaveBack: 'reverse' } } });
    // Step 2 reveals two things that move differently, so it gets one action per setting.
    const acts = ix[1].create_interaction.timelines[0].actions;
    expect(acts.map((a) => [a.targets[0].value[1], a.properties['wf:transform'].y])).toEqual([['card2', [8, 0]], ['note2', [20, 0]]]);
  });

  it('on a site that already has the classes, variables and font, sends no CSS and creates nothing twice', () => {
    const plan = runAll(baseRun()).calls;
    const classes = plan.find((c) => c.step.startsWith('insert')).args.actions.flatMap((a) => [...(a.css ?? '').matchAll(/\.([\w-]+)\{/g)].map((m) => m[1]));
    const vars = compiled.variables.map((v) => `nl-${v.name}`);
    const { calls } = runAll(baseRun(), { classes, collection: true, vars, fonts: ['Northline Sans'] });
    expect(calls.some((c) => c.step.startsWith('variables') || c.step.startsWith('aliases') || c.step.startsWith('font:'))).toBe(false);
    expect(calls.find((c) => c.step.startsWith('insert')).args.actions.every((a) => !a.css)).toBe(true);
  });

  it('refuses a failed step instead of marking it done', () => {
    const run = baseRun();
    const ledger = emptyLedger();
    const step = nextStep(run, ledger);
    expect(() => recordStep(run, ledger, step.step, '{"label":"site","action":"get_site","error":{"name":"Error","message":"Site not found"}}')).toThrow(/Site not found/);
    expect(ledger.done).toEqual([]);
    expect(() => recordStep(run, ledger, step.step, 'Permission denied')).toThrow(/No JSON/);
  });

  it('stops on an insert that dropped an image, rather than publishing a page without it', () => {
    const run = baseRun();
    const ledger = emptyLedger();
    let step;
    while ((step = nextStep(run, ledger)) && !step.step.startsWith('insert')) recordStep(run, ledger, step.step, fakeWebflow(step));
    const reply = JSON.stringify([{ build_label: 'hero', status: 'partial_success', data: { image_warnings: [{ src: 'x.png' }] } }]);
    expect(() => recordStep(run, ledger, step.step, reply)).toThrow(/not in the asset library/);
  });
});

describe('helpers', () => {
  it('reads every JSON value from a reply, past a leading text line and between objects', () => {
    expect(parseReply('[session_id issued]\n{"a":1}{"b":"}{"}[1,2]')).toEqual([{ a: 1 }, { b: '}{' }, [1, 2]]);
  });

  it('finds declared reveal steps', () => {
    expect(revealsIn(compiled.blocks)).toEqual({ steps: ['1', '2'], reveals: [{ key: '1', y: 20, duration: 0.5 }, { key: '2', y: 8, duration: 0.5 }], load: false });
  });

  it('reports the width ranges a breakpoint snap moves', () => {
    expect(snapBands({ mediaShifts: [{ kind: 'max', written: 600, snapped: 479 }, { kind: 'max', written: 900, snapped: 991 }, { kind: 'min', written: 880, snapped: 992 }] })).toEqual([[480, 600], [880, 991]]);
  });

  it('counts a horizontal margin only when the box moved', () => {
    // Chrome can report an auto margin as 0px or its used width; the box position decides.
    const el = (left, margin) => ({ path: '/div[0]', tag: 'div', cls: 'x', left, text: '', styles: { 'margin-left': margin, 'margin-top': '0px' } });
    expect(compareProbes([el(170, '0px')], [el(170, '170px')])).toEqual([]);
    expect(compareProbes([el(0, '0px')], [el(170, '170px')])).toEqual([expect.objectContaining({ prop: 'margin-left', ours: '0px', webflow: '170px' })]);
  });
});
