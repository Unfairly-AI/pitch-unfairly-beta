// Turns a site's hand-written sections into one page. The sections are the
// site's own HTML, written for this customer; this file only fills figures
// and wraps them in the page shell. There are no stock components.
//
// In a section:
//   {{name}}         a model value, formatted, and live: <span data-v="name">
//                    (a calculator that changes an input updates it)
//   {{facts.path}}   a fact from site.json, as plain text
//   {{= expr | fmt}} a one-off formula over the model, e.g. {{= fee1 / 12 | money}}
import { runModel, displayValues, evaluate, format } from './model.mjs';

export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Inline {{> parts/name}} from `read(name)`, up to three levels deep. Missing parts are reported. */
export function includeParts(html, read, missing = [], depth = 0) {
  return html.replace(/\{\{>\s*([\w./-]+)\s*\}\}/g, (whole, name) => {
    const text = depth < 3 ? read(name) : null;
    if (text == null) {
      missing.push(`${whole} (no site/${name.replace(/\.html$/, '')}.html)`);
      return '';
    }
    return includeParts(text, read, missing, depth + 1);
  });
}

const TOKEN = /\{\{\s*(=\s*[^}|]+?(?:\|\s*\w+)?|[\w.]+)\s*\}\}/g;

/** Fill every token in html. Returns the html and the tokens that didn't resolve. */
export function fillTokens(html, { model = {}, facts = {} } = {}) {
  const env = runModel(model);
  const shown = displayValues(model, env);
  const missing = [];
  // Inside a tag (an alt, a title) a token is plain text; in the page it's a live span.
  const fill = (text, live) =>
    text.replace(TOKEN, (whole, body) => {
      if (body.startsWith('=')) {
        const [expr, fmt] = body.slice(1).split('|').map((s) => s.trim());
        try {
          const v = esc(format(evaluate(expr, env), fmt));
          return live ? `<span data-expr="${esc(expr)}" data-format="${esc(fmt ?? '')}">${v}</span>` : v;
        } catch (e) {
          missing.push(`${whole} (${e.message})`);
          return whole;
        }
      }
      if (body.startsWith('facts.')) {
        const v = body.slice(6).split('.').reduce((o, k) => (o == null ? undefined : o[k]), facts);
        if (v === undefined || typeof v === 'object') {
          missing.push(whole);
          return whole;
        }
        return esc(v);
      }
      if (body in shown) return live ? `<span data-v="${body}">${esc(shown[body])}</span>` : esc(shown[body]);
      missing.push(whole);
      return whole;
    });
  const out = html
    .split(/(<[^>]*>)/)
    .map((part, i) => fill(part, i % 2 === 0))
    .join('');
  return { html: out, env, missing };
}

/** The page around the sections. Everything is local: the content host allows no third-party requests. */
export function pageShell({ site, body, css, model }) {
  const title = `${site.sample ? 'Sample: ' : ''}${site.title ?? 'Site'}`;
  return `<!doctype html>
<html lang="${esc(site.lang ?? 'en')}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${esc(title)}</title>
<meta name="description" content="${esc(site.description ?? '')}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(site.description ?? '')}">
${site.image ? `<meta property="og:image" content="${esc(site.image)}">` : ''}
${site.icon ? `<link rel="icon" href="${esc(site.icon)}">` : ''}
<style>${css}</style>
</head>
<body>
${body}
<script type="application/json" id="site-model">${JSON.stringify(model ?? {}).replace(/</g, '\\u003c')}</script>
<script type="module">
import { hydrate } from './js/app.js';
hydrate(document.body, JSON.parse(document.getElementById('site-model').textContent));
</script>
</body>
</html>`;
}
