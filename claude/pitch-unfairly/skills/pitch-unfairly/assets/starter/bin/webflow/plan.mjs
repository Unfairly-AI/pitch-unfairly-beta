/**
 * Turn a compiled page into the calls Webflow's hosted MCP server takes: variables first, then one
 * `data_whtml_builder` insert per section, then the states the HTML builder refuses.
 *
 * Pure: no network, no IDs except what the caller passes back in. Every rule below was measured on a
 * live site with MCP 2.2.0 (2026-11-05), not taken from docs:
 *
 * - The HTML builder accepts only `.class` selectors, only the :hover / :focus / :active states, and
 *   only Webflow's own media queries written exactly as `screen and (max-width: 991|767|479px)`.
 *   Descendant selectors, pseudo-elements, other states and any other media query are rejected.
 * - `var(--name)` as a whole value binds to the variable called `name` in any collection (stored as a
 *   variable link). Inside a larger value (`calc(var(--a) + 2px)`) a plain name is replaced by the
 *   variable's value at insert time, so we write the variable's generated CSS name instead
 *   (`--_<collection-slug>---<name>`), which Webflow keeps and defines on the published site.
 * - Variables come in five types; an angle or a keyword (`-2.5deg`, `none`) fits none of them and is
 *   written into the CSS as its value.
 * - Sending CSS for a class the site already has creates a duplicate (`name-1`), so each class's rules
 *   are sent once, and never for a class the site already holds.
 * - An <img> must point at a file already in the site's asset library (matched on the library's
 *   `s3.amazonaws.com/webflow-prod-assets/...` URL, not the CDN URL upload returns), or it is dropped.
 * - Whitespace at the end of an element's text is trimmed (`<span>, </span>` becomes `,`), which
 *   glues inline text together. A zero-width space after it keeps the space without changing layout.
 * - `-webkit-font-smoothing` is not a Webflow style property, so it is stripped and reported. On macOS
 *   text then renders with default (subpixel) smoothing: this is the ~2% pixel difference left on the
 *   customer page.
 * - `target="_blank"` is dropped on links; `rel` and every `data-*` attribute survive. New-tab links
 *   are listed so the caller can set them with the element settings tool after insert.
 */
