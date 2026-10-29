// The long-form engine's version. A document pins it in longform/longform.json
// ("engine": "longform@1.0") so it keeps building the same way while the engine moves on.
export const LONGFORM_ENGINE = '1.0.1';

/** Why this engine can't build a document pinned to `pin`, or null when it can. */
export function longformEngineProblem(pin, engine = LONGFORM_ENGINE) {
  if (!pin) return null;
  const m = /^longform@(\d+)(?:\.(\d+))?/.exec(String(pin));
  if (!m) return `"engine" should look like "longform@1.0", not "${pin}".`;
  const [maj, min] = engine.split('.').map(Number);
  const [pMaj, pMin = 0] = [Number(m[1]), Number(m[2] ?? 0)];
  if (pMaj !== maj) return `This document was made for long-form engine ${pMaj}.x and this Pitch Unfairly has ${engine}.`;
  if (pMin > min) return `This document needs long-form engine ${pMaj}.${pMin} or newer; this Pitch Unfairly has ${engine}. Update Pitch Unfairly.`;
  return null;
}
