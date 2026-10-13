// A site's model: named formulas over named inputs, evaluated in order. The
// same code runs at build time (to print every figure) and in the page (so
// calculators recompute live), so a number can't differ between the two.
//
//   "model": {
//     "inputs":  { "billed": 133, "pepm": 20, "engaged": [0.35, 0.55, 0.6] },
//     "formulas": { "fee_y1": "billed * pepm * 12", "eng_y1": "engaged[0]",
//                   "step": "if(sav_y1 >= fee_y1, 1, 0)" },
//     "formats": { "fee_y1": "money", "eng_y1": "pct" }
//   }
//
// Expressions: numbers, names, name[i], + - * / %, comparisons (< <= > >= == !=),
// && || !, parentheses, and min max round floor ceil abs if(cond, a, b) sum(list).
// No other syntax: nothing in a site file can run code.

const FUNCS = {
  min: Math.min,
  max: Math.max,
  round: (x, digits = 0) => Math.round(x * 10 ** digits) / 10 ** digits,
  floor: Math.floor,
  ceil: Math.ceil,
  abs: Math.abs,
  if: (c, a, b) => (c ? a : b),
  sum: (...xs) => xs.flat().reduce((a, b) => a + b, 0),
};

function tokenize(src) {
  const out = [];
  const re = /\s*(?:(\d+(?:\.\d+)?)|([A-Za-z_][A-Za-z0-9_]*)|(<=|>=|==|!=|&&|\|\||[-+*/%()<>!,\[\]]))/y;
  let i = 0;
  while (i < src.length) {
    if (/\s/.test(src[i])) {
      i++;
      continue;
    }
    re.lastIndex = i;
    const m = re.exec(src);
    if (!m) throw new Error(`Can't read "${src.slice(i, i + 12)}" in formula "${src}"`);
    out.push(m[1] !== undefined ? { t: 'num', v: Number(m[1]) } : m[2] !== undefined ? { t: 'name', v: m[2] } : { t: 'op', v: m[3] });
    i = re.lastIndex;
  }
  return out;
}

// Pratt parser to a tiny AST.
export function parse(src) {
  const toks = tokenize(String(src));
  let p = 0;
  const peek = () => toks[p];
  const take = (v) => {
    const t = toks[p];
    if (!t || (v && t.v !== v)) throw new Error(`Expected ${v ?? 'more'} in formula "${src}"`);
    p++;
    return t;
  };
  const BIN = { '||': 1, '&&': 2, '==': 3, '!=': 3, '<': 4, '<=': 4, '>': 4, '>=': 4, '+': 5, '-': 5, '*': 6, '/': 6, '%': 6 };
  function primary() {
    const t = take();
    if (t.t === 'num') return { k: 'num', v: t.v };
    if (t.t === 'op' && t.v === '(') {
      const e = expr(0);
      take(')');
      return e;
    }
    if (t.t === 'op' && (t.v === '-' || t.v === '!')) return { k: 'un', op: t.v, a: primary() };
    if (t.t === 'name') {
      if (peek()?.v === '(') {
        take('(');
        const args = [];
        if (peek()?.v !== ')') {
          do args.push(expr(0));
          while (peek()?.v === ',' && take(','));
        }
        take(')');
        if (!Object.hasOwn(FUNCS, t.v)) throw new Error(`Unknown function ${t.v}() in formula "${src}"`);
        return { k: 'call', f: t.v, args };
      }
      let node = { k: 'name', v: t.v };
      while (peek()?.v === '[') {
        take('[');
        node = { k: 'index', a: node, i: expr(0) };
        take(']');
      }
      return node;
    }
    throw new Error(`Unexpected "${t.v}" in formula "${src}"`);
  }
  function expr(minPrec) {
    let left = primary();
    for (;;) {
      const t = peek();
      const prec = t && t.t === 'op' ? BIN[t.v] : undefined;
      if (prec === undefined || prec < minPrec) break;
      take();
      left = { k: 'bin', op: t.v, a: left, b: expr(prec + 1) };
    }
    return left;
  }
  const ast = expr(0);
  if (p !== toks.length) throw new Error(`Unexpected "${toks[p].v}" in formula "${src}"`);
  return ast;
}

function evalAst(n, env) {
  switch (n.k) {
    case 'num':
      return n.v;
    case 'name':
      if (!Object.hasOwn(env, n.v)) throw new Error(`Unknown name "${n.v}"`);
      return env[n.v];
    case 'index': {
      const a = evalAst(n.a, env);
      const i = evalAst(n.i, env);
      if (!Array.isArray(a)) throw new Error('Only lists can be indexed');
      return a[i];
    }
    case 'un':
      return n.op === '-' ? -evalAst(n.a, env) : !evalAst(n.a, env) ? 1 : 0;
    case 'call':
      return FUNCS[n.f](...n.args.map((x) => evalAst(x, env)));
    case 'bin': {
      const a = evalAst(n.a, env);
      if (n.op === '&&') return a ? evalAst(n.b, env) : a;
      if (n.op === '||') return a ? a : evalAst(n.b, env);
      const b = evalAst(n.b, env);
      switch (n.op) {
        case '+': return a + b;
        case '-': return a - b;
        case '*': return a * b;
        case '/': return a / b;
        case '%': return a % b;
        case '<': return a < b ? 1 : 0;
        case '<=': return a <= b ? 1 : 0;
        case '>': return a > b ? 1 : 0;
        case '>=': return a >= b ? 1 : 0;
        case '==': return a === b ? 1 : 0;
        case '!=': return a !== b ? 1 : 0;
      }
    }
  }
  throw new Error('Bad formula');
}

/** Evaluate one expression against an environment (used for per-cell formulas). */
export function evaluate(src, env) {
  return evalAst(parse(src), env);
}

/** Run a model: inputs (with overrides) then each formula in order. Returns every value by name. */
export function runModel(model = {}, overrides = {}) {
  const env = { ...(model.inputs ?? {}), ...overrides };
  for (const [name, f] of Object.entries(model.formulas ?? {})) {
    const v = evaluate(f, env);
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`Formula ${name} = ${f} gave ${v}`);
    env[name] = v;
  }
  return env;
}

// ── Formats ──
const commas = (n) => Math.abs(Math.round(n)).toLocaleString('en-US');
export const FORMATS = {
  money: (n) => (Math.round(n) < 0 ? '−$' : '$') + commas(n),
  // Dollars to the cent where the input has them ($27.40 stays $27.4).
  money_exact: (n) => (n < 0 ? '−$' : '$') + Math.abs(n).toLocaleString('en-US', { maximumFractionDigits: 2 }),
  money_k: (n) => (n < 0 ? '−$' : '$') + Math.round(Math.abs(n) / 1000) + 'K',
  pct: (n) => Math.round(n * 100) + '%',
  mult: (n) => (Math.round(n * 10) / 10).toFixed(1) + '×',
  int: (n) => commas(n),
  number: (n) => String(Math.round(n * 100) / 100),
};

export function format(value, kind) {
  if (typeof value !== 'number') return String(value ?? '');
  const f = FORMATS[kind];
  return f ? f(value) : String(Math.round(value * 100) / 100);
}

/** Every model value as display text, using the model's formats (unformatted values print as plain numbers). */
export function displayValues(model, env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === 'number') out[k] = format(v, model.formats?.[k]);
  return out;
}
