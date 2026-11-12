// The Webflow push as a resumable sequence of tool calls. The agent holding the Webflow MCP connector
// runs them one at a time: `next` says which call to make (with every id it needs filled in), and
// `record` reads the reply, keeps the ids, and does the uploads that are plain HTTPS. Nothing here
// talks to Webflow itself, so the same run works from any agent, and a run can stop and resume.
//
// Measured against Webflow's hosted MCP server 2.2.0 (2026-11-05); see bin/webflow/plan.mjs for the
// CSS rules the builder accepts.
import { chunk, INSERTS_PER_CALL, planPush, resolveAliases, scrollRevealInteraction } from './plan.mjs';

const VARS_PER_CALL = 25;

/** Every JSON value in a tool reply. Replies can be several objects back to back, after a text line. */
export function parseReply(text) {
  const out = [];
  let depth = 0;
  let start = -1;
  let inStr = false;
  let esc = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"' && depth > 0) inStr = true;
    else if (c === '{' || c === '[') {
      if (depth === 0) start = i;
      depth++;
    } else if ((c === '}' || c === ']') && depth > 0) {
      depth--;
      if (depth === 0) {
        try { out.push(JSON.parse(text.slice(start, i + 1))); } catch { /* not JSON: prose that happened to hold a bracket */ }
      }
    }
  }
  return out;
}

/** Tool errors arrive as {error:{message}} or {status:"error",message}; both count. */
function errorsIn(values) {
  const errs = [];
  const walk = (v) => {
    if (!v || typeof v !== 'object') return;
    if (Array.isArray(v)) return v.forEach(walk);
    if (v.error && typeof v.error === 'object' && v.error.message) errs.push(v.error.message);
    if (v.status === 'error' && v.message) errs.push(v.message);
    for (const k of ['result', 'data']) if (v[k]) walk(v[k]);
  };
  values.forEach(walk);
  return errs;
}

const results = (values) => values.flatMap((v) => (Array.isArray(v) ? v : [v]));

/** Reveal steps declared in the page: `data-wf-step="k"` on a trigger, `data-wf-reveal="k"` on what it shows. */
export function revealsIn(blocks) {
  const steps = new Set();
  const reveals = [];
  for (const b of blocks) {
    for (const m of b.html.matchAll(/<[a-z0-9]+\b[^>]*\bdata-wf-step="([^"]+)"/g)) steps.add(m[1]);
    for (const m of b.html.matchAll(/<[a-z0-9]+\b([^>]*\bdata-wf-reveal="([^"]+)"[^>]*)>/g)) {
      const attr = (n) => m[1].match(new RegExp(`\\b${n}="([^"]*)"`))?.[1];
      reveals.push({ key: m[2], y: Number(attr('data-wf-y') ?? 20), duration: Number(attr('data-wf-duration') ?? 0.5) });
    }
  }
  return { steps: [...steps], reveals, load: reveals.some((r) => r.key === 'load') };
}

/** Outline and other shorthands the style tool wants as longhands; a whole-value token binds to its id. */
function stateProperties(props, varIds, prefix) {
  const out = [];
  const bind = (name, value) => {
    // A token arrives as its plain name or as Webflow's generated one (--_<collection>---<name>).
    const m = value.trim().match(/^var\(--(?:_[\w-]+?---)?([\w-]+)\)$/);
    if (m && varIds[m[1]]) out.push({ property_name: name, variable_as_value: varIds[m[1]] });
    else out.push({ property_name: name, property_value: value });
  };
  for (const { property_name: p, property_value: v } of props) {
    if (p === 'outline') {
      const parts = v.trim().split(/\s+(?![^(]*\))/);
      const width = parts.find((x) => /^-?[\d.]+[a-z%]*$|^(thin|medium|thick)$/.test(x)) ?? 'medium';
      const style = parts.find((x) => /^(none|solid|dashed|dotted|double|auto)$/.test(x)) ?? 'solid';
      const color = parts.filter((x) => x !== width && x !== style).join(' ') || 'currentcolor';
      bind('outline-width', width);
      bind('outline-style', style);
      bind('outline-color', color);
    } else bind(p, v);
  }
  return out;
}

