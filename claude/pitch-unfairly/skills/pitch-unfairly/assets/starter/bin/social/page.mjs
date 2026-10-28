// Builds the page the social engine renders in: brand tokens and fonts from brand/brand.json,
// the selected formats from the registry, and the campaign from social/ (campaign.json,
// styles.css, moments/*.js, assets/). Written to <out>/ and served by bin/serve.mjs.
import { cp, mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brandCss, cssFamily, fontFaceCss, validateKit } from '../brand-lib.mjs';
import { fontDir, fontsourceCss } from '../site-build.mjs';
import { loadRegistry, selectFormats } from './registry.mjs';
import { campaignProblems } from './campaign.mjs';

const here = dirname(fileURLToPath(import.meta.url));

/** The formats a run renders: campaign.formats.include/exclude, narrowed by --platform/--only patterns. */
export function chooseFormats(campaign, { patterns = [] } = {}) {
  const { formats, skipped } = loadRegistry();
  let chosen = selectFormats(formats, campaign.formats?.include ?? []);
  if (campaign.formats?.exclude?.length) {
    const ex = new Set(selectFormats(chosen, campaign.formats.exclude).map((s) => s.id));
    chosen = chosen.filter((s) => !ex.has(s.id));
  }
  if (patterns.length) chosen = selectFormats(chosen, patterns);
  return { formats: chosen, skipped };
}

export async function buildPage({ root = '.', out = 'artifacts/social/.page', patterns = [] } = {}) {
  const at = (p) => join(root, p);
  if (!existsSync(at('social/campaign.json'))) throw new Error('No social/campaign.json. Start one with npm run social:new.');
  const campaign = JSON.parse(await readFile(at('social/campaign.json'), 'utf8'));
  const problems = campaignProblems(campaign);
  if (problems.length) throw new Error(`social/campaign.json:\n${problems.map((p) => `  ✗ ${p}`).join('\n')}`);
  const kit = JSON.parse(await readFile(at('brand/brand.json'), 'utf8'));
  const kitErrors = validateKit(kit);
  if (kitErrors.length) throw new Error(`brand/brand.json: ${kitErrors.join('; ')}`);
  const { formats, skipped } = chooseFormats(campaign, { patterns });
  if (!formats.length) throw new Error(`No formats match ${JSON.stringify([...(campaign.formats?.include ?? []), ...patterns])}. See npm run social:formats.`);

  await rm(at(out), { recursive: true, force: true });
  await mkdir(at(out), { recursive: true });
  // Fonts: Fontsource packages are bundled; font files in the kit come along with brand/.
  let fontCss = '';
  for (const pkg of new Set(['display', 'body', 'mono'].map((r) => kit.typography?.[r]).filter((t) => t?.source === 'fontsource').map((t) => t.package))) {
    if (!fontDir(root, pkg)) throw new Error(`Font package ${pkg} isn't installed. Run npm run brand:apply.`);
    const f = await fontsourceCss(root, pkg);
    fontCss += f.css;
    for (const file of f.files) await cp(join(f.dir, 'files', file), at(join(out, 'fonts', f.name, file)));
  }
  if (existsSync(at('brand'))) await cp(at('brand'), at(join(out, 'brand')), { recursive: true, filter: (p) => !/\/capture(\/|$)/.test(p) });
  if (existsSync(at('social/assets'))) await cp(at('social/assets'), at(join(out, 'social/assets')), { recursive: true });
  const moments = existsSync(at('social/moments')) ? (await readdir(at('social/moments'))).filter((f) => f.endsWith('.js')).sort() : [];
  for (const m of moments) await cp(at(`social/moments/${m}`), at(join(out, 'social/moments', m)));
  for (const f of ['anim.js', 'layout.js', 'runner.js']) await cp(join(here, f), at(join(out, f)));

  const t = kit.typography ?? {};
  // The faces layout must wait for, named as the CSS names them (Fontsource variable fonts
  // register as "<Family> Variable"); measuring with a fallback face misplaces every headline.
  const fonts = ['display', 'body', 'mono'].filter((r) => t[r]?.family).flatMap((r) => {
    const fam = cssFamily(t[r]);
    const w = t[r].weight ?? (r === 'display' ? 700 : 400);
    return [...new Set([w, 400, 500, 600, 700])].map((x) => `${x} 40px "${fam}"`);
  });
  const mark = kit.identity?.logos?.mark ?? kit.identity?.logos?.icon ?? null;
  const brand = { name: kit.identity?.name ?? '', wordmark: kit.identity?.wordmark ?? kit.identity?.name ?? '', domain: kit.identity?.domain ?? '', mark: mark ? `brand/${mark}` : null };
  const css = [fontCss, brandCss(kit, fontFaceCss(kit, 'brand/'), 'brand/'), await readFile(join(here, 'social.css'), 'utf8'), existsSync(at('social/styles.css')) ? await readFile(at('social/styles.css'), 'utf8') : ''].join('\n');
  await writeFile(at(join(out, 'social.css')), css);
  const data = { specs: formats, campaign, brand, fonts };
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${(brand.name || 'Campaign').replace(/[<&]/g, '')} · social</title>
<link rel="stylesheet" href="social.css"></head>
<body><div id="app"></div>
<script>window.SOCIAL = ${JSON.stringify(data).replace(/</g, '\\u003c')};</script>
<script src="anim.js"></script>
${moments.map((m) => `<script src="social/moments/${m}"></script>`).join('\n')}
<script src="layout.js"></script>
<script src="runner.js"></script>
</body></html>
`;
  await writeFile(at(join(out, 'index.html')), html);
  return { out: at(out), formats, skipped, campaign, kit };
}
