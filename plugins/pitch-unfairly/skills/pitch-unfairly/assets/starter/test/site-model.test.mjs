import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runModel, evaluate, format, parse } from '../bin/site/model.mjs';

// A fictional service plan's savings model, written as data: per-seat
// pricing with a step-up that has to be earned, and savings that grow as
// more of the team uses it.
export const PLAN = {
  inputs: {
    seats: 80, price1: 15, price2: 40,
    hourly: 52, hours_saved: 3.5, a1: 0.3, a2: 0.5, a3: 0.6, bonus: 6,
  },
  formulas: {
    fee1: 'seats * price1 * 12',
    fee_full: 'seats * price2 * 12',
    sav1: 'seats * a1 * hours_saved * hourly * 12',
    sav2: 'seats * a2 * hours_saved * hourly * 12',
    sav3: 'seats * a3 * hours_saved * hourly * 12 + bonus * seats * 12',
    fee2: 'if(sav1 >= fee1, fee_full, fee1)',
    fee3: 'fee_full',
    fees: 'fee1 + fee2 + fee3',
    savings: 'sav1 + sav2 + sav3',
    ret: 'savings / fees',
    net: 'savings - fees',
  },
  formats: { fee1: 'money', savings: 'money', ret: 'mult', net: 'money' },
};

test('ACCEPTANCE: a model written as formulas reproduces its published figures to the dollar', () => {
  const v = runModel(PLAN);
  assert.equal(v.fee1, 14400);
  // 80 seats × 30% using it × 3.5 hours × $52 × 12 months
  assert.equal(v.sav1, 52416);
  assert.equal(v.fee2, 38400, 'year one covered its fee, so the step-up is earned');
  assert.equal(v.savings, 52416 + 87360 + 110592);
  assert.equal(format(v.ret, 'mult'), '2.7×');
  assert.equal(format(v.net, 'money'), '$159,168');
});

test('overrides recompute everything downstream, including conditions', () => {
  const low = runModel(PLAN, { a1: 0.05 });
  assert.equal(low.fee2, low.fee1, 'year two stays at the early rate when year one does not cover the fee');
  assert.equal(runModel(PLAN, { seats: 100 }).fee1, 18000);
});

test('expressions: precedence, comparisons, lists, functions', () => {
  assert.equal(evaluate('2 + 3 * 4', {}), 14);
  assert.equal(evaluate('(2 + 3) * 4', {}), 20);
  assert.equal(evaluate('10 - 4 - 3', {}), 3);
  assert.equal(evaluate('xs[1] * 2', { xs: [1, 5] }), 10);
  assert.equal(evaluate('if(a > 2 && b < 1, 7, 9)', { a: 3, b: 0 }), 7);
  assert.equal(evaluate('round(2.345, 2)', {}), 2.35);
  assert.equal(evaluate('-a + max(1, 4)', { a: 2 }), 2);
});

test('a site file cannot run code: anything but the formula grammar is refused', () => {
  for (const bad of ['constructor', 'alert(1)', 'a.b', 'x = 1', '`x`', 'process.exit()']) {
    assert.throws(() => evaluate(bad, { a: 1 }), bad);
  }
  assert.throws(() => parse('1 +'));
});

test('formats', () => {
  assert.equal(format(31920, 'money'), '$31,920');
  assert.equal(format(-16275, 'money'), '−$16,275');
  assert.equal(format(31920, 'money_k'), '$32K');
  assert.equal(format(0.694, 'pct'), '69%');
  assert.equal(format(27.4, 'money_exact'), '$27.40', 'cents always print two digits');
  assert.equal(format(27, 'money_exact'), '$27');
  assert.equal(format(1541.5, 'money'), '$1,542');
  assert.equal(format(0.075, 'pct1'), '7.5%');
  assert.equal(format(0.132, 'pct1'), '13.2%');
});

test('ACCEPTANCE: a dated path places today from the viewer\'s clock', async () => {
  const { pathProgress } = await import('../bin/site/model.mjs');
  const path = ['2026-10-15', '2026-11-20', '2026-12-01', '2026-12-15', '2027-01-01'];
  assert.deepEqual(pathProgress(path, '2026-10-15'), { current: 0, progress: 0 });
  assert.deepEqual(pathProgress(path, '2026-10-16'), { current: 0, progress: 0.03 }, 'a day later, still the first step, the line a little past it');
  assert.deepEqual(pathProgress(path, '2026-11-26'), { current: 1, progress: 1.55 });
  assert.deepEqual(pathProgress(path, '2026-10-01'), { current: -1, progress: 0 }, 'before the path: no step is current');
  assert.deepEqual(pathProgress(path, '2027-03-01'), { current: 4, progress: 4 }, 'after it: the last step');
  assert.equal(pathProgress(['Nov 20'], '2026-11-20'), null);
});