/** The fixed order of a push. Each step reads only what earlier steps captured. */
export function nextStep(run, ledger) {
  const c = ledger.captures;
  const done = new Set(ledger.done);
  const site_id = run.site_id;
  const prefix = run.prefix;
  const call = (id, tool, args, note) => ({ step: id, tool, args, note });

  if (!done.has('site')) return call('site', 'data_sites_tool', { actions: [{ label: 'site', get_site: { site_id } }] }, 'Read the site: its webflow.io name and custom domains.');
  if (!done.has('page')) {
    if (run.page.id) return call('page', 'data_pages_tool', { actions: [{ label: 'page', get_page_metadata: { page_id: run.page.id } }] }, 'Check the target page exists.');
    return call('page', 'data_pages_tool', { actions: [{ label: 'page', create_page: { site_id, title: run.page.title, slug: run.page.slug } }] }, 'Create the page the sections go on.');
  }
  const pageId = c.page_id;
  if (!done.has('body')) return call('body', 'data_element_tool', { siteId: site_id, pageId, actions: [{ label: 'body', get_all_elements: { depth: 0 } }] }, 'Find the page body to insert into.');
  if (!done.has('styles')) return call('styles', 'data_style_tool', { siteId: site_id, pageId, actions: [{ label: 'styles', query_styles: { queries: [{ label: 'ours', name_path: [run.classPrefix], limit: 200 }] } }] }, 'Classes this site already has, so their CSS is not sent twice.');
  if (!done.has('collections')) return call('collections', 'data_variable_tool', { siteId: site_id, pageId, actions: [{ label: 'collections', get_variable_collections: { query: 'all' } }] }, 'Find the brand variable collection.');
  if (!done.has('collection')) {
    if (c.collection_id) return call('collection', 'data_variable_tool', { siteId: site_id, pageId, actions: [{ label: 'vars', get_variables: { variable_collection_id: c.collection_id } }] }, 'Variables already in the collection.');
    return call('collection', 'data_variable_tool', { siteId: site_id, pageId, actions: [{ label: 'collection', create_variable_collection: { name: run.collection } }] }, 'Create the brand variable collection.');
  }
  const plan = planPush(run.compiled, { collection: run.collection, variablePrefix: prefix, existingClasses: c.existing_classes, assetUrls: c.asset_urls });
  const varIds = c.var_ids;
  const open = (s) => !varIds[s.variable_name] && !c.var_failed.includes(s.variable_name);
  const missingBase = plan.variables.filter((s) => !('alias_of' in s.value) && open(s));
  if (missingBase.length) {
    const batch = missingBase.slice(0, VARS_PER_CALL);
    return call(`variables:${batch[0].variable_name}`, 'data_variable_tool', { siteId: site_id, pageId, actions: batch.map((s) => ({ label: s.variable_name, [s.action]: { variable_collection_id: c.collection_id, variable_name: s.variable_name, value: s.value } })) }, `Create ${batch.length} brand variable(s).`);
  }
  const missingAlias = plan.variables.filter((s) => 'alias_of' in s.value && open(s) && varIds[s.value.alias_of]);
  if (missingAlias.length) {
    const batch = resolveAliases(missingAlias.slice(0, VARS_PER_CALL), varIds);
    return call(`aliases:${batch[0].variable_name}`, 'data_variable_tool', { siteId: site_id, pageId, actions: batch.map((s) => ({ label: s.variable_name, [s.action]: { variable_collection_id: c.collection_id, variable_name: s.variable_name, value: s.value } })) }, `Create ${batch.length} alias variable(s).`);
  }
  for (const a of run.assets) {
    if (c.asset_urls[a.src]) continue;
    return call(`asset:${a.src}`, 'data_assets_tool', { actions: [{ label: a.src, create_asset: { site_id, file_name: a.file_name, file_hash: a.md5 } }] }, `Register ${a.file_name}; record uploads the file.`);
  }
  if (!done.has('fonts')) return call('fonts', 'data_fonts_tool', { actions: [{ label: 'fonts', list_fonts: { site_id, limit: 100 } }] }, 'Fonts the site already has.');
  for (const f of run.fonts) {
    if (c.fonts.includes(f.family)) continue;
    const axes = f.axis ? [{ tag: 'wght', name: 'Weight', min: f.axis[0], max: f.axis[1], default_value: f.weight }] : undefined;
    return call(`font:${f.family}`, 'data_fonts_tool', { actions: [{ label: f.family, create_font: { site_id, file_name: f.file_name, file_hash: f.md5, font_family: f.family, weight: f.weight, italic: f.italic, font_display: 'swap', ...(axes ? { axes } : {}) } }] }, `Register ${f.family}; record uploads the file.`);
  }
  const inserts = plan.inserts.filter((i) => !c.inserted.includes(i.build_label));
  if (inserts.length) {
    const batch = inserts.slice(0, INSERTS_PER_CALL);
    return call(`insert:${batch[0].build_label}`, 'data_whtml_builder', {
      siteId: site_id,
      pageId,
      actions: batch.map((i) => ({ build_label: i.build_label, parent_element_id: { component: pageId, element: c.body_id }, creation_position: 'append', html: i.html, ...(i.css ? { css: i.css } : {}) })),
    }, `Insert ${batch.length} section(s).`);
  }
  const reveal = revealsIn(run.compiled.blocks);
  const needsElements = plan.newTabLinks.length || reveal.reveals.length;
  if (needsElements && !done.has('elements')) {
    const queries = [{ label: 'links', element_filter: { type: 'Link' }, limit: 200 }];
    if (reveal.reveals.length) queries.push({ label: 'steps', element_filter: { attribute_name: 'data-wf-step' }, limit: 200 }, { label: 'reveals', element_filter: { attribute_name: 'data-wf-reveal' }, limit: 200 });
    return call('elements', 'data_element_tool', { siteId: site_id, pageId, actions: [{ label: 'elements', query_elements: { queries } }] }, 'Find the inserted links and reveal targets.');
  }
  if (plan.states.length && !done.has('states')) {
    return call('states', 'data_style_tool', { siteId: site_id, pageId, actions: plan.states.map((s, i) => ({ label: `state-${i}`, update_style: { style_name: s.style_name, pseudo: s.pseudo, ...(s.breakpoint_id ? { breakpoint_id: s.breakpoint_id } : {}), properties: stateProperties(s.properties, varIds, prefix) } })) }, 'Add the states the HTML builder cannot take (focus rings).');
  }
  if (plan.newTabLinks.length && !done.has('links')) {
    const ops = [];
    const pool = [...(c.elements.links ?? [])];
    for (const l of plan.newTabLinks) {
      const i = pool.findIndex((e) => (e.attributes?.href ?? e.settings?.link?.href) === l.href);
      if (i < 0) continue;
      const el = pool.splice(i, 1)[0];
      ops.push({ label: `${l.block}:${l.text}`.slice(0, 60), element_id: el.id, settings: [{ key: 'link', static_link: { mode: 'url', to: l.href, open_in_new_tab: true, ...(l.rel ? { rel: l.rel } : {}) } }] });
    }
    if (ops.length) return call('links', 'data_element_settings_tool', { siteId: site_id, pageId, actions: [{ label: 'links', set_settings: { operations: ops } }] }, 'Restore open-in-new-tab, which the HTML builder drops.');
  }
  if (reveal.reveals.length && !done.has('interactions')) {
    const stepEls = {};
    for (const e of c.elements.steps ?? []) (stepEls[e.attributes?.['data-wf-step']] ??= []).push(e.id.element);
    // Targets of one step can move differently (a bubble lifts 8px, a callout 20px): one reveal per setting.
    const groups = {};
    for (const e of c.elements.reveals ?? []) {
      const a = e.attributes ?? {};
      const y = Number(a['data-wf-y'] ?? 20);
      const duration = Number(a['data-wf-duration'] ?? 0.5);
      ((groups[a['data-wf-reveal']] ??= {})[`${y}|${duration}`] ??= { y, duration, ids: [] }).ids.push(e.id.element);
    }
    const actions = [];
    for (const key of [...reveal.steps, ...(reveal.load ? ['load'] : [])]) {
      const sets = Object.values(groups[key] ?? {});
      if (!sets.length) continue;
      const reveals = sets.map((g) => ({ elementId: g.ids[0], extra: g.ids.slice(1), y: g.y, duration: g.duration }));
      const ix = scrollRevealInteraction({ name: `${run.classPrefix}reveal ${key}`, pageId, triggerId: stepEls[key]?.[0] ?? sets[0].ids[0], reveals });
      if (key === 'load') ix.triggers = [{ extensionKey: 'wf:load', config: { control: 'play' } }];
      actions.push({ label: `reveal-${key}`, create_interaction: ix });
    }
    if (actions.length) return call('interactions', 'data_interactions_tool', { siteId: site_id, pageId, actions }, `Create ${actions.length} scroll/load reveal interaction(s).`);
  }
  if (!done.has('publish')) return call('publish', 'data_sites_tool', { actions: [{ label: 'publish', publish_site: { site_id, publishToWebflowSubdomain: true, customDomains: [] } }] }, 'Publish to webflow.io only. Never to a custom domain: the customer publishes production.');
  return null;
}

