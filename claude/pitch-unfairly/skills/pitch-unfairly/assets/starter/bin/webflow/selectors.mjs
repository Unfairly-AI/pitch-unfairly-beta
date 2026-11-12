/**
 * Split one CSS selector into what css-select can match structurally and what Webflow models as a
 * state on a class: `:hover`, `:focus`… on the matched element, and `::before` / `::after`.
 *
 * Webflow states only exist on the element itself, so a state on an ancestor (`.card:hover .title`)
 * cannot be expressed and is reported instead of being approximated.
 */
import { parse, SelectorType } from "css-what";
export const STATES = ["hover", "focus", "focus-visible", "focus-within", "active", "visited"];
const IS_COMBINATOR = new Set(["descendant", "child", "sibling", "adjacent", "parent", "column-combinator"]);
const LEGACY_PSEUDO_ELEMENTS = new Set(["before", "after", "first-line", "first-letter"]);
function specificityOf(tokens) {
    const s = [0, 0, 0];
    for (const t of tokens) {
        if (t.type === "attribute") {
            if (t.name === "id" && t.action === "equals")
                s[0]++;
            else
                s[1]++;
        }
        else if (t.type === "pseudo") {
            if (t.name === "where")
                continue;
            if ((t.name === "is" || t.name === "not" || t.name === "has" || t.name === "matches") && Array.isArray(t.data)) {
                const inner = t.data.map(specificityOf).sort(compareSpecificity).at(-1) ?? [0, 0, 0];
                s[0] += inner[0];
                s[1] += inner[1];
                s[2] += inner[2];
            }
            else
                s[1]++;
        }
        else if (t.type === "tag" || t.type === "pseudo-element")
            s[2]++;
    }
    return s;
}
export function compareSpecificity(a, b) {
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}
/** One selector (no commas). */
export function parseSelector(text) {
    let parsed;
    try {
        parsed = parse(text);
    }
    catch {
        return { ok: false, reason: "unparseable", text };
    }
    if (parsed.length !== 1)
        return { ok: false, reason: "unparseable", text };
    const tokens = parsed[0];
    let lastCombinator = -1;
    tokens.forEach((t, i) => {
        if (IS_COMBINATOR.has(t.type))
            lastCombinator = i;
    });
    let state = "none";
    let pseudoEl = "none";
    const match = [];
    for (const [i, t] of tokens.entries()) {
        const onTarget = i > lastCombinator;
        if (t.type === "pseudo" && STATES.includes(t.name)) {
            if (!onTarget || state !== "none")
                return { ok: false, reason: "ancestor-state", text };
            state = t.name;
            continue;
        }
        const elName = t.type === "pseudo-element" ? t.name : t.type === "pseudo" && LEGACY_PSEUDO_ELEMENTS.has(t.name) ? t.name : null;
        if (elName) {
            if (elName === "before" || elName === "after")
                pseudoEl = elName;
            else if (elName === "placeholder")
                state = "placeholder";
            else
                return { ok: false, reason: "unsupported-pseudo", text };
            continue;
        }
        match.push(t);
    }
    // A selector that was only a pseudo (e.g. `:hover`) still needs something to match.
    if (match.length === 0 || IS_COMBINATOR.has(match[match.length - 1].type))
        match.push({ type: SelectorType.Universal, namespace: null });
    return { ok: true, match: [match], state, pseudoEl, specificity: specificityOf(tokens), text };
}
