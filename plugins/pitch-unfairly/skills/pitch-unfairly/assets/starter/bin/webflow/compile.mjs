/**
 * Compile a page the sites engine built into what Webflow can hold natively: one class per element,
 * styles split into Webflow's four breakpoints and its element states, brand tokens as variables, and
 * a report of everything that had to move or could not come across.
 *
 * Why flatten: Webflow has no descendant selectors and stacks classes as combos, so our cascade
 * (`.lp-hero .tb-for b`, media queries at our own widths, `::before` rules) is resolved here, per element,
 * the way a browser would at each Webflow breakpoint, then deduplicated into named classes.
 *
 * The static DOM (no `js` / `has-motion` classes) is our finished state by design, so matching on it gives
 * what a reader sees once motion has played. Motion and engine JS are left out of this pass.
 *
 * Pure: no I/O. See docs/plans/2026-11-05-webflow-prototype.md.
 */
import postcss from "postcss";
import { compile as compileSelector } from "css-select";
import { adapter, classes, elements, getAttr, parseDocument, serialize, setAttr, walk } from "./dom.mjs";
import { LEVEL_MEDIA, LEVELS, intersect, parseMedia } from "./media.mjs";
import { compareSpecificity, parseSelector } from "./selectors.mjs";
import { ROOT_INHERITED, SHORTHANDS, UA_ROOT, UA_VALUES, WEBFLOW_TAG_DEFAULTS } from "./defaults.mjs";
const DEFAULT_PREFIX = "uf";
const STRIP_PREFIXES = /^(tb|lp|uf)-/;
const DROP_TAGS = new Set(["script", "noscript", "style", "template", "link", "meta"]);
const COVERED_BY = new Map();
for (const [short, longs] of Object.entries(SHORTHANDS))
    for (const l of longs)
        COVERED_BY.set(l, [...(COVERED_BY.get(l) ?? []), short]);