/**
 * Apply one reply to the ledger. Returns the uploads it implies ({url, fields, file}), which the CLI
 * performs, and throws on a refusal so a failed step is never marked done.
 */
export function recordStep(run, ledger, step, replyText) {
  const values = parseReply(replyText);
  if (!values.length) throw new Error(`No JSON in the reply for ${step}. Save the tool's whole output.`);
  const errs = errorsIn(values);
  const c = ledger.captures;
  const res = results(values);
  const uploads = [];
  const kind = step.split(':')[0];
  // A partly failed batch still committed its good items; keep those, report the rest.
  if (errs.length && !['variables', 'aliases', 'states', 'interactions'].includes(kind)) throw new Error(`${step} was refused:\n${errs.join('\n')}`);

  if (kind === 'site') {
    const site = res.find((r) => r.result?.shortName)?.result;
    if (!site) throw new Error('get_site reply had no site.');
    c.short_name = site.shortName;
    c.custom_domains = (site.customDomains ?? []).map((d) => d.url ?? d);
  } else if (kind === 'page') {
    const page = res.find((r) => r.result?.id || r.result?.slug !== undefined)?.result;
    if (!page && !run.page.id) throw new Error('No page id in the reply.');
    c.page_id = run.page.id ?? page.id;
    c.page_path = page?.publishedPath ?? (page?.slug ? `/${page.slug}` : run.page.path ?? null);
  } else if (kind === 'body') {
    const body = res.flatMap((r) => r.result ?? []).find((x) => x?.data?.type === 'Body');
    if (!body) throw new Error('No Body element in the reply.');
    c.body_id = body.data.id.element;
  } else if (kind === 'styles') {
    c.existing_classes = res.flatMap((r) => r.result ?? []).flatMap((q) => q.matches ?? []).map((m) => m.name);
  } else if (kind === 'collections') {
    const col = res.flatMap((r) => r.result ?? []).find((x) => x?.name === run.collection);
    c.collection_id = col?.id ?? null;
  } else if (kind === 'collection') {
    for (const x of res.flatMap((r) => r.result ?? [])) {
      if (x?.id?.startsWith?.('collection-')) c.collection_id = x.id;
      if (x?.id?.startsWith?.('variable-') && x.name) c.var_ids[x.name] = x.id;
    }
  } else if (kind === 'variables' || kind === 'aliases') {
    for (const x of res.flatMap((r) => r.result ?? [])) if (x?.id && x.name) c.var_ids[x.name] = x.id;
    // A refused variable (an angle in a size slot, say) is skipped from then on; the CSS keeps its var().
    for (const r of res) if (r.label && r.error) c.var_failed.push(r.label);
    if (errs.length) ledger.warnings.push(...errs.map((e) => `${step}: ${e}`));
    ledger.done.push(step);
    return uploads;
  } else if (kind === 'asset') {
    const src = step.slice('asset:'.length);
    const r = res.find((x) => x.result?.uploadUrl)?.result;
    if (!r) throw new Error('create_asset reply had no upload target.');
    const d = r.uploadDetails;
    const fields = {
      acl: d.acl, bucket: d.bucket, 'X-Amz-Algorithm': d.xAmzAlgorithm, 'X-Amz-Credential': d.xAmzCredential, 'X-Amz-Date': d.xAmzDate,
      key: d.key, Policy: d.policy, 'X-Amz-Signature': d.xAmzSignature, success_action_status: d.successActionStatus, 'Content-Type': d.contentType, 'Cache-Control': d.cacheControl,
    };
    uploads.push({ url: r.uploadUrl, fields, file: run.assets.find((a) => a.src === src).path });
    // The HTML builder matches images on the library's S3 URL, not the CDN URL (measured).
    c.asset_urls[src] = r.assetUrl;
  } else if (kind === 'fonts') {
    const all = JSON.stringify(values);
    c.fonts = [...all.matchAll(/"fontFamily":"([^"]+)"/g)].map((m) => m[1]);
  } else if (kind === 'font') {
    const r = res.find((x) => x.result?.upload)?.result;
    if (!r) throw new Error('create_font reply had no upload target.');
    uploads.push({ url: r.upload.url, fields: r.upload.fields, file: run.fonts.find((f) => f.family === step.slice('font:'.length)).path });
    c.fonts.push(step.slice('font:'.length));
  } else if (kind === 'insert') {
    for (const r of res) {
      if (!r.build_label) continue;
      if (r.status === 'error') throw new Error(`Insert ${r.build_label} was refused: ${r.message}`);
      const missed = r.data?.image_warnings ?? [];
      if (missed.length) throw new Error(`Insert ${r.build_label} dropped image(s) not in the asset library: ${missed.map((w) => w.src).join(', ')}`);
      c.inserted.push(r.build_label);
      for (const w of r.data?.warnings ?? []) if (w.code !== 'unknown_variable' || !String(w.detail?.variable).startsWith('_')) ledger.warnings.push(`${r.build_label}: ${w.message}`);
    }
  } else if (kind === 'elements') {
    for (const q of res.flatMap((r) => r.result ?? []).flatMap((x) => x.data ?? [])) c.elements[q.label] = q.matches ?? [];
  } else if (kind === 'states' || kind === 'interactions') {
    if (errs.length) ledger.warnings.push(...errs.map((e) => `${step}: ${e}`));
  } else if (kind === 'publish') {
    if (!res.some((r) => r.result?.publishToWebflowSubdomain)) throw new Error('Publish reply did not confirm a webflow.io publish.');
    c.published_at = new Date().toISOString();
  }
  ledger.done.push(step);
  return uploads;
}

export function emptyLedger() {
  return { done: [], warnings: [], captures: { existing_classes: [], collection_id: null, var_ids: {}, asset_urls: {}, fonts: [], inserted: [], elements: {}, var_failed: [] } };
}

export { chunk };