import postcss from "postcss";
import { parse } from "parse5";
export const MEDIA = {
    "(max-width: 991px)": { query: "screen and (max-width: 991px)", breakpoint: "medium" },
    "(max-width: 767px)": { query: "screen and (max-width: 767px)", breakpoint: "small" },
    "(max-width: 479px)": { query: "screen and (max-width: 479px)", breakpoint: "tiny" },
};
const HTML_STATES = new Set(["hover", "focus", "active"]);
/** States the style tool can set after insert. */
const LATER_STATES = new Set(["focus-visible", "focus-within", "visited", "placeholder"]);
/** Properties Webflow's style model rejects ("Invalid style property"); only site custom code could set them. */
const UNSUPPORTED_PROPS = new Set(["-webkit-font-smoothing", "-moz-osx-font-smoothing"]);
const FOCUSABLE_TAGS = new Set(["a", "button", "input", "select", "textarea", "summary"]);
const SIZE_UNITS = new Set(["px", "em", "rem", "vh", "vw", "dvh", "dvw", "lvh", "lvw", "svh", "svw", "vmax", "vmin", "ch"]);
/** The HTML builder takes at most this many inserts per call. */
export const INSERTS_PER_CALL = 5;
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
/** The CSS custom property Webflow emits for a variable in a named (non-base) collection. */
export const variableCssName = (collection, name) => `--_${slug(collection)}---${name}`;
const VAR_ONLY = /^var\(--([\w-]+)\)$/;
function sizeValue(v) {
    const m = v.trim().match(/^(-?\d*\.?\d+)([a-z]+)$/);
    if (m && SIZE_UNITS.has(m[2]))
        return { static_value: { value: Number(m[1]), unit: m[2] } };
    if (/^-?0$/.test(v.trim()))
        return { static_value: { value: 0, unit: "px" } };
    return { custom_value: v };
}
const ACTION = {
    color: "create_color_variable",
    size: "create_size_variable",
    number: "create_number_variable",
    "font-family": "create_font_family_variable",
};
/** Variables in creation order (targets before aliases), plus the tokens that must be inlined. */
export function planVariables(vars, prefix = "uf-") {
    const byName = new Map(vars.map((v) => [v.name, v]));
    const typeOf = (name, seen = new Set()) => {
        const v = byName.get(name);
        if (!v || seen.has(name))
            return "other";
        seen.add(name);
        const alias = v.value.trim().match(VAR_ONLY);
        if (alias && byName.has(alias[1])) {
            const t = typeOf(alias[1], seen);
            return v.type === "other" || v.type === t ? t : v.type;
        }
        return v.type;
    };
    const inlined = {};
    const steps = [];
    const aliases = [];
    for (const v of vars) {
        const type = typeOf(v.name);
        if (type === "other") {
            inlined[v.name] = v.value;
            continue;
        }
        const alias = v.value.trim().match(VAR_ONLY);
        const name = prefix + v.name;
        if (alias && byName.has(alias[1]) && typeOf(alias[1]) === type) {
            aliases.push({ action: ACTION[type], variable_name: name, value: { alias_of: prefix + alias[1] } });
            continue;
        }
        const value = type === "size" ? sizeValue(v.value) : type === "number" && /^-?\d*\.?\d+$/.test(v.value.trim()) ? { static_value: Number(v.value) } : type === "number" ? { custom_value: v.value } : { static_value: v.value };
        steps.push({ action: ACTION[type], variable_name: name, value });
    }
    // Aliases may point at aliases: emit each once its target exists.
    const made = new Set(steps.map((s) => s.variable_name));
    let pending = aliases;
    while (pending.length) {
        const ready = pending.filter((s) => made.has(s.value.alias_of));
        if (!ready.length)
            throw new Error(`variable alias cycle: ${pending.map((s) => s.variable_name).join(", ")}`);
        for (const s of ready) {
            steps.push(s);
            made.add(s.variable_name);
        }
        pending = pending.filter((s) => !ready.includes(s));
    }
    return { steps, inlined };
}
const NAMED = { transparent: [0, 0, 0, 0], white: [255, 255, 255, 1], black: [0, 0, 0, 1] };
function parseColor(c) {
    const s = c.trim().toLowerCase();
    if (NAMED[s])
        return NAMED[s];
    const hex = s.match(/^#([0-9a-f]{3,8})$/);
    if (hex) {
        const h = hex[1].length <= 4 ? [...hex[1]].map((x) => x + x).join("") : hex[1];
        const n = (i) => parseInt(h.slice(i, i + 2), 16);
        return [n(0), n(2), n(4), h.length === 8 ? n(6) / 255 : 1];
    }
    const rgb = s.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+)(%?))?\s*\)$/);
    if (rgb)
        return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3]), rgb[4] === undefined ? 1 : Number(rgb[4]) / (rgb[5] ? 100 : 1)];
    return null;
}
/**
 * Webflow cannot store color-mix() (as a border color it silently became a plain link to the first
 * color, dropping the mix), so an srgb mix of known colors is written as the rgba() it computes to.
 */
