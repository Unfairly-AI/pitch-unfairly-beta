/**
 * CSS facts the compiler leans on: which shorthands reset which longhands, which properties inherit,
 * and what Webflow's own base stylesheet sets on bare tags that a browser would not.
 *
 * ASSUMPTION (not verified against a live site this session): WEBFLOW_TAG_DEFAULTS is Webflow's
 * long-standing webflow.css base (Arial 14/20 body, 38/44 h1 with 20/10 margins, p margin-bottom 10px…).
 * The spike must confirm it on a fresh site; the preview uses the same table so any gap shows up there.
 */
export const SHORTHANDS = {
    margin: ["margin-top", "margin-right", "margin-bottom", "margin-left", "margin-block", "margin-inline", "margin-block-start", "margin-block-end", "margin-inline-start", "margin-inline-end"],
    padding: ["padding-top", "padding-right", "padding-bottom", "padding-left", "padding-block", "padding-inline", "padding-block-start", "padding-block-end", "padding-inline-start", "padding-inline-end"],
    "margin-inline": ["margin-left", "margin-right", "margin-inline-start", "margin-inline-end"],
    "margin-block": ["margin-top", "margin-bottom", "margin-block-start", "margin-block-end"],
    "padding-inline": ["padding-left", "padding-right", "padding-inline-start", "padding-inline-end"],
    "padding-block": ["padding-top", "padding-bottom", "padding-block-start", "padding-block-end"],
    inset: ["top", "right", "bottom", "left", "inset-block", "inset-inline"],
    "inset-inline": ["left", "right"],
    "inset-block": ["top", "bottom"],
    border: ["border-width", "border-style", "border-color", "border-top", "border-right", "border-bottom", "border-left", "border-top-width", "border-right-width", "border-bottom-width", "border-left-width", "border-top-style", "border-right-style", "border-bottom-style", "border-left-style", "border-top-color", "border-right-color", "border-bottom-color", "border-left-color"],
    "border-radius": ["border-top-left-radius", "border-top-right-radius", "border-bottom-right-radius", "border-bottom-left-radius"],
    background: ["background-color", "background-image", "background-position", "background-size", "background-repeat", "background-attachment", "background-origin", "background-clip"],
    font: ["font-style", "font-variant", "font-weight", "font-stretch", "font-size", "line-height", "font-family"],
    flex: ["flex-grow", "flex-shrink", "flex-basis"],
    "flex-flow": ["flex-direction", "flex-wrap"],
    gap: ["row-gap", "column-gap", "grid-gap", "grid-row-gap", "grid-column-gap"],
    grid: ["grid-template-rows", "grid-template-columns", "grid-template-areas", "grid-auto-rows", "grid-auto-columns", "grid-auto-flow"],
    "grid-template": ["grid-template-rows", "grid-template-columns", "grid-template-areas"],
    "grid-area": ["grid-row", "grid-column", "grid-row-start", "grid-row-end", "grid-column-start", "grid-column-end"],
    "grid-row": ["grid-row-start", "grid-row-end"],
    "grid-column": ["grid-column-start", "grid-column-end"],
    "place-items": ["align-items", "justify-items"],
    "place-content": ["align-content", "justify-content"],
    "place-self": ["align-self", "justify-self"],
    overflow: ["overflow-x", "overflow-y"],
    outline: ["outline-width", "outline-style", "outline-color"],
    transition: ["transition-property", "transition-duration", "transition-timing-function", "transition-delay"],
    animation: ["animation-name", "animation-duration", "animation-timing-function", "animation-delay", "animation-iteration-count", "animation-direction", "animation-fill-mode", "animation-play-state"],
    "list-style": ["list-style-type", "list-style-position", "list-style-image"],
    "text-decoration": ["text-decoration-line", "text-decoration-style", "text-decoration-color", "text-decoration-thickness"],
    columns: ["column-width", "column-count"],
};
export const INHERITED = new Set([
    "color", "font", "font-family", "font-size", "font-style", "font-variant", "font-weight", "font-stretch",
    "font-feature-settings", "font-variant-numeric", "font-kerning", "line-height", "letter-spacing", "word-spacing",
    "text-align", "text-indent", "text-transform", "text-rendering", "white-space", "word-break", "overflow-wrap",
    "hyphens", "text-wrap", "text-wrap-style", "-webkit-font-smoothing", "-moz-osx-font-smoothing", "list-style",
    "list-style-type", "list-style-position", "cursor", "visibility", "quotes", "direction",
]);
/** Inherited typography a section root gets from our <body>, since Webflow's body is the site's. */
export const ROOT_INHERITED = [
    "color", "font-family", "font-size", "font-weight", "line-height", "letter-spacing", "font-feature-settings",
    "font-variant-numeric", "text-rendering", "-webkit-font-smoothing", "-moz-osx-font-smoothing",
];
/** What a block root falls back to when nothing above it sets an inherited property, but Webflow's body does. */
export const UA_ROOT = { "font-size": "16px", "line-height": "normal", color: "canvastext", "font-family": "serif", "font-weight": "400" };
/** Webflow base styles on bare tags (ASSUMPTION, see above). */
export const WEBFLOW_TAG_DEFAULTS = {
    body: { margin: "0", "font-family": "Arial, sans-serif", "font-size": "14px", "line-height": "20px", color: "#333", "background-color": "#fff" },
    h1: { "font-size": "38px", "line-height": "44px", "margin-top": "20px", "margin-bottom": "10px", "font-weight": "bold" },
    h2: { "font-size": "32px", "line-height": "36px", "margin-top": "20px", "margin-bottom": "10px", "font-weight": "bold" },
    h3: { "font-size": "24px", "line-height": "30px", "margin-top": "20px", "margin-bottom": "10px", "font-weight": "bold" },
    h4: { "font-size": "18px", "line-height": "24px", "margin-top": "10px", "margin-bottom": "10px", "font-weight": "bold" },
    h5: { "font-size": "14px", "line-height": "20px", "margin-top": "10px", "margin-bottom": "10px", "font-weight": "bold" },
    h6: { "font-size": "12px", "line-height": "18px", "margin-top": "10px", "margin-bottom": "10px", "font-weight": "bold" },
    p: { "margin-top": "0", "margin-bottom": "10px" },
    ul: { "margin-top": "0", "margin-bottom": "10px", "padding-left": "40px" },
    ol: { "margin-top": "0", "margin-bottom": "10px", "padding-left": "40px" },
    blockquote: { "margin-top": "0", "margin-bottom": "10px", "margin-left": "0", "margin-right": "0", "padding-top": "10px", "padding-bottom": "10px", "padding-left": "20px", "padding-right": "20px", "border-left-width": "5px", "border-left-style": "solid", "border-left-color": "#e2e2e2", "font-size": "18px", "line-height": "22px" },
    figure: { "margin-top": "0", "margin-bottom": "10px", "margin-left": "0", "margin-right": "0" },
    img: { "max-width": "100%", "vertical-align": "middle", display: "inline-block" },
    label: { display: "block", "margin-bottom": "5px", "font-weight": "bold" },
    // Read off a live site's published webflow.css (2026-11-05), beyond the long-standing table above.
    figcaption: { "text-align": "center", "margin-top": "5px" },
    small: { "font-size": "80%" },
    strong: { "font-weight": "bold" },
    b: { "font-weight": "bold" },
    sup: { "vertical-align": "baseline", "font-size": "75%", "line-height": "0", position: "relative", top: "-.5em" },
    sub: { "vertical-align": "baseline", "font-size": "75%", "line-height": "0", position: "relative", bottom: "-.25em" },
};
/** What a browser would compute for those same properties, which is what our build was designed on. */
export const UA_VALUES = {
    h1: { "font-size": "2em", "line-height": "inherit", "margin-top": "0.67em", "margin-bottom": "0.67em", "font-weight": "bold" },
    h2: { "font-size": "1.5em", "line-height": "inherit", "margin-top": "0.83em", "margin-bottom": "0.83em", "font-weight": "bold" },
    h3: { "font-size": "1.17em", "line-height": "inherit", "margin-top": "1em", "margin-bottom": "1em", "font-weight": "bold" },
    h4: { "font-size": "1em", "line-height": "inherit", "margin-top": "1.33em", "margin-bottom": "1.33em", "font-weight": "bold" },
    h5: { "font-size": "0.83em", "line-height": "inherit", "margin-top": "1.67em", "margin-bottom": "1.67em", "font-weight": "bold" },
    h6: { "font-size": "0.67em", "line-height": "inherit", "margin-top": "2.33em", "margin-bottom": "2.33em", "font-weight": "bold" },
    p: { "margin-top": "1em", "margin-bottom": "1em" },
    ul: { "margin-top": "1em", "margin-bottom": "1em", "padding-left": "40px" },
    ol: { "margin-top": "1em", "margin-bottom": "1em", "padding-left": "40px" },
    blockquote: { "margin-top": "1em", "margin-bottom": "1em", "margin-left": "40px", "margin-right": "40px", "padding-top": "0", "padding-bottom": "0", "padding-left": "0", "padding-right": "0", "border-left-width": "0", "border-left-style": "none", "border-left-color": "currentcolor", "font-size": "inherit", "line-height": "inherit" },
    figure: { "margin-top": "1em", "margin-bottom": "1em", "margin-left": "40px", "margin-right": "40px" },
    img: { "max-width": "none", "vertical-align": "baseline", display: "inline" },
    label: { display: "inline", "margin-bottom": "0", "font-weight": "inherit" },
    // "inherit" is resolved to the ancestor's value by the compiler.
    figcaption: { "text-align": "inherit", "margin-top": "0" },
    small: { "font-size": "smaller" },
    strong: { "font-weight": "bolder" },
    b: { "font-weight": "bolder" },
    sup: { "vertical-align": "super", "font-size": "smaller", "line-height": "inherit", position: "static", top: "auto" },
    sub: { "vertical-align": "sub", "font-size": "smaller", "line-height": "inherit", position: "static", bottom: "auto" },
};
/** Webflow's base stylesheet for the preview, so leaks show up before we touch a real site. */
export function webflowBaseCss() {
    const rules = Object.entries(WEBFLOW_TAG_DEFAULTS).map(([tag, decls]) => `${tag}{${Object.entries(decls).map(([p, v]) => `${p}:${v}`).join(";")}}`);
    return `html{height:100%}*{box-sizing:border-box}${rules.join("")}a{background-color:transparent}`;
}
