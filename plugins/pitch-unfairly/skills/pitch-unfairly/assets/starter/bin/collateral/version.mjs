// The collateral engine's version. A collateral set pins it in collateral/collateral.json
// ("engine": "collateral@1.0") so it keeps rendering the same way while the engine moves on.
export const COLLATERAL_ENGINE = '1.1.0';

/** Why this engine can't render a set pinned to `pin`, or null when it can. */
export function collateralEngineProblem(pin, engine = COLLATERAL_ENGINE) {
  if (!pin) return null;
  const m = /^collateral@(\d+)(?:\.(\d+))?/.exec(String(pin));
  if (!m) return `"engine" should look like "collateral@1.0", not "${pin}".`;
  const [maj, min] = engine.split('.').map(Number);
  const [pMaj, pMin = 0] = [Number(m[1]), Number(m[2] ?? 0)];
  if (pMaj !== maj) return `This set was made for collateral engine ${pMaj}.x and this Pitch Unfairly has ${engine}.`;
  if (pMin > min) return `This set needs collateral engine ${pMaj}.${pMin} or newer; this Pitch Unfairly has ${engine}. Update Pitch Unfairly.`;
  return null;
}