export function resolveColorMix(value) {
    return value.replace(/color-mix\(\s*in srgb\s*,\s*([^,]+?)(?:\s+([\d.]+)%)?\s*,\s*([^,]+?)(?:\s+([\d.]+)%)?\s*\)/g, (m, a, pa, b, pb) => {
        const ca = parseColor(a);
        const cb = parseColor(b ?? "");
        if (!ca || !cb)
            return m;
        const p = pa !== undefined ? Number(pa) / 100 : pb !== undefined ? 1 - Number(pb) / 100 : 0.5;
        const q = pb !== undefined ? Number(pb) / 100 : 1 - p;
        const alpha = ca[3] * p + cb[3] * q;
        if (alpha === 0)
            return "transparent";
        const ch = (i) => Math.round((ca[i] * ca[3] * p + cb[i] * cb[3] * q) / alpha);
        return `rgba(${ch(0)}, ${ch(1)}, ${ch(2)}, ${Math.round(alpha * 1000) / 1000})`;
    });
}
function inlineTokens(value, inlined, depth = 0) {
    if (depth > 8)
        return value;
    const next = value.replace(/var\(--([\w-]+)\)/g, (m, n) => (n in inlined ? inlined[n] : m));
    return next === value ? value : inlineTokens(next, inlined, depth + 1);
}
export function rewriteValue(value, ctx) {
    let v = inlineTokens(value, ctx.inlined).trim();
    if (v.includes("color-mix("))
        v = resolveColorMix(inlineTokens(v, ctx.values));
    const whole = v.match(VAR_ONLY);
    if (whole && ctx.known.has(whole[1]))
        return `var(--${ctx.prefix}${whole[1]})`;
    return v.replace(/var\(--([\w-]+)\)/g, (m, n) => {
        if (ctx.known.has(n))
            return `var(${variableCssName(ctx.collection, ctx.prefix + n)})`;
        ctx.skipped.push({ kind: "unknown-variable", detail: `${n} in ${value}` });
        return m;
    });
}
/** Classes that sit on something a keyboard can reach, so a focus-visible ring is worth keeping. */
function focusableClasses(html) {
    const out = new Set();
    const walk = (n) => {
        if (n.tagName) {
            const attrs = new Map((n.attrs ?? []).map((a) => [a.name, a.value]));
            const focusable = (FOCUSABLE_TAGS.has(n.tagName) && (n.tagName !== "a" || attrs.has("href"))) || attrs.has("tabindex");
            if (focusable)
                for (const c of (attrs.get("class") ?? "").split(/\s+/).filter(Boolean))
                    out.add(c);
        }
        for (const c of n.childNodes ?? [])
            walk(c);
    };
    walk(parse(html));
    return out;
}
const PHRASING_CLOSE = /([^>\s])(\s+)(<\/(?:span|a|strong|em|small|b|i|code|sup|sub|abbr|mark|q|cite|time|label)>)/g;
const ZWSP = "​";
/** Keep a space that ends an inline element's text: Webflow trims it, a zero-width space after it stops that. */
export function guardTrailingSpace(html) {
    return html.replace(PHRASING_CLOSE, (_, ch, ws, close) => `${ch}${ws.includes("\n") ? " " : ws}${ZWSP}${close}`);
}
export function newTabLinks(block, html) {
    const out = [];
    for (const m of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)) {
        const attrs = m[1];
        if (!/\btarget="_blank"/.test(attrs))
            continue;
        const href = attrs.match(/\bhref="([^"]*)"/)?.[1] ?? "";
        const rel = attrs.match(/\brel="([^"]*)"/)?.[1];
        out.push({ block, href, text: m[2].replace(/<[^>]+>/g, "").trim(), ...(rel ? { rel } : {}) });
    }
    return out;
}
/**
 * A span with no attributes carries nothing, and Webflow's HTML builder mangles one nested in another
 * inline element (measured: `<em>like this <span>today</span></em>` published as "like this ##INLINE0##").
 */
export function unwrapBareSpans(html) {
    let prev;
    do {
        prev = html;
        html = html.replace(/<span>([^<]*)<\/span>/g, "$1");
    } while (html !== prev);
    return html;
}
function rewriteHtml(html, assetUrls, skipped) {
    return guardTrailingSpace(unwrapBareSpans(html)).replace(/(<img\b[^>]*?\bsrc=")([^"]+)(")/g, (m, a, src, b) => {
        if (/^https?:/.test(src) && Object.values(assetUrls).includes(src))
            return m;
        const url = assetUrls[src];
        if (!url) {
            skipped.push({ kind: "image", detail: `${src} is not in the site's asset library; Webflow would drop it` });
            return m;
        }
        return a + url + b;
    });
}
/**
 * Webflow drops `unset` / `initial` (measured: a tablet `grid-column: unset` vanished, leaving a
 * one-column grid with an item in column 3), so the keyword becomes the property's initial value.
 */
