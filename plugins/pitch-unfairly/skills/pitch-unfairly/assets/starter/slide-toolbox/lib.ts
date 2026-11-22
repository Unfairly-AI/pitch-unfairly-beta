// Shared by every slide toolbox layout: the props each one passes to Slide,
// the accent-phrase split, and the type fitting that keeps a headline, a
// quote or a figure at the largest size that still fits its box.

/** The tones Slide.astro knows. */
export type Tone = 'paper' | 'warm' | 'ink' | 'accent' | 'yellow' | 'cyan' | 'pink';

/** What every layout passes straight to Slide.astro. */
export interface SlideBase {
  /** Stable, unique id. Becomes #slide-{id}; audits and screenshots use it. */
  id: string;
  /** Short name for assistive tech and screenshots. */
  label?: string;
  /** The slide's background. Each layout has a default that suits its job. */
  tone?: Tone;
  /** Speaker notes. Sources, caveats and anything the slide leaves out go here. */
  notes?: string;
  /** A sub-brand's id (brand/sub-brands/<id>.json): this slide wears that kit. */
  brand?: string;
}

/**
 * Split a sentence around its one accent phrase: [before, phrase, after].
 * The phrase must appear in the sentence word for word; a typo would silently
 * drop the emphasis, so it throws instead.
 */
export function splitHl(text: string, hl: string | undefined, where: string): [string, string, string] {
  if (!hl) return [text, '', ''];
  const at = text.indexOf(hl);
  if (at < 0) throw new Error(`${where}: hl "${hl}" isn't in "${text}". Copy the phrase from the sentence exactly.`);
  return [text.slice(0, at), hl, text.slice(at + hl.length)];
}

/** BrandMark's `on` for a slide tone: the logo variant made for that background. */
export const markOn = (tone: Tone): 'paper' | 'ink' | 'accent' => (tone === 'ink' ? 'ink' : tone === 'accent' ? 'accent' : 'paper');

/**
 * The largest type size, in px, at which `chars` characters of display type
 * fill at most `lines` lines of a `width`-wide box, between `min` and `max`.
 * 0.55em is an average display-face character; the brand's --display-scale
 * corrects wide and narrow faces, so callers multiply by it in CSS.
 */
export function fitType(chars: number, { width, lines, min, max, em = 0.55 }: { width: number; lines: number; min: number; max: number; em?: number }): number {
  const size = Math.floor((width * lines) / (Math.max(chars, 1) * em));
  return Math.max(min, Math.min(max, size));
}

/**
 * The width of a figure in em: digits are about 0.6em, separators 0.3em.
 * A prefix ("$") and a unit ("%", "x", "min") are set smaller, at the sizes
 * the big-number layouts use, so they count for less.
 */
export function figureEm(number: string, prefix = '', unit = ''): number {
  const ems = (s: string) => [...s].reduce((n, c) => n + (/[.,:\s]/.test(c) ? 0.3 : 0.6), 0);
  return ems(number) + ems(prefix) * 0.5 + ems(unit) * unitScale(unit) + 0.04;
}

/** A one-character unit (%, x, k) sits close to the figure's size; a word ("min", "hrs") is set small. */
export const unitScale = (unit = ''): number => ([...unit].length <= 1 ? 0.6 : 0.3);

/** Initials for a monogram when there is no photo: "Dana Ortiz" -> "DO". */
export const initials = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .slice(0, 2)
    .join('');

/**
 * A chart or model value as written: "$572k", "41 min", "-18".
 * `unit` is appended as given, so a word takes its own leading space (" min").
 * `sign` writes a plus on gains; a loss always gets a true minus sign.
 * `compact` writes 1,200,000 as "1.2M".
 */
export function formatNumber(n: number, { prefix = '', unit = '', decimals, compact = false, sign = false }: { prefix?: string; unit?: string; decimals?: number; compact?: boolean; sign?: boolean } = {}): string {
  const abs = Math.abs(n);
  const digits = decimals ?? (compact ? 1 : Number.isInteger(abs) ? 0 : 1);
  const body = new Intl.NumberFormat('en-US', compact ? { notation: 'compact', maximumFractionDigits: digits } : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(abs);
  const lead = n < 0 ? '−' : sign && n > 0 ? '+' : '';
  return `${lead}${prefix}${body}${unit}`;
}
