// The social engine's version. A campaign pins it in social/campaign.json ("engine": "social@1.0")
// so it keeps rendering the same way while the engine moves on. Same major, at least the pinned minor.
export const SOCIAL_ENGINE = '1.0.0';

/** Why this engine can't render a campaign pinned to `pin`, or null when it can. */
export function socialEngineProblem(pin, engine = SOCIAL_ENGINE) {
  if (!pin) return null;
  const m = /^social@(\d+)(?:\.(\d+))?/.exec(String(pin));
  if (!m) return `"engine" should look like "social@1.0", not "${pin}".`;
  const [maj, min] = engine.split('.').map(Number);
  const [pMaj, pMin = 0] = [Number(m[1]), Number(m[2] ?? 0)];
  if (pMaj !== maj) return `This campaign was made for social engine ${pMaj}.x and this Pitch Unfairly has ${engine}.`;
  if (pMin > min) return `This campaign needs social engine ${pMaj}.${pMin} or newer; this Pitch Unfairly has ${engine}. Update Pitch Unfairly.`;
  return null;
}