const RESETS = [
    [/^grid-(column|row)(-start|-end)?$|^grid-area$/, "auto"],
    [/^(row-|column-)?gap$|^grid-(row-|column-)?gap$/, "0px"],
    [/^(margin|padding)(-(top|right|bottom|left|inline|block)(-start|-end)?)?$/, "0px"],
    [/^text-align$/, "start"],
    [/^(top|right|bottom|left|inset)$|^(width|height)$|^z-index$/, "auto"],
    [/^(min-(width|height))$/, "0px"],
    [/^max-(width|height)$/, "none"],
];
export function resetValue(prop) {
    for (const [re, v] of RESETS)
        if (re.test(prop))
            return v;
    return null;
}
const BORDER_STYLES = new Set(["none", "hidden", "dotted", "dashed", "solid", "double", "groove", "ridge", "inset", "outset"]);
/**
 * `border-top: 2px solid X` followed by `border-top-color: Y` loses Y in Webflow (measured), so side
 * shorthands become longhands and the last declaration of each property wins.
 */
function expandBorders(rule) {
    rule.walkDecls(/^border(-top|-right|-bottom|-left)?$/, (d) => {
        const sides = d.prop === "border" ? ["top", "right", "bottom", "left"] : [d.prop.slice(7)];
        const parts = postcss.list.space(d.value);
        let width = "medium";
        let style = "none";
        const color = [];
        for (const p of parts) {
            if (BORDER_STYLES.has(p))
                style = p;
            else if (/^(-?[\d.]+[a-z%]*|thin|medium|thick)$/.test(p) && color.length === 0)
                width = p;
            else
                color.push(p);
        }
        for (const side of sides) {
            d.cloneBefore({ prop: `border-${side}-width`, value: width });
            d.cloneBefore({ prop: `border-${side}-style`, value: style });
            d.cloneBefore({ prop: `border-${side}-color`, value: color.join(" ") || "currentcolor" });
        }
        d.remove();
    });
    const seen = new Map();
    rule.walkDecls((d) => {
        seen.get(d.prop)?.remove();
        seen.set(d.prop, d);
    });
}
function planBlock(block, ctx, sent, states) {
    const focusable = focusableClasses(block.html);
    const root = postcss.parse(block.css);
    const mine = new Set();
    root.walkRules((rule) => {
        const parent = rule.parent;
        const media = parent && parent.type === "atrule" ? parent.params.trim() : null;
        const bp = media === null ? undefined : MEDIA[media]?.breakpoint;
        if (media !== null && !bp) {
            ctx.skipped.push({ kind: "media", detail: `@media ${media} ${rule.selector}` });
            rule.remove();
            return;
        }
        const m = rule.selector.trim().match(/^\.([\w-]+)(?::([\w-]+))?$/);
        if (!m) {
            ctx.skipped.push({ kind: "selector", detail: rule.selector });
            rule.remove();
            return;
        }
        const [, cls, state] = m;
        if (sent.has(cls)) {
            rule.remove();
            return;
        }
        mine.add(cls);
        expandBorders(rule);
        rule.walkDecls((d) => {
            if (/^(unset|initial|revert)$/.test(d.value.trim())) {
                const v = resetValue(d.prop);
                if (v === null) {
                    ctx.skipped.push({ kind: "property", detail: `${rule.selector} ${d.prop}: ${d.value}` });
                    d.remove();
                    return;
                }
                d.value = v;
            }
            if (UNSUPPORTED_PROPS.has(d.prop)) {
                ctx.skipped.push({ kind: "property", detail: `${rule.selector} ${d.prop}: ${d.value}` });
                d.remove();
                return;
            }
            d.value = rewriteValue(d.value, ctx);
        });
        if (state && !HTML_STATES.has(state)) {
            if (LATER_STATES.has(state) && (state !== "focus-visible" || focusable.has(cls))) {
                const properties = [];
                rule.walkDecls((d) => {
                    properties.push({ property_name: d.prop, property_value: d.value });
                });
                states.push({ style_name: cls, pseudo: state, ...(bp ? { breakpoint_id: bp } : {}), properties });
            }
            else
                ctx.skipped.push({ kind: "state-on-unfocusable", detail: rule.selector });
            rule.remove();
        }
    });
    root.walkAtRules("media", (at) => {
        if (!at.nodes?.length)
            at.remove();
        else
            at.params = MEDIA[at.params.trim()].query;
    });
    for (const c of mine)
        sent.add(c);
    return { css: root.toString().trim(), classes: [...mine] };
}
/** The whole push, in the order it has to run. */
export function planPush(result, options) {
    const prefix = options.variablePrefix ?? "uf-";
    const { steps, inlined } = planVariables(result.variables, prefix);
    const skipped = [];
    const known = new Set(result.variables.filter((v) => !(v.name in inlined)).map((v) => v.name));
    const values = Object.fromEntries(result.variables.map((v) => [v.name, v.value]));
    const ctx = { known, inlined, values, prefix, collection: options.collection, skipped };
    const sent = new Set(options.existingClasses ?? []);
    const states = [];
    const inserts = result.blocks.map((block) => {
        const { css, classes } = planBlock(block, ctx, sent, states);
        return { build_label: block.id, html: rewriteHtml(block.html.trim(), options.assetUrls ?? {}, skipped), css, classes };
    });
    // Webflow keeps only the first family of a font-family stack (measured: "Helvetica Now Text", Arial
    // became "Helvetica Now Text"), so a site without that font falls back to the browser default. A
    // font-family variable keeps the whole stack, so every literal stack becomes one.
    const stacks = new Map();
    for (const ins of inserts) {
        ins.css = ins.css.replace(/font-family:([^;}]+)/g, (m, value) => {
            const v = value.trim();
            if (v.startsWith("var(") || !v.includes(","))
                return m;
            let name = stacks.get(v);
            if (!name) {
                name = `${prefix}font-${slug(v.split(",")[0].replace(/["']/g, ""))}`;
                while ([...stacks.values()].includes(name))
                    name += "-2";
                stacks.set(v, name);
                steps.unshift({ action: "create_font_family_variable", variable_name: name, value: { static_value: v } });
            }
            return `font-family:var(--${name})`;
        });
    }
    const links = result.blocks.flatMap((b) => newTabLinks(b.id, b.html));
    return { collection: options.collection, variables: steps, inlined, inserts, states, newTabLinks: links, skipped };
}
/** Fill alias targets with the variable IDs Webflow returned for the variables made before them. */
export function resolveAliases(steps, idsByName) {
    return steps.map((s) => {
        if (!("alias_of" in s.value))
            return s;
        const id = idsByName[s.value.alias_of];
        if (!id)
            throw new Error(`no Webflow id yet for ${s.value.alias_of}`);
        return { ...s, value: { existing_variable_id: id } };
    });
}
export const chunk = (items, size) => Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, i * size + size));
export function scrollRevealInteraction(opts) {
    const inst = (id) => ({ extensionKey: "wf:inst", value: [opts.pageId, id] });
    return {
        name: opts.name,
        scope: { type: "pages", value: [opts.pageId] },
        conditionalPlayback: [{ type: "prefers-reduced-motion", behavior: "skip-to-end" }],
        triggers: [
            {
                extensionKey: "wf:scroll",
                config: { scrollTriggerConfig: { start: opts.start ?? "top center", end: opts.end ?? "bottom center", enter: "play", leave: "none", enterBack: "none", leaveBack: "reverse" } },
                target: inst(opts.triggerId),
            },
        ],
        timelines: [
            {
                actions: opts.reveals.map((r, i) => ({
                    id: `reveal-${i}`,
                    name: `Reveal ${i + 1}`,
                    tt: 2,
                    targets: [r.elementId, ...(r.extra ?? [])].map(inst),
                    timing: { duration: r.duration ?? 0.5, ease: 5, ...(r.stagger ? { stagger: { each: r.stagger } } : {}) },
                    properties: { "wf:transform": { opacity: ["0%", "100%"], y: [r.y ?? 20, 0] } },
                })),
            },
        ],
    };
}
