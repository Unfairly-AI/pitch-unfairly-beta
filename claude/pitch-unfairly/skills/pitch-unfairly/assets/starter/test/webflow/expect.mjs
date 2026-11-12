// The slice of vitest's expect() the Webflow tests use, on node:assert, so they run under node --test.
import assert from 'node:assert/strict';

const isPlain = (v) => v && typeof v === 'object' && !Array.isArray(v);
const ANY = Symbol('objectContaining');
const ARR = Symbol('arrayContaining');
function matches(actual, expected) {
  if (expected && expected[ARR]) return Array.isArray(actual) && expected.value.every((e) => actual.some((a) => matches(a, e) || deepEq(a, e)));
  if (expected && expected[ANY]) return isPlain(actual) && Object.entries(expected.value).every(([k, v]) => matches(actual[k], v));
  if (isPlain(expected)) return isPlain(actual) && Object.entries(expected).every(([k, v]) => matches(actual[k], v));
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((v, i) => matches(actual[i], v));
  return Object.is(actual, expected);
}
const deepEq = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch { return false; } };

function make(actual, negate) {
  const check = (ok, msg) => assert.ok(negate ? !ok : ok, `${negate ? 'not ' : ''}${msg}`);
  return {
    toBe: (e) => check(Object.is(actual, e), `expected ${JSON.stringify(actual)} to be ${JSON.stringify(e)}`),
    toEqual: (e) => check(deepEq(actual, e) || matches(actual, e), `expected ${JSON.stringify(actual)} to equal ${JSON.stringify(e)}`),
    toMatchObject: (e) => check(matches(actual, e), `expected ${JSON.stringify(actual)} to match ${JSON.stringify(e)}`),
    toContain: (e) => check(actual.includes(e), `expected ${JSON.stringify(actual)?.slice(0, 400)} to contain ${JSON.stringify(e)}`),
    toContainEqual: (e) => check(actual.some((x) => (e && e[ANY] ? matches(x, e) : deepEq(x, e))), `expected array to contain ${JSON.stringify(e)}`),
    toMatch: (re) => check(re.test(actual), `expected ${JSON.stringify(actual)?.slice(0, 200)} to match ${re}`),
    toHaveLength: (n) => check(actual.length === n, `expected length ${actual.length} to be ${n}`),
    toHaveProperty: (k) => check(actual != null && k in actual, `expected property ${k}`),
    toBeUndefined: () => check(actual === undefined, `expected ${JSON.stringify(actual)} to be undefined`),
    toBeLessThan: (n) => check(actual < n, `expected ${actual} < ${n}`),
    toThrow: (re) => {
      let err = null;
      try { actual(); } catch (e) { err = e; }
      check(err && (!re || re.test(err.message)), `expected to throw ${re ?? ''}`);
    },
  };
}
export function expect(actual) {
  const e = make(actual, false);
  e.not = make(actual, true);
  return e;
}
expect.objectContaining = (value) => ({ [ANY]: true, value });
expect.arrayContaining = (value) => ({ [ARR]: true, value });
