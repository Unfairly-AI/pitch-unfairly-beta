// model-calculator's slider behaviour, loaded by model-calculator.astro.
// Each slider recomputes result = factor × every input and redraws the
// figure and its bar. Arrow keys step the focused slider; the deck ignores
// keys inside inputs, and swipes on a slider don't turn the slide.
type Fmt = { prefix?: string; unit?: string; decimals?: number; compact?: boolean };
const format = (n: number, { prefix = '', unit = '', decimals, compact = false }: Fmt) => {
  const abs = Math.abs(n);
  const digits = decimals ?? (compact ? 1 : Number.isInteger(abs) ? 0 : 1);
  const body = new Intl.NumberFormat('en-US', compact ? { notation: 'compact', maximumFractionDigits: digits } : { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(abs);
  return `${n < 0 ? '−' : ''}${prefix}${body}${unit}`;
};

for (const root of document.querySelectorAll<HTMLElement>('[data-calc]')) {
  const { factor, most, result } = JSON.parse(root.dataset.calc!) as { factor: number; most: number; result: Fmt };
  const sliders = [...root.querySelectorAll<HTMLInputElement>('input[type="range"]')];
  const fig = root.querySelector<HTMLElement>('.st-calc-fig')!;
  const bar = root.querySelector<HTMLElement>('.st-calc-bar')!;
  const update = () => {
    const value = sliders.reduce((a, s) => a * Number(s.value), factor);
    for (const s of sliders) {
      const min = Number(s.min);
      const max = Number(s.max);
      s.style.setProperty('--p', `${((Number(s.value) - min) / (max - min)) * 100}%`);
      const decimals = (s.step.split('.')[1] ?? '').length;
      const out = s.closest('label')?.querySelector('output');
      if (out) out.textContent = format(Number(s.value), { prefix: s.dataset.prefix, unit: s.dataset.unit, decimals });
    }
    fig.textContent = format(value, result);
    bar.style.setProperty('--r', String(Math.min(1, value / most)));
  };
  for (const s of sliders) {
    s.addEventListener('input', update);
    for (const type of ['touchstart', 'touchend', 'keydown'] as const) s.addEventListener(type, (e) => e.stopPropagation(), { passive: true });
  }
}