const rank = (p) => (COVERED_BY.get(p)?.length ?? 0);
const covered = (m, p) => m.has(p) || (COVERED_BY.get(p) ?? []).some((s) => m.has(s));
function bump(r, key, n = 1) {
    r[key] = (r[key] ?? 0) + n;
}
/** `var(--x, fallback)` spans in a value, with balanced parentheses. */
function varSpans(value) {
    const out = [];
    let i = 0;
    while ((i = value.indexOf("var(", i)) !== -1) {
        let depth = 0;
        let j = i + 3;
        for (; j < value.length; j++) {
            if (value[j] === "(")
                depth++;
            else if (value[j] === ")" && --depth === 0)
                break;
        }
        const inner = value.slice(i + 4, j);
        const comma = inner.indexOf(",");
        out.push({
            start: i,
            end: j + 1,
            name: (comma === -1 ? inner : inner.slice(0, comma)).trim(),
            fallback: comma === -1 ? null : inner.slice(comma + 1).trim(),
        });
        i = j + 1;
    }
    return out;
}
function variableType(name, value) {
    const v = value.trim();
    if (/^#([0-9a-f]{3,8})$/i.test(v) || /^(rgb|rgba|hsl|hsla|oklch|oklab|color-mix)\(/i.test(v) || v === "transparent")
        return "color";
    if (/font|family|display|body|mono/i.test(name) && /[",]|serif|sans|mono/i.test(v))
        return "font-family";
    if (/^-?[\d.]+$/.test(v))
        return "number";
    if (/^(-?[\d.]+(px|rem|em|%|vw|vh|ch)|clamp\(|calc\(|min\(|max\()/.test(v))
        return "size";
    return "other";
}
function parseContent(value) {
    const v = value.trim();
    if (v === "none" || v === "normal")
        return null;
    const strings = [...v.matchAll(/"((?:[^"\\]|\\.)*)"|'((?:[^'\\]|\\.)*)'/g)];
    if (strings.length === 0)
        return "";
    return strings.map((m) => (m[1] ?? m[2]).replace(/\\(.)/g, "$1")).join("");
}
function overlay(base, add) {
    const out = new Map(base);
    for (const [p, v] of add) {
        if (v === "unset")
            out.delete(p);
        else {
            out.delete(p);
            out.set(p, v);
        }
    }
    return out;
}
/** What to emit so `base` becomes `full`. */
function diff(full, base) {
    const out = new Map();
    for (const [p, v] of full)
        if (base.get(p) !== v)
            out.set(p, v);
    for (const p of base.keys()) {
        if (full.has(p))
            continue;
        const shorts = (COVERED_BY.get(p) ?? []).filter((s) => full.has(s));
        if (shorts.length)
            for (const s of shorts)
                out.set(s, full.get(s));
        else
            out.set(p, "unset");
    }
    return out;
}
const ordered = (m) => [...m].sort((a, b) => rank(a[0]) - rank(b[0]));
export function compilePage(html, options = {}) {
    const prefix = options.prefix ?? DEFAULT_PREFIX;
    const doc = parseDocument(html);
    const report = {
        sourceCssChars: 0,
        outputCssChars: 0,
        blocks: 0,
        elements: 0,
        classes: 0,
        declarations: 0,
        dropped: {},
        mediaShifts: [],
        substitutedVars: {},
        pseudoElements: 0,
        hiddenRemoved: 0,
        leakGuards: 0,
        importantFlags: 0,
        pageBackground: null,
        unsupported: [],
    };
    // ---- 1. Rules -------------------------------------------------------------------------------
    const cssText = [...walk(doc)]
        .filter((el) => el.tag === "style")
        .map((el) => el.children.map((c) => (c.type === "text" ? c.value : "")).join(""))
        .join("\n");
    report.sourceCssChars = cssText.length;
    const root = postcss.parse(cssText);
    const rules = [];
    const fonts = [];
    const shiftCounts = new Map();
    let order = 0;
    const visit = (nodes, cond) => {
        for (const node of nodes) {
            if (node.type === "atrule") {
                const at = node;
                const name = at.name.toLowerCase();
                if (name === "media") {
                    const next = intersect(cond, parseMedia(at.params));
                    if (next.kind === "drop")
                        bump(report.dropped, `media:${next.reason}`, at.nodes?.length ?? 0);
                    else
                        visit(at.nodes ?? [], next);
                }
                else if (name === "font-face") {
                    const get = (p) => at.nodes?.find((d) => d.type === "decl" && d.prop === p);
                    const val = (p) => get(p)?.value ?? "";
                    fonts.push({
                        family: val("font-family").replace(/["']/g, "").trim(),
                        weight: val("font-weight") || "400",
                        style: val("font-style") || "normal",
                        src: [...val("src").matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]),
                        css: at.toString(),
                    });
                }
                else if (name === "keyframes" || name.endsWith("keyframes")) {
                    bump(report.dropped, "keyframes");
                }
                else if (name === "supports" || name === "layer") {
                    bump(report.dropped, `assumed:@${name}`);
                    visit(at.nodes ?? [], cond);
                }
                else {
                    bump(report.dropped, `at-rule:@${name}`);
                }
                continue;
            }
            if (node.type !== "rule")
                continue;
            const rule = node;
            const decls = [];
            for (const d of rule.nodes) {
                if (d.type !== "decl")
                    continue;
                decls.push({ prop: d.prop.toLowerCase().startsWith("--") ? d.prop : d.prop.toLowerCase(), value: d.value, important: d.important });
            }
            if (decls.length === 0)
                continue;
            const levels = cond && cond.kind === "levels" ? cond.levels : null;
            if (cond && cond.kind === "levels") {
                for (const s of cond.shifts) {
                    const key = `${s.query}|${s.kind}|${s.written}`;
                    const prev = shiftCounts.get(key);
                    if (prev)
                        prev.rules++;
                    else
                        shiftCounts.set(key, { ...s, rules: 1 });
                }
            }
            for (const sel of rule.selectors) {
                const parsed = parseSelector(sel);
                if (!parsed.ok) {
                    bump(report.dropped, `selector:${parsed.reason}`);
                    if (report.unsupported.length < 200)
                        report.unsupported.push({ selector: sel, reason: parsed.reason });
                    continue;
                }
                let test;
                try {
                    test = compileSelector(parsed.match, { adapter, xmlMode: false });
                }
                catch {
                    bump(report.dropped, "selector:unmatchable");
                    continue;
                }
                rules.push({ test, decls, levels, state: parsed.state, pseudoEl: parsed.pseudoEl, specificity: parsed.specificity, order: order++ });
            }
        }
    };
    visit(root.nodes, null);
    report.mediaShifts = [...shiftCounts.values()].map(({ query, written, snapped, kind, rules: n }) => ({ query, written, snapped, kind, rules: n }));
    // ---- 2. Blocks and matching ------------------------------------------------------------------
    const body = elements(doc.children).find((e) => e.tag === "body");
    if (!body)
        throw new Error("no <body>");
    const blockTest = options.blocks ? compileSelector(options.blocks, { adapter }) : null;
    const main = [...walk(body)].find((e) => e.tag === "main");
    const blockRoots = blockTest
        ? [...walk(body)].filter((e) => blockTest(e))
        : elements((main ?? body).children).filter((e) => !DROP_TAGS.has(e.tag));
    report.blocks = blockRoots.length;
    const inBlock = new Set();
    for (const b of blockRoots)
        for (const e of walk(b))
            inBlock.add(e);
    const needed = new Set(inBlock);
    for (const b of blockRoots)
        for (let p = b.parent; p; p = p.parent)
            needed.add(p);
    const matched = new Map();
    for (const el of needed) {
        const list = [];
        for (const r of rules)
            if (r.test(el))
                list.push(r);
        const inline = getAttr(el, "style");
        if (inline) {
            const decls = postcss.parse(`x{${inline}}`).first;
            list.push({
                decls: decls.nodes.filter((d) => d.type === "decl").map((d) => ({ prop: d.prop, value: d.value, important: d.important })),
                levels: null,
                state: "none",
                pseudoEl: "none",
                specificity: [9999, 0, 0],
                order: Number.MAX_SAFE_INTEGER,
            });
        }
        matched.set(el, list);
    }
    // ---- 3. Cascade ------------------------------------------------------------------------------
    const resolve = (el, level, state, pe) => {
        const list = (matched.get(el) ?? [])
            .filter((m) => (!m.levels || m.levels.has(level)) && m.pseudoEl === pe && (m.state === "none" || m.state === state))
            .flatMap((m) => m.decls.map((d) => ({ m, d })))
            .sort((a, b) => Number(a.d.important) - Number(b.d.important) ||
            compareSpecificity(a.m.specificity, b.m.specificity) ||
            Number(a.m.state !== "none") - Number(b.m.state !== "none") ||
            a.m.order - b.m.order);
        const out = new Map();
        for (const { d } of list) {
            for (const long of SHORTHANDS[d.prop] ?? [])
                out.delete(long);
            out.delete(d.prop);
            out.set(d.prop, d.value);
        }
        return out;
    };
    // Custom properties inherit; resolve each element's environment per level.
    const envCache = new Map();
    const env = (el, level) => {
        if (!el)
            return new Map();
        let byLevel = envCache.get(el);
        if (!byLevel)
            envCache.set(el, (byLevel = new Map()));
        const hit = byLevel.get(level);
        if (hit)
            return hit;
        const own = new Map([...resolve(el, level, "none", "none")].filter(([p]) => p.startsWith("--")));
        const out = overlay(env(el.parent, level), own);
        byLevel.set(level, out);
        return out;
    };
    const rootEnvs = LEVELS.map((l) => env(doc, l));
    const globals = new Map([...rootEnvs[0]].filter(([p, v]) => rootEnvs.every((e) => e.get(p) === v)));
    const usedVars = new Set();
    /** A kept token can alias others (`--deep: var(--c-periwinkle-deep)`); those must come along. */
    const markUsed = (name, depth = 0) => {
        if (usedVars.has(name) || depth > 8)
            return;
        usedVars.add(name);
        for (const s of varSpans(globals.get(name) ?? ""))
            if (globals.has(s.name))
                markUsed(s.name, depth + 1);
    };
    const resolveGlobal = (value, depth = 0) => depth > 8 ? value : varSpans(value).reduceRight((v, s) => v.slice(0, s.start) + resolveGlobal(globals.get(s.name) ?? s.fallback ?? "", depth + 1) + v.slice(s.end), value);
    const substitute = (value, scope, depth = 0) => {
        const spans = varSpans(value);
        if (spans.length === 0 || depth > 8)
            return value;
        let out = "";
        let at = 0;
        for (const s of spans) {
            out += value.slice(at, s.start);
            at = s.end;
            const v = scope.get(s.name);
            if (v !== undefined && globals.get(s.name) === v) {
                markUsed(s.name);
                out += `var(${s.name})`;
            }
            else if (v !== undefined) {
                bump(report.substitutedVars, s.name);
                out += substitute(v, scope, depth + 1);
            }
            else if (s.fallback !== null) {
                out += substitute(s.fallback, scope, depth + 1);
            }
            else {
                bump(report.dropped, "var:undefined");
                out += `var(${s.name})`;
            }
        }
        return out + value.slice(at);
    };
    const finalize = (el, raw, level, statePart) => {
        const scope = statePart ? overlay(env(el, level), new Map([...statePart].filter(([p]) => p.startsWith("--")))) : env(el, level);
        const out = new Map();
        for (const [p, v] of raw) {
            if (p.startsWith("--"))
                continue;
            // Webflow's base stylesheet already makes every element border-box.
            if (p === "box-sizing" && v === "border-box")
                continue;
            if (p === "animation" || p === "animation-name") {
                bump(report.dropped, "animation");
                continue;
            }
            out.set(p, substitute(v, scope));
        }
        return out;
    };
    const statesOf = (el, pe) => {
        const s = new Set(["none"]);
        for (const m of matched.get(el) ?? [])
            if (m.pseudoEl === pe && m.state !== "none")
                s.add(m.state);
        return [...s];
    };
    const fullStyle = (el, pe) => {
        const full = new Map();
        for (const level of LEVELS) {
            const byState = new Map();
            for (const state of statesOf(el, pe)) {
                const raw = resolve(el, level, state, pe);
                byState.set(state, finalize(el, raw, level, state === "none" ? null : raw));
            }
            full.set(level, byState);
        }
        return full;
    };
    // Typography a block root would inherit from our <body> (and anything between).
    const ancestorCache = new Map();
    const ancestorStyle = (p, level) => {
        let byLevel = ancestorCache.get(p);
        if (!byLevel)
            ancestorCache.set(p, (byLevel = new Map()));
        let hit = byLevel.get(level);
        if (!hit)
            byLevel.set(level, (hit = finalize(p, resolve(p, level, "none", "none"), level, null)));
        return hit;
    };
    const inheritedFor = (el, level, prop) => {
        for (let p = el.parent; p; p = p.parent) {
            const v = ancestorStyle(p, level).get(prop);
            if (v !== undefined && v !== "inherit")
                return v;
        }
        return null;
    };
    const styles = new Map();
    const created = [];
    const isRoot = new Set(blockRoots);
    const bodyBg = ancestorStyle(body, "main");
    report.pageBackground = bodyBg.get("background-color") ?? bodyBg.get("background") ?? null;
    for (const el of inBlock) {
        const full = fullStyle(el, "none");
        for (const level of LEVELS) {
            const none = full.get(level).get("none");
            const guard = UA_VALUES[el.tag];
            if (guard) {
                for (const p of Object.keys(WEBFLOW_TAG_DEFAULTS[el.tag] ?? {})) {
                    if (!covered(none, p) && guard[p] !== undefined) {
                        // An inherited property is pinned to what the element would inherit, since Webflow's tag
                        // rule would otherwise win over inheritance.
                        none.set(p, guard[p] === "inherit" ? inheritedFor(el, level, p) ?? UA_ROOT[p] ?? (p === "text-align" ? "start" : "inherit") : guard[p]);
                        if (level === "main")
                            report.leakGuards++;
                    }
                }
            }
            if (isRoot.has(el)) {
                for (const p of ROOT_INHERITED) {
                    if (covered(none, p))
                        continue;
                    const v = inheritedFor(el, level, p) ?? (WEBFLOW_TAG_DEFAULTS.body[p] !== undefined ? UA_ROOT[p] ?? null : null);
                    if (v !== null)
                        none.set(p, v);
                }
                if (report.pageBackground && !covered(none, "background-color"))
                    none.set("background-color", report.pageBackground);
            }
        }
        styles.set(el, full);
        // ::before / ::after become real, hidden-from-AT spans so Webflow can hold and edit them.
        for (const pe of ["before", "after"]) {
            if (!(matched.get(el) ?? []).some((m) => m.pseudoEl === pe))
                continue;
            const pf = fullStyle(el, pe);
            const content = pf.get("main").get("none").get("content");
            const text = content === undefined ? null : parseContent(content);
            if (text === null)
                continue;
            if (content && /attr\(|counter|url\(|quote/.test(content))
                bump(report.dropped, "pseudo:dynamic-content");
            if (pf.get("main").size > 1)
                bump(report.dropped, "pseudo:state");
            const span = { type: "element", tag: "span", attrs: [["aria-hidden", "true"]], children: text ? [{ type: "text", value: text, parent: null }] : [], parent: el };
            for (const c of span.children)
                c.parent = span;
            for (const level of LEVELS) {
                const byState = new Map();
                const none = new Map(pf.get(level).get("none"));
                const levelContent = none.get("content");
                none.delete("content");
                if (levelContent === undefined || parseContent(levelContent) === null)
                    none.set("display", "none");
                byState.set("none", none);
                pf.set(level, byState);
            }
            // Nothing to show and nothing to style (e.g. a bare `content: ""` reset): no span.
            if (!text && LEVELS.every((l) => [...pf.get(l).get("none")].every(([p, v]) => p === "display" && v === "none")))
                continue;
            styles.set(span, pf);
            created.push({ el: span, parent: el, where: pe });
            report.pseudoElements++;
        }
    }
    const emitFor = (full) => {
        const out = new Map();
        let effNone = new Map();
        const layers = new Map();
        for (const level of LEVELS) {
            const byState = new Map();
            const fullNone = full.get(level).get("none");
            const none = level === "main" ? new Map(fullNone) : diff(fullNone, effNone);
            effNone = overlay(effNone, none);
            byState.set("none", none);
            for (const [state, props] of full.get(level)) {
                if (state === "none")
                    continue;
                const prevLayer = layers.get(state) ?? new Map();
                const expected = overlay(effNone, prevLayer);
                const emit = new Map();
                for (const [p, v] of props)
                    if (expected.get(p) !== v)
                        emit.set(p, v);
                layers.set(state, overlay(prevLayer, emit));
                byState.set(state, emit);
            }
            out.set(level, byState);
        }
        return out;
    };
    const hiddenEverywhere = (full) => LEVELS.every((l) => full.get(l).get("none").get("display") === "none");
    // Drop print-only and always-hidden elements, then add the pseudo spans.
    const removed = new Set();
    for (const el of inBlock) {
        const pdfOnly = classes(el).includes("pdf-only") || el.attrs.some(([n]) => n === "data-pdf-only");
        if (DROP_TAGS.has(el.tag) || pdfOnly || hiddenEverywhere(styles.get(el))) {
            if (!isRoot.has(el)) {
                removed.add(el);
                if (!DROP_TAGS.has(el.tag))
                    report.hiddenRemoved++;
            }
        }
    }
    for (const el of removed)
        if (el.parent)
            el.parent.children = el.parent.children.filter((c) => c !== el);
    for (const { el, parent, where } of created) {
        if (where === "before")
            parent.children.unshift(el);
        else
            parent.children.push(el);
    }
    const bySignature = new Map();
    const nameUses = new Map();
    const classOf = new Map();
    const emittedOf = new Map();
    const blockOf = (el) => {
        let p = el;
        while (p && !isRoot.has(p))
            p = p.parent;
        return p ?? el;
    };
    const sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "") || "el";
    const live = [...blockRoots.flatMap((b) => [...walk(b)])];
    for (const el of live) {
        const full = styles.get(el);
        if (!full)
            continue;
        const emitted = emitFor(full);
        const signature = JSON.stringify(LEVELS.map((l) => [...emitted.get(l)].map(([s, p]) => [s, ordered(p)])));
        const empty = LEVELS.every((l) => [...emitted.get(l).values()].every((p) => p.size === 0));
        if (empty)
            continue;
        const made = created.find((c) => c.el === el) ?? null;
        const own = classes(el)[0];
        const blockName = sanitize(getAttr(blockOf(el), "id") ?? classes(blockOf(el))[0]?.replace(STRIP_PREFIXES, "") ?? "block");
        const base = made
            ? `${classOf.get(made.parent) ?? `${prefix}-${blockName}-${made.parent.tag}`}-${made.where}`
            : `${prefix}-${own ? sanitize(own.replace(STRIP_PREFIXES, "")) : `${blockName}-${el.tag}`}`;
        // Same name and same style share a class; a different style under the same name gets a suffix.
        const key = `${base}\u0000${signature}`;
        let name = bySignature.get(key);
        if (!name) {
            const n = (nameUses.get(base) ?? 0) + 1;
            nameUses.set(base, n);
            name = n === 1 ? base : `${base}-${n}`;
            bySignature.set(key, name);
            emittedOf.set(name, emitted);
        }
        classOf.set(el, name);
    }
    // ---- 5. Output ---------------------------------------------------------------------------------
    const assets = new Set();
    const styleEntries = [];
    const cssFor = (names) => {
        const byLevel = new Map(LEVELS.map((l) => [l, []]));
        for (const name of names) {
            const emitted = emittedOf.get(name);
            for (const level of LEVELS) {
                for (const [state, props] of emitted.get(level)) {
                    if (props.size === 0)
                        continue;
                    const sel = state === "none" ? `.${name}` : state === "placeholder" ? `.${name}::placeholder` : `.${name}:${state}`;
                    byLevel.get(level).push(`${sel}{${ordered(props).map(([p, v]) => `${p}:${v}`).join(";")}}`);
                }
            }
        }
        return LEVELS.map((l) => {
            const body = byLevel.get(l).join("\n");
            if (!body)
                return "";
            return LEVEL_MEDIA[l] ? `@media ${LEVEL_MEDIA[l]}{\n${body}\n}` : body;
        }).filter(Boolean).join("\n");
    };
    for (const [name, emitted] of emittedOf) {
        for (const level of LEVELS) {
            for (const [state, props] of emitted.get(level)) {
                if (props.size === 0)
                    continue;
                styleEntries.push({ className: name, breakpoint: level, state, properties: Object.fromEntries(ordered(props)) });
                report.declarations += props.size;
                for (const v of props.values())
                    for (const m of v.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g))
                        assets.add(m[1]);
            }
        }
    }
    const blocks = blockRoots.map((rootEl, i) => {
        const names = new Set();
        for (const el of walk(rootEl)) {
            report.elements++;
            const name = classOf.get(el);
            setAttr(el, "class", name ?? null);
            if (name)
                names.add(name);
            setAttr(el, "style", null);
            el.attrs = el.attrs.filter(([n]) => !n.startsWith("data-pdf"));
            for (const a of ["src", "poster"]) {
                const v = getAttr(el, a);
                if (v && !v.startsWith("data:"))
                    assets.add(v);
            }
            const srcset = getAttr(el, "srcset");
            if (srcset)
                for (const part of srcset.split(","))
                    assets.add(part.trim().split(/\s+/)[0]);
        }
        const list = [...names];
        return {
            id: getAttr(rootEl, "id") ?? (classes(rootEl)[0] ? sanitize(classes(rootEl)[0].replace(STRIP_PREFIXES, "")) : `block-${i + 1}`),
            tag: rootEl.tag,
            html: serialize(rootEl),
            css: cssFor(list),
            classes: list,
        };
    });
    for (const r of rules)
        for (const d of r.decls)
            if (d.important)
                report.importantFlags++;
    report.classes = emittedOf.size;
    const css = cssFor([...emittedOf.keys()]);
    report.outputCssChars = css.length;
    const variables = [...usedVars].sort().map((name) => {
        const value = globals.get(name);
        return { name: name.replace(/^--/, ""), type: variableType(name, resolveGlobal(value)), value };
    });
    return { blocks, styles: styleEntries, variables, fonts, assets: [...assets], css, report };
}
/** A standalone page of the compiled blocks over Webflow's base styles, to compare against our build. */
export function previewHtml(result, baseCss, baseHref = "") {
    const fontCss = result.fonts.map((f) => f.css).join("\n");
    const vars = result.variables.map((v) => `--${v.name}:${v.value}`).join(";");
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${baseHref ? `<base href="${baseHref}">` : ""}<style>${baseCss}</style><style>${fontCss}</style><style>:root{${vars}}</style><style>${result.css}</style></head>
<body>${result.blocks.map((b) => b.html).join("\n")}</body></html>`;
}
