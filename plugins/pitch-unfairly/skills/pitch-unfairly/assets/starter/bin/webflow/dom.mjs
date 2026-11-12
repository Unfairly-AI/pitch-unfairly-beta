/**
 * A small mutable DOM over parse5's output, with the adapter css-select needs to match selectors
 * against it, and a serializer for the fragments we hand to Webflow.
 */
import { parse } from "parse5";
function convert(p, parent) {
    if (p.nodeName === "#text")
        return { type: "text", value: p.value ?? "", parent };
    if (!p.tagName)
        return null;
    const el = {
        type: "element",
        tag: p.tagName,
        attrs: (p.attrs ?? []).map((a) => [a.prefix ? `${a.prefix}:${a.name}` : a.name, a.value]),
        children: [],
        parent,
    };
    const kids = p.tagName === "template" ? p.content?.childNodes ?? [] : p.childNodes ?? [];
    for (const k of kids) {
        const c = convert(k, el);
        if (c)
            el.children.push(c);
    }
    return el;
}
/** Parse a full HTML document; returns its <html> element. */
export function parseDocument(html) {
    const doc = parse(html);
    const root = (doc.childNodes ?? []).find((n) => n.tagName === "html");
    if (!root)
        throw new Error("no <html> element");
    return convert(root, null);
}
export const getAttr = (el, name) => el.attrs.find(([n]) => n === name)?.[1];
export function setAttr(el, name, value) {
    const i = el.attrs.findIndex(([n]) => n === name);
    if (value === null) {
        if (i >= 0)
            el.attrs.splice(i, 1);
    }
    else if (i >= 0)
        el.attrs[i] = [name, value];
    else
        el.attrs.push([name, value]);
}
export const classes = (el) => (getAttr(el, "class") ?? "").split(/\s+/).filter(Boolean);
export const elements = (nodes) => nodes.filter((n) => n.type === "element");
export function* walk(el) {
    yield el;
    for (const c of elements(el.children))
        yield* walk(c);
}
export function find(root, test) {
    for (const el of walk(root))
        if (test(el))
            return el;
    return undefined;
}
export const textOf = (node) => (node.type === "text" ? node.value : node.children.map(textOf).join(""));
export const adapter = {
    isTag: (n) => n.type === "element",
    existsOne: (test, nodes) => elements(nodes).some((e) => test(e) || adapter.existsOne(test, e.children)),
    getAttributeValue: (el, name) => getAttr(el, name),
    getChildren: (n) => (n.type === "element" ? n.children : []),
    getName: (el) => el.tag,
    getParent: (n) => n.parent,
    getSiblings: (n) => (n.parent ? n.parent.children : [n]),
    getText: (n) => textOf(n),
    hasAttrib: (el, name) => el.attrs.some(([n]) => n === name),
    removeSubsets: (nodes) => nodes.filter((n, i) => {
        for (let p = n.parent; p; p = p.parent)
            if (nodes.includes(p))
                return false;
        return nodes.indexOf(n) === i;
    }),
    findAll: (test, nodes) => elements(nodes).flatMap((e) => [...walk(e)].filter(test)),
    findOne: (test, nodes) => {
        for (const e of elements(nodes)) {
            const hit = find(e, test);
            if (hit)
                return hit;
        }
        return null;
    },
    prevElementSibling: (el) => {
        const sibs = el.parent ? elements(el.parent.children) : [];
        const i = sibs.indexOf(el);
        return i > 0 ? sibs[i - 1] : null;
    },
};
const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const escText = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escAttr = (s) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
export function serialize(node) {
    if (node.type === "text")
        return escText(node.value);
    const attrs = node.attrs.map(([n, v]) => ` ${n}="${escAttr(v)}"`).join("");
    if (VOID.has(node.tag))
        return `<${node.tag}${attrs}>`;
    return `<${node.tag}${attrs}>${node.children.map(serialize).join("")}</${node.tag}>`;
}
