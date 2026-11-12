import { describe, it } from "node:test";
import { expect } from "./webflow/expect.mjs";
import { chunk, guardTrailingSpace, newTabLinks, planPush, planVariables, resolveAliases, resolveColorMix, scrollRevealInteraction, unwrapBareSpans, variableCssName } from "../bin/webflow/plan.mjs";
const vars = [
    { name: "c-navy", type: "color", value: "#122048" },
    { name: "navy", type: "color", value: "var(--c-navy)" },
    { name: "ink", type: "color", value: "#0b0b0b" },
    { name: "gutter", type: "size", value: "clamp(20px, 5vw, 64px)" },
    { name: "wrap", type: "size", value: "1200px" },
    { name: "tracking", type: "size", value: "0em" },
    { name: "line", type: "number", value: "1.55" },
    { name: "font", type: "font-family", value: '"Northline Sans", sans-serif' },
    { name: "text", type: "other", value: "var(--font)" },
    { name: "tilt", type: "other", value: "-2.5deg" },
];
const block = (id, html, css) => ({ id, tag: "section", html, css, classes: [] });
describe("planVariables", () => {
    it("types every token Webflow can hold and inlines the rest", () => {
        const { steps, inlined } = planVariables(vars);
        expect(inlined).toEqual({ tilt: "-2.5deg" });
        const by = Object.fromEntries(steps.map((s) => [s.variable_name, s]));
        expect(by["uf-wrap"]).toMatchObject({ action: "create_size_variable", value: { static_value: { value: 1200, unit: "px" } } });
        expect(by["uf-gutter"].value).toEqual({ custom_value: "clamp(20px, 5vw, 64px)" });
        expect(by["uf-tracking"].value).toEqual({ static_value: { value: 0, unit: "em" } });
        expect(by["uf-line"]).toMatchObject({ action: "create_number_variable", value: { static_value: 1.55 } });
        // An untyped alias takes its target's type.
        expect(by["uf-text"]).toMatchObject({ action: "create_font_family_variable", value: { alias_of: "uf-font" } });
    });
    it("creates alias targets before aliases and fills in Webflow's ids", () => {
        const { steps } = planVariables(vars);
        const names = steps.map((s) => s.variable_name);
        expect(names.indexOf("uf-c-navy")).toBeLessThan(names.indexOf("uf-navy"));
        const resolved = resolveAliases(steps, { "uf-c-navy": "variable-1", "uf-font": "variable-2" });
        expect(resolved.find((s) => s.variable_name === "uf-navy")?.value).toEqual({ existing_variable_id: "variable-1" });
        expect(() => resolveAliases(steps, {})).toThrow(/no Webflow id/);
    });
});
describe("planPush", () => {
    const css = [
        ".nl-hero{background:var(--navy);color:var(--ink);transform:rotate(var(--tilt));-webkit-font-smoothing:antialiased}",
        ".nl-wrap{max-width:calc(var(--wrap) + 2 * var(--gutter));padding-inline:var(--gutter)}",
        ".nl-cta:hover{background:var(--ink)}",
        ".nl-cta:focus-visible{outline:2px solid var(--ink)}",
        ".nl-wrap:focus-visible{outline:2px solid var(--ink)}",
        "@media (max-width: 991px){.nl-wrap{padding-inline:16px}}",
        "@media (max-width: 479px){.nl-hero{padding:8px}}",
    ].join("\n");
    const html = '<section class="nl-hero"><div class="nl-wrap"><a class="nl-cta" href="https://example.com/start" target="_blank" rel="noopener">Start</a><img class="nl-img" src="assets/a.png" alt=""></div></section>';
    const plan = planPush({ blocks: [block("hero", html, css)], variables: vars }, { collection: "Unfairly Northline", assetUrls: { "assets/a.png": "https://s3.amazonaws.com/webflow-prod-assets/site/a.png" } });
    const out = plan.inserts[0].css;
    it("binds whole-value tokens by name and writes Webflow's CSS name inside expressions", () => {
        expect(out).toContain("background:var(--uf-navy)");
        expect(out).toContain(`max-width:calc(var(${variableCssName("Unfairly Northline", "uf-wrap")}) + 2 * var(--_unfairly-northline---uf-gutter))`);
        expect(out).toContain("padding-inline:var(--uf-gutter)");
        expect(out).toContain("transform:rotate(-2.5deg)");
    });
    it("writes only Webflow's own media queries and states", () => {
        expect(out).toContain("@media screen and (max-width: 991px)");
        expect(out).toContain("@media screen and (max-width: 479px)");
        expect(out).not.toMatch(/focus-visible/);
        expect(out).toContain(".nl-cta:hover");
        expect(plan.states).toEqual([
            { style_name: "nl-cta", pseudo: "focus-visible", properties: [{ property_name: "outline", property_value: "2px solid var(--_unfairly-northline---uf-ink)" }] },
        ]);
    });
    it("strips properties Webflow rejects and reports what it left out", () => {
        expect(out).not.toContain("font-smoothing");
        expect(plan.skipped.map((s) => s.kind).sort()).toEqual(["property", "state-on-unfocusable"]);
    });
    it("points images at the asset library and lists links that lose their new-tab target", () => {
        expect(plan.inserts[0].html).toContain('src="https://s3.amazonaws.com/webflow-prod-assets/site/a.png"');
        expect(plan.newTabLinks).toEqual([{ block: "hero", href: "https://example.com/start", text: "Start", rel: "noopener" }]);
        const missing = planPush({ blocks: [block("hero", html, "")], variables: [] }, { collection: "X" });
        expect(missing.skipped).toContainEqual(expect.objectContaining({ kind: "image" }));
    });
    it("sends each class's CSS once, and none for classes the site already has", () => {
        const shared = ".nl-wrap{padding:0}";
        const two = planPush({ blocks: [block("a", '<div class="nl-wrap"></div>', shared), block("b", '<div class="nl-wrap"></div>', shared)], variables: [] }, { collection: "X" });
        expect(two.inserts.map((i) => i.css)).toEqual([".nl-wrap{padding:0}", ""]);
        const rerun = planPush({ blocks: [block("a", '<div class="nl-wrap"></div>', shared)], variables: [] }, { collection: "X", existingClasses: ["nl-wrap"] });
        expect(rerun.inserts[0].css).toBe("");
    });
    it("rejects selectors the HTML builder cannot take instead of sending them", () => {
        const p = planPush({ blocks: [block("a", "<div></div>", ".a .b{color:red}\n@media (max-width: 720px){.a{color:red}}")], variables: [] }, { collection: "X" });
        expect(p.inserts[0].css).toBe("");
        expect(p.skipped.map((s) => s.kind).sort()).toEqual(["media", "selector"]);
    });
});
describe("values Webflow cannot hold as written", () => {
    it("writes an srgb color-mix of known colors as rgba", () => {
        expect(resolveColorMix("1px solid color-mix(in srgb, #0b0b0b 35%, transparent)")).toBe("1px solid rgba(11, 11, 11, 0.35)");
        expect(resolveColorMix("color-mix(in srgb, white, black)")).toBe("rgba(128, 128, 128, 1)");
        expect(resolveColorMix("color-mix(in oklch, red, blue)")).toBe("color-mix(in oklch, red, blue)");
    });
    it("resolves tokens inside color-mix and splits border shorthands so a later color wins", () => {
        const p = planPush({ blocks: [block("a", '<div class="nl-q"></div>', ".nl-q{border-top:1px solid color-mix(in srgb, var(--ink) 35%, transparent)}\n.nl-card{border-top:2px solid var(--ink);border-top-color:var(--navy)}")], variables: vars }, { collection: "X" });
        expect(p.inserts[0].css).toContain(".nl-q{border-top-width:1px;border-top-style:solid;border-top-color:rgba(11, 11, 11, 0.35)}");
        expect(p.inserts[0].css).toContain(".nl-card{border-top-width:2px;border-top-style:solid;border-top-color:var(--uf-navy)}");
    });
});
describe("html fixes", () => {
    it("keeps a space that ends an inline element's text", () => {
        expect(guardTrailingSpace('<li>A<span aria-hidden="true">, </span></li>')).toBe('<li>A<span aria-hidden="true">, ​</span></li>');
        // Whitespace between block tags is left alone, so no empty line boxes appear.
        expect(guardTrailingSpace("<p>x</p>\n  </div>")).toBe("<p>x</p>\n  </div>");
    });
    it("finds new-tab links", () => {
        expect(newTabLinks("b", '<a href="/x">x</a><a href="/y" target="_blank"><b>Go</b></a>')).toEqual([{ block: "b", href: "/y", text: "Go" }]);
    });
    it("splits inserts into calls of at most five", () => {
        expect(chunk([1, 2, 3, 4, 5, 6, 7], 5)).toEqual([[1, 2, 3, 4, 5], [6, 7]]);
    });
});
describe("scrollRevealInteraction", () => {
    const ix = scrollRevealInteraction({ name: "step 1", pageId: "page", triggerId: "step", reveals: [{ elementId: "bubble", y: 8, duration: 0.35 }, { elementId: "last", extra: ["cta"], stagger: 0.25 }] });
    it("puts the toggles flat on the scroll config so scrolling back reverses", () => {
        expect(ix.triggers[0].config.scrollTriggerConfig).toMatchObject({ start: "top center", enter: "play", leaveBack: "reverse" });
        expect(ix.triggers[0].config.scrollTriggerConfig).not.toHaveProperty("toggleActions");
        expect(ix.triggers[0].target).toEqual({ extensionKey: "wf:inst", value: ["page", "step"] });
    });
    it("reveals from a hidden start state and skips motion for reduced-motion visitors", () => {
        expect(ix.timelines[0].actions[0]).toMatchObject({ tt: 2, timing: { duration: 0.35, ease: 5 }, properties: { "wf:transform": { opacity: ["0%", "100%"], y: [8, 0] } } });
        expect(ix.timelines[0].actions[1].targets).toHaveLength(2);
        expect(ix.timelines[0].actions[1].timing).toMatchObject({ stagger: { each: 0.25 } });
        expect(ix.conditionalPlayback).toEqual([{ type: "prefers-reduced-motion", behavior: "skip-to-end" }]);
    });
});
describe("font stacks", () => {
    it("turns a literal font-family stack into a variable so Webflow keeps the fallbacks", () => {
        const p = planPush({ blocks: [block("a", '<p class="nl-p"></p>', '.nl-p{font-family:"Brand Sans",Helvetica,Arial,sans-serif}\n.nl-q{font-family:"Brand Sans",Helvetica,Arial,sans-serif}\n.nl-r{font-family:serif}')], variables: [] }, { collection: "X", variablePrefix: "op-" });
        expect(p.variables[0]).toEqual({ action: "create_font_family_variable", variable_name: "op-font-brand-sans", value: { static_value: '"Brand Sans",Helvetica,Arial,sans-serif' } });
        expect(p.variables).toHaveLength(1);
        expect(p.inserts[0].css).toContain(".nl-p{font-family:var(--op-font-brand-sans)}");
        expect(p.inserts[0].css).toContain(".nl-r{font-family:serif}");
    });
});
describe("reset keywords", () => {
    it("writes unset as the property's initial value, since Webflow drops the keyword", () => {
        const p = planPush({ blocks: [block("a", '<div class="nl-c"></div>', "@media (max-width: 991px){.nl-c{grid-column:unset;gap:unset;margin-top:unset;color:unset}}")], variables: [] }, { collection: "X" });
        expect(p.inserts[0].css).toContain(".nl-c{grid-column:auto;gap:0px;margin-top:0px}");
        expect(p.skipped).toContainEqual({ kind: "property", detail: ".nl-c color: unset" });
    });
});
describe("bare spans", () => {
    it("unwraps a span with no attributes, which Webflow turns into a placeholder inside <em>", () => {
        expect(unwrapBareSpans("<em>like this <span>today</span></em>")).toBe("<em>like this today</em>");
        expect(unwrapBareSpans('<span class="a">x</span><span aria-hidden="true">, </span>')).toBe('<span class="a">x</span><span aria-hidden="true">, </span>');
    });
});
