// The email engine's version. An email pins it in email/email.json ("engine": "email@1.0")
// so it keeps building the same way while the engine moves on.
export const EMAIL_ENGINE = '1.0.1';

/** Why this engine can't build an email pinned to `pin`, or null when it can. */
export function emailEngineProblem(pin, engine = EMAIL_ENGINE) {
  if (!pin) return null;
  const m = /^email@(\d+)(?:\.(\d+))?/.exec(String(pin));
  if (!m) return `"engine" should look like "email@1.0", not "${pin}".`;
  const [maj, min] = engine.split('.').map(Number);
  const [pMaj, pMin = 0] = [Number(m[1]), Number(m[2] ?? 0)];
  if (pMaj !== maj) return `This email was made for email engine ${pMaj}.x and this Pitch Unfairly has ${engine}.`;
  if (pMin > min) return `This email needs email engine ${pMaj}.${pMin} or newer; this Pitch Unfairly has ${engine}. Update Pitch Unfairly.`;
  return null;
}
