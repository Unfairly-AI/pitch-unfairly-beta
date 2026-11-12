import { describe, it } from "node:test";
import { expect } from "./webflow/expect.mjs";
import { compilePage } from "../bin/webflow/compile.mjs";
import { parseMedia } from "../bin/webflow/media.mjs";
import { parseSelector } from "../bin/webflow/selectors.mjs";
// A made-up vendor page (Northline), in the shape the sites engine builds.
const PAGE = `<!doctype html><html><head><style>
:root { --ink: #14213d; --accent: #e85d04; --pad: 24px; --font-display: "Sora", sans-serif; }
* { margin: 0; box-sizing: border-box; }
body { font-family: "DM Sans", sans-serif; color: var(--ink); line-height: 1.5; background: #fbf8f3; }
.tb-wrap { max-width: 1120px; margin: 0 auto; padding: 0 var(--pad); }
.lp-hero { padding: 96px 0; }
.lp-hero h1 { font-family: var(--font-display); font-size: clamp(36px, 5vw, 64px); }
.lp-hero .hl { color: var(--accent); }
.lp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 32px; }
.lp-card { --tone: #fff; background: var(--tone); padding: var(--pad); }
.lp-card.is-night { --tone: var(--ink); color: #fff; }
.lp-pill { background: var(--accent); color: #fff; border-radius: 999px; padding: 12px 20px; }
.lp-pill:hover { background: var(--ink); }
.lp-card:hover .lp-title { text-decoration: underline; }
.lp-tick::before { content: "✓"; color: var(--accent); margin-right: 8px; }
.js .reveal { opacity: 0; }
@media (max-width: 900px) { .lp-grid { grid-template-columns: 1fr; } }
@media (max-width: 380px) { .lp-hero { padding: 48px 0; } }
@media (min-width: 901px) { .lp-pill { padding: 14px 28px; } }
@media print { .lp-pill { display: none; } }
@media (prefers-reduced-motion: reduce) { * { transition: none; } }
@keyframes rise { from { opacity: 0; } }
</style></head><body>
<header class="top"><a href="/">Northline</a></header>
<main>
  <section id="hero" class="lp-hero">
    <div class="tb-wrap">
      <h1><span>Your technicians.</span> <span class="hl">Back on the road.</span></h1>
      <p class="lp-tick">Live by March</p>
      <a class="lp-pill" href="#next">Book a call</a>
      <p class="pdf-only">Call us.</p>
      <div class="lp-grid">
        <div class="lp-card"><h3 class="lp-title">Day</h3></div>
        <div class="lp-card is-night" style="--pad: 40px"><h3 class="lp-title">Night</h3></div>
      </div>
    </div>
  </section>
</main>
</body></html>`;
const result = compilePage(PAGE);
const block = result.blocks[0];
const entry = (cls, breakpoint = "main", state = "none") => result.styles.find((s) => s.className === cls && s.breakpoint === breakpoint && s.state === state)?.properties;
const classOfText = (text) => new RegExp(`class="([^"]+)"[^>]*>${text}<`).exec(block.html)?.[1];
describe("media snapping onto Webflow breakpoints", () => {
    it("snaps max-width up to the next Webflow max and min-width up to the next floor", () => {
        expect(parseMedia("(max-width: 900px)")).toMatchObject({ kind: "levels", levels: new Set(["medium", "small", "tiny"]) });
        expect(parseMedia("(max-width: 380px)")).toMatchObject({ levels: new Set(["tiny"]) });
        expect(parseMedia("(max-width: 720px)")).toMatchObject({ levels: new Set(["small", "tiny"]) });
        expect(parseMedia("(max-width: 600px)")).toMatchObject({ levels: new Set(["tiny"]) });
        expect(parseMedia("(max-width: 1100px)")).toMatchObject({ levels: new Set(["medium", "small", "tiny"]) });
        expect(parseMedia("(min-width: 901px)")).toMatchObject({ levels: new Set(["main"]) });
        expect(parseMedia("print")).toEqual({ kind: "drop", reason: "print" });
    });
});
describe("selector states", () => {
    it("keeps a state on the target and refuses one on an ancestor", () => {
        expect(parseSelector(".a:hover")).toMatchObject({ ok: true, state: "hover" });
        expect(parseSelector(".a::before")).toMatchObject({ ok: true, pseudoEl: "before" });
        expect(parseSelector(".card:hover .title")).toMatchObject({ ok: false, reason: "ancestor-state" });
    });
});
describe("compilePage", () => {
    it("takes main's children as blocks and leaves the site header out", () => {
        expect(result.blocks.map((b) => b.id)).toEqual(["hero"]);
        expect(block.html).not.toContain("Northline</a>");
    });
    it("gives every styled element exactly one prefixed class", () => {
        for (const m of block.html.matchAll(/class="([^"]+)"/g))
            expect(m[1]).toMatch(/^uf-[a-z0-9-]+$/);
    });
    it("flattens descendant selectors onto the element", () => {
        const hl = classOfText("Back on the road.");
        expect(entry(hl)).toMatchObject({ color: "var(--accent)" });
    });
    it("splits our media queries into Webflow breakpoints as diffs", () => {
        expect(entry("uf-grid")).toMatchObject({ display: "grid", "grid-template-columns": "repeat(2, minmax(0, 1fr))" });
        expect(entry("uf-grid", "medium")).toEqual({ "grid-template-columns": "1fr" });
        expect(entry("uf-grid", "small")).toBeUndefined();
        expect(entry("uf-hero", "tiny")).toEqual({ padding: "48px 0" });
    });
    it("reverts a desktop-only min-width rule below the base breakpoint", () => {
        expect(entry("uf-pill")).toMatchObject({ padding: "14px 28px" });
        expect(entry("uf-pill", "medium")).toEqual({ padding: "12px 20px" });
    });
    it("keeps hover on the element and reports a hover on an ancestor", () => {
        expect(entry("uf-pill", "main", "hover")).toEqual({ background: "var(--ink)" });
        expect(result.report.unsupported).toContainEqual({ selector: ".lp-card:hover .lp-title", reason: "ancestor-state" });
    });
    it("keeps global tokens as variables and resolves scoped ones", () => {
        expect(result.variables.map((v) => v.name)).toEqual(expect.arrayContaining(["accent", "ink", "font-display"]));
        expect(result.variables.find((v) => v.name === "accent")?.type).toBe("color");
        const cards = [...block.html.matchAll(/<div class="(uf-card[^"]*)"/g)].map((m) => m[1]);
        expect(cards).toHaveLength(2);
        expect(cards[0]).not.toBe(cards[1]);
        expect(entry(cards[0])).toMatchObject({ background: "#fff", padding: "var(--pad)" });
        expect(entry(cards[1])).toMatchObject({ background: "var(--ink)", padding: "40px" });
    });
    it("turns ::before into a real hidden span", () => {
        expect(block.html).toMatch(/<p class="uf-tick"><span aria-hidden="true" class="uf-tick-before">✓<\/span>Live by March<\/p>/);
        expect(entry("uf-tick-before")).toMatchObject({ color: "var(--accent)", "margin-right": "8px" });
    });
    it("drops print-only content, print and reduced-motion rules, and JS-gated motion", () => {
        expect(block.html).not.toContain("Call us.");
        expect(result.report.dropped["media:print"]).toBe(1);
        expect(result.report.dropped["media:reduced-motion"]).toBe(1);
        expect(result.css).not.toContain("opacity");
    });
    it("guards headings against Webflow's base tag styles and carries body typography to the block", () => {
        const h1 = /<h1 class="([^"]+)"/.exec(block.html)[1];
        // An inherited property is pinned to the value the element inherits, not the keyword.
        expect(entry(h1)).toMatchObject({ "line-height": "1.5", "font-weight": "bold", margin: "0" });
        expect(entry("uf-hero")).toMatchObject({ "font-family": '"DM Sans", sans-serif', "line-height": "1.5", "background-color": "#fbf8f3", "font-size": "16px" });
    });
    it("guards figcaption, small and strong against the rest of Webflow's base sheet", () => {
        const page = PAGE.replace("<main>", '<main><figure class="lp-fig"><blockquote class="lp-bq">Quote</blockquote><figcaption class="lp-cap">A <small class="lp-sm">note</small></figcaption></figure>');
        const out = compilePage(page);
        const props = (cls) => out.styles.find((s) => s.className === cls && s.breakpoint === "main")?.properties;
        // Webflow centres figcaption; ours inherits left alignment.
        expect(props("uf-cap")).toMatchObject({ "text-align": "start", margin: "0" });
        expect(props("uf-sm")).toMatchObject({ "font-size": "smaller" });
    });
    it("lets logical properties cover their physical sides, so tag guards never override them", () => {
        const page = PAGE.replace("<main>", '<main><ul class="lp-list" style="padding-inline: 64px"><li>One</li></ul>');
        const out = compilePage(page);
        const ul = out.styles.find((s) => s.className === "uf-list" && s.breakpoint === "main").properties;
        expect(ul["padding-inline"]).toBe("64px");
        expect(ul["padding-left"]).toBeUndefined();
    });
    it("emits Webflow-shaped CSS: only single classes and Webflow's own media queries", () => {
        const queries = new Set([...result.css.matchAll(/@media ([^{]+)\{/g)].map((m) => m[1]));
        for (const q of queries)
            expect(["(max-width: 991px)", "(max-width: 767px)", "(max-width: 479px)"]).toContain(q);
        for (const m of result.css.matchAll(/^([^@{}\n][^{]*)\{/gm))
            expect(m[1]).toMatch(/^\.uf-[a-z0-9-]+(:[a-z-]+|::placeholder)?$/);
    });
});
describe("wide-only media", () => {
    it("drops a min-width rule above Webflow's base floor instead of applying it to every desktop", () => {
        expect(parseMedia("screen and (min-width:1560px)")).toEqual({ kind: "drop", reason: "wide-only" });
        const page = PAGE.replace("</style>", "@media (min-width: 1560px) { .lp-hero { padding: 200px 0; } }</style>");
        expect(compilePage(page).styles.find((s) => s.className === "uf-hero" && s.breakpoint === "main")?.properties.padding).toBe("96px 0");
    });
});
