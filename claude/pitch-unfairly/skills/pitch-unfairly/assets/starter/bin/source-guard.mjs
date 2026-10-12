// What a pulled deck may not do. A deck's slides are code that runs when it's
// built (and its pages run in a browser during checks), on whoever builds it.
// A deck has no reason to reach past itself: no files outside the project, no
// programs, no environment, no network, no code loaded at runtime. So a
// teammate's bundle that tries is refused, naming the file and line.
//
// The deck studio applies the same rules (src/lib/deck-host/source-guard.ts in
// unfairly-app); keep the two in step.

const CODE = /\.(astro|[cm]?[jt]sx?|mdx|svelte|vue|html?|css|scss|less)$/i;

const NODE_MODULES = 'fs|fs/promises|os|child_process|net|tls|http|https|http2|dgram|dns|vm|worker_threads|cluster|module|process|inspector|v8|perf_hooks|readline|repl';

const RULES = [
  // Only where code is loaded: "cluster" or "module" in a class name is fine.
  { re: new RegExp(`(?:\\bfrom\\s*|\\bimport\\s*\\(?\\s*|\\brequire\\(\\s*)['"](?:node:[\\w/]+|(?:${NODE_MODULES}))['"]`), why: 'uses a Node system module (files, programs, network)' },
  // Code patterns, not words: a slide can say "our process. We..." or "WebSocket".
  { re: /\brequire\(/, why: 'loads code with require()' },
  { re: /\bprocess\.(?:env|exit|argv|cwd|chdir|kill|binding|dlopen|stdout|stderr|stdin|mainModule|getBuiltinModule)\b/, why: 'reads or controls the process (process.env, process.exit, ...)' },
  { re: /\b(?:Deno|Bun)\.\w/, why: 'uses a runtime API' },
  { re: /\beval\(|\bnew Function\(|(?<![\w.])Function\(/, why: 'runs code built from a string' },
  { re: /\bimport\(/, why: 'loads code at runtime with import()' },
  { re: /\bfetch\(|\bnew (?:XMLHttpRequest|WebSocket|EventSource)\b|\bsendBeacon\(|\bimportScripts\(|\bserviceWorker\.register\(/, why: 'makes network requests' },
  { re: /\b(?:import\.meta|Astro)\.glob\s*\(\s*['"`](?:\/|[^'"`]*\.\.)/, why: 'reads files by a pattern outside the deck' },
];

/** Every module specifier and CSS url() in a file, with its line. CSS may load https (web fonts); scripts may not. */
function references(text) {
  const out = [];
  const patterns = [
    { re: /\b(?:import|export)\s[^'"`;]*?\bfrom\s*['"`]([^'"`]+)['"`]/g, css: false },
    { re: /\bimport\s*['"`]([^'"`]+)['"`]/g, css: false },
    { re: /@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)/g, css: true },
    { re: /\burl\(\s*['"]?([^'")\s]+)/g, css: true },
  ];
  for (const { re, css } of patterns) {
    for (const m of text.matchAll(re)) {
      if (css && /^https:\/\//.test(m[1])) continue;
      out.push({ spec: m[1], index: m.index ?? 0 });
    }
  }
  return out;
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

/** Whether a reference stays inside the deck project (or is a package or data URL). */
function staysInside(spec, fromPath) {
  if (/^(?:data:|#)/.test(spec)) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(spec) || spec.startsWith('//')) return false; // http:, file:, node:, ...
  if (spec.startsWith('/@')) return false; // /@fs/ and friends reach the whole disk
  if (!spec.startsWith('.') && !spec.startsWith('/')) return true; // a package, resolved from the starter's own node_modules
  // /logo.svg is the project's public/ folder; ./ and ../ are from this file. Neither may climb out.
  const parts = spec.startsWith('/') ? [] : fromPath.split('/').slice(0, -1);
  for (const seg of spec.split(/[?#]/)[0].split('/')) {
    if (seg === '..') {
      if (!parts.length) return false;
      parts.pop();
    } else if (seg && seg !== '.') parts.push(seg);
  }
  return true;
}

/**
 * Findings for a bundle's files ([{ path, text }]): [{ path, line, why }].
 * Empty means nothing in it reaches outside the deck.
 */
export function scanSource(files) {
  const findings = [];
  for (const { path, text } of files) {
    if (!CODE.test(path)) continue;
    for (const rule of RULES) {
      const re = new RegExp(rule.re.source, rule.re.flags.includes('g') ? rule.re.flags : `${rule.re.flags}g`);
      for (const m of text.matchAll(re)) findings.push({ path, line: lineOf(text, m.index ?? 0), why: rule.why });
    }
    for (const ref of references(text)) {
      if (!staysInside(ref.spec, path)) findings.push({ path, line: lineOf(text, ref.index), why: `refers to something outside the deck (${ref.spec.slice(0, 80)})` });
    }
  }
  return findings.sort((a, b) => a.path.localeCompare(b.path) || a.line - b.line);
}
