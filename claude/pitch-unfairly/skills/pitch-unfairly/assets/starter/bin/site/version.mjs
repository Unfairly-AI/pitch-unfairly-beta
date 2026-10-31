// The sites engine's version. A site pins the engine it was built with in
// site.json ("engine": "sites@1.1"), so it keeps building the same way while
// the engine moves on. Same major and at least the pinned minor is compatible.
export const ENGINE = '1.20.0';

/** Why this engine can't build a site pinned to `pin`, or null when it can. */
export function engineProblem(pin, engine = ENGINE) {
  if (!pin) return null;
  const m = /^sites@(\d+)(?:\.(\d+))?/.exec(String(pin));
  if (!m) return `site.json "engine" should look like "sites@1.1", not "${pin}".`;
  const [maj, min] = engine.split('.').map(Number);
  const [pMaj, pMin = 0] = [Number(m[1]), Number(m[2] ?? 0)];
  if (pMaj !== maj) return `This site was built for sites engine ${pMaj}.x and this Pitch Unfairly has ${engine}. Pin "sites@${maj}.${min}" only after checking the site against the new engine.`;
  if (pMin > min) return `This site needs sites engine ${pMaj}.${pMin} or newer; this Pitch Unfairly has ${engine}. Update Pitch Unfairly.`;
  return null;
}
