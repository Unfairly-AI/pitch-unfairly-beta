/**
 * Webflow's breakpoint model, and how one of our media queries lands on it.
 *
 * Webflow is desktop-first with fixed breakpoints: the base style ("main") covers 992px and up, then
 * "medium" (768–991), "small" (480–767) and "tiny" (0–479) each override the one above. (Webflow's
 * tiny query is max-width 479px: measured on a published page, where 479px gets the tiny styles.) Our sites use
 * their own cutoffs (1100, 900, 720, 600, 380…), so every width query is snapped onto those four levels
 * and the move is recorded, never hidden.
 *
 * - `max-width: w` snaps to the NEAREST Webflow max (479 / 767 / 991); ties go up. Snapping always up
 *   was tried first and is wrong: a 600px phone rule then fires at 720 (measured on a customer landing page).
 *   A w at or above 992 can only become "medium", because Webflow's base level has no upper bound.
 * - `min-width: x` snaps UP to the smallest level floor (0 / 480 / 768 / 992) at or above x, so a
 *   desktop-only rule never reaches a level narrower than it was written for. Above 992 there is no
 *   level, so the rule is dropped and reported rather than applied to every desktop width.
 */
export const LEVELS = ["main", "medium", "small", "tiny"];
const LOWER = { main: 992, medium: 768, small: 480, tiny: 0 };
const UPPER = { main: Infinity, medium: 991, small: 767, tiny: 479 };
const MAX_SNAPS = [479, 767, 991];
const MIN_SNAPS = [0, 480, 768, 992];
export const LEVEL_MEDIA = {
    main: null,
    medium: "(max-width: 991px)",
    small: "(max-width: 767px)",
    tiny: "(max-width: 479px)",
};
const px = (value, unit) => (unit === "em" || unit === "rem" ? Number(value) * 16 : Number(value));
function single(query) {
    const q = query.trim().toLowerCase();
    if (/\bprint\b/.test(q) && !/\bscreen\b/.test(q))
        return { kind: "drop", reason: "print" };
    if (/prefers-reduced-motion\s*:\s*reduce/.test(q))
        return { kind: "drop", reason: "reduced-motion" };
    if (/hover\s*:\s*none|pointer\s*:\s*coarse|orientation|aspect-ratio|resolution|prefers-color-scheme|max-height|min-height/.test(q)) {
        return { kind: "drop", reason: "unsupported-media" };
    }
    let max = Infinity;
    let min = 0;
    const shifts = [];
    for (const m of q.matchAll(/max-width\s*:\s*([\d.]+)(px|em|rem)/g)) {
        const w = px(m[1], m[2]);
        const snapped = w >= 992 ? 991 : MAX_SNAPS.reduce((best, s) => (Math.abs(s - w) < Math.abs(best - w) || (Math.abs(s - w) === Math.abs(best - w) && s > best) ? s : best));
        if (snapped !== w)
            shifts.push({ query, written: w, snapped, kind: "max" });
        max = Math.min(max, snapped);
    }
    for (const m of q.matchAll(/min-width\s*:\s*([\d.]+)(px|em|rem)/g)) {
        const x = px(m[1], m[2]);
        // Above Webflow's base floor there is no level to land on (the optional 1280/1440/1920 breakpoints
        // are not modelled), and snapping down would apply a wide-screen rule to every desktop. Measured on
        // a source whose "max font size" cap at min-width 1560px overrode its fluid 1.11vw body text.
        if (x > 992)
            return { kind: "drop", reason: "wide-only" };
        const snapped = MIN_SNAPS.find((s) => s >= x) ?? 992;
        if (snapped !== x)
            shifts.push({ query, written: x, snapped, kind: "min" });
        min = Math.max(min, snapped);
    }
    const levels = new Set(LEVELS.filter((l) => UPPER[l] <= max && LOWER[l] >= min));
    return { kind: "levels", levels, shifts };
}
/** A whole `@media` prelude (comma-separated queries are a union). */
export function parseMedia(params) {
    const parts = params.split(",").map(single);
    const kept = parts.filter((p) => p.kind === "levels");
    if (kept.length === 0)
        return parts[0];
    const levels = new Set();
    for (const p of kept)
        for (const l of p.levels)
            levels.add(l);
    return { kind: "levels", levels, shifts: kept.flatMap((p) => p.shifts) };
}
/** Intersect nested `@media` blocks. */
export function intersect(a, b) {
    if (!a)
        return b;
    if (a.kind === "drop")
        return a;
    if (b.kind === "drop")
        return b;
    return { kind: "levels", levels: new Set([...a.levels].filter((l) => b.levels.has(l))), shifts: [...a.shifts, ...b.shifts] };
}
