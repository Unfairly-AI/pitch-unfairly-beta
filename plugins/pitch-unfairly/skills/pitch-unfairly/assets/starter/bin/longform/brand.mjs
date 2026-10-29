// The one place the long-form (and, next, email) engine reads the brand.
// Today that's brand/brand.json, as brand:capture or the workspace's kit left it:
// brand-kit@1, or brand-kit@2 once the starter's brand-lib accepts it. Engines read
// only what resolveBrand returns, so the kit's shape can move without touching them.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateKit } from '../brand-lib.mjs';

/**
 * brand-kit@2 has no separate email slot. An email logo is a lockup whose `use` includes
 * "email" with a PNG file (scale 2 for 2×); its dark-mode twin adds on: "dark". Each face
 * may carry `fallback_stack` for outputs without web fonts. Missing pieces are null.
 */
export function emailBrand(kit) {
  const lockups = Array.isArray(kit?.identity?.lockups) ? kit.identity.lockups : [];
  const png = (l) => (l.format ?? String(l.file ?? l.src ?? '').split('.').pop()).toLowerCase() === 'png';
  const forEmail = lockups.filter((l) => Array.isArray(l?.use) && l.use.includes('email') && png(l));
  const t = kit?.typography ?? {};
  return {
    logo: forEmail.find((l) => (l.on ?? 'any') !== 'dark') ?? null,
    logo_dark: forEmail.find((l) => l.on === 'dark') ?? null,
    fallback: { display: t.display?.fallback_stack ?? null, body: t.body?.fallback_stack ?? null, mono: t.mono?.fallback_stack ?? null },
  };
}

/** Voice rules the checks enforce: @2's voice.rules and voice.banned, or @1's top-level rules. */
export function voiceOf(kit) {
  const v = kit?.voice;
  if (v && !Array.isArray(v) && typeof v === 'object') return { rules: v.rules ?? [], banned: v.banned ?? [], notes: v.notes ?? [] };
  return { rules: Array.isArray(kit?.rules) ? kit.rules : [], banned: [], notes: Array.isArray(v) ? v : [] };
}

/** { kit, schema, source, voice, messaging, design, email }. */
export function resolveBrand(root = '.', { path = 'brand/brand.json' } = {}) {
  const source = join(root, path);
  let kit;
  try {
    kit = JSON.parse(readFileSync(source, 'utf8'));
  } catch {
    throw new Error(`No brand kit at ${path}. Pull the workspace's kit or run npm run brand:capture first.`);
  }
  const errors = validateKit(kit);
  if (errors.length) throw new Error(`${path}: ${errors.join('; ')}`);
  return {
    kit,
    schema: String(kit.schema ?? 'brand-kit@1'),
    source: path,
    voice: voiceOf(kit),
    messaging: kit.messaging ?? null,
    design: kit.design ?? null,
    email: emailBrand(kit),
  };
}
