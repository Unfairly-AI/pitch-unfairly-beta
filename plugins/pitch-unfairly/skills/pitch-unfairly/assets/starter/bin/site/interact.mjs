// Checks that a built site's controls do what the page says they do, and that
// its PDF tells the same story without them. Each function takes a puppeteer
// Page already loaded at the built site and returns { errors, warnings }.
//
//   exerciseControls(page)    on the live page: every input moves an answer,
//                             the all-off state reads, reset returns, a preset
//                             clicked twice is the same as once, a "Calculate"
//                             computes, and CTAs and dates stay filled.
//   selectPdfState(page)      before the PDF transform: clicks the control a
//                             section names in data-pdf-state.
//   printStateProblems(page)  after the PDF transform, before page.pdf(): each
//                             page with controls shows a result, nothing says
//                             "move the slider", and the deck keeps a next step.
//
// Contracts a site can use (one line each in guide/sites.md):
//   data-date-out        an element that must always show a date or duration (never blank)
//   data-commitment      a term or date the offer commits to; must stay filled in every state
//   data-cta             a call to action; must stay filled in every state (already used by app.js)
//   data-pdf-state="id"  on a section: the PDF prints the state after clicking #id in it (a preset, tab or choice)
//   data-pdf-summary     a static, printed summary of an interactive section's result
//   data-pdf-contact     a printed contact or next step, when the CTA itself is web-only
//   data-pdf-interactive set by selectPdfState before export: "kept", or what export removes ("controls results")
//   data-preset-label    a label a preset owns (="<preset id>", or inside the button); it may not follow other inputs (E065)

const LIMITS = { sections: 40, inputs: 12, presets: 8, labels: 8, ms: 90_000 };

// Runs inside the page for one section. Self-contained: puppeteer serializes it.
async function probeSection(index, limits) {
  const errors = [];
  const warnings = [];
  const sec = document.querySelectorAll('[data-section]')[index];
  if (!sec) return { errors, warnings };
  const name = sec.dataset.section || sec.id || `section ${index + 1}`;
  const where = `section "${name}"`;
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  // After each event, wait the way the audit does, then for any rolling number to land.
  const settle = async () => {
    await pause(30);
    for (let t = 0; t < 50 && document.querySelector('[data-rolling]'); t++) await pause(30);
  };
  const shown = (el) => el.isConnected && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const visibleText = (el) => (shown(el) ? el.innerText.replace(/\s+/g, ' ').trim() : '');
  const label = (el) => (el.getAttribute('aria-label') || el.innerText || el.textContent || el.dataset.v || el.dataset.expr || el.tagName.toLowerCase()).replace(/\s+/g, ' ').trim().slice(0, 50);
  // Named by what they said at load, so an element that goes blank is still recognisable.
  const firstLabel = new Map();
  const describe = (el) => {
    if (el.dataset.v) return `{{${el.dataset.v}}}`;
    if (el.dataset.expr) return `{{= ${el.dataset.expr}}}`;
    return `<${el.tagName.toLowerCase()}> "${firstLabel.get(el) ?? label(el)}"`;
  };
  const NEG = /(?<![\w.,])[-−–]\s?\d[\d.,]*\s*(?:business\s+)?(?:days?|weeks?|months?|quarters?|years?|yrs?|hours?|hrs?|minutes?|mins?)\b/i;
  // A sentence cut short by a missing value: "starting on .", "by ,", or a line that ends on "by".
  const FRAGMENT = /\b(?:on|by|in|at|from|of|for|to|until|before|after|starting|from|the|a|an|and|or|with|is|are|of)\s*(?:[.,;:)]|$)/i;
  const blockOf = (el) => el.closest('p, li, h1, h2, h3, h4, dd, dt, td, figcaption, label, div') || el;
  const blockText = (el) => (shown(blockOf(el)) ? blockOf(el).innerText.replace(/\s+/g, ' ').trim() : '');

  const model = JSON.parse(document.getElementById('site-model')?.textContent || '{}');
  const base = model.inputs || {};
  const results = [...sec.querySelectorAll('[data-v], [data-expr], [data-values]')];
  const snap = () => results.map((el) => el.textContent);
  const before = snap();
  const inputs = [...sec.querySelectorAll('input[data-input]')].filter((i) => i.type === 'range' || i.type === 'number').slice(0, limits.inputs);
  const original = new Map(inputs.map((i) => [i, i.value]));
  const setInput = async (inp, v) => {
    inp.value = String(v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
  };
  const lowest = (inp) => (inp.min !== '' ? Number(inp.min) : 0);
  // The values an input is tried at: a slider's ends; a number's lowest and a real step up.
  const tryValues = (inp) => {
    if (inp.type === 'range') return [inp.min !== '' ? inp.min : 0, inp.max !== '' ? inp.max : 100];
    const v = Number(inp.value) || 0;
    const step = Math.max(Number(inp.step) || 1, Math.abs(v) >= 10 ? Math.round(Math.abs(v) / 2) : 10);
    return [lowest(inp), inp.max !== '' ? Math.min(Number(inp.max), v + step) : v + step];
  };

  // Downstream: CTAs, and dates and commitments built from live figures, stay filled.
  const tokens = (el) => el.querySelector('[data-v], [data-expr]') || el.matches('[data-v], [data-expr]');
  const downstream = [...sec.querySelectorAll('[data-cta], [data-date-out], [data-date], [data-date-label], [data-commitment]')]
    .filter((el) => el.matches('[data-cta], [data-date-out]') || tokens(el))
    .filter((el) => visibleText(el));
  downstream.forEach((el) => firstLabel.set(el, label(el)));
  const fragAtLoad = new Map(downstream.map((el) => [el, FRAGMENT.test(visibleText(el))]));
  const reported = new Set();
  const whatIs = (el) => (el.matches('[data-cta]') ? 'the call to action' : el.matches('[data-commitment]') ? 'the commitment' : el.matches('[data-v], [data-expr]') ? 'the figure' : 'the date');
  const checkDownstream = (state) => {
    for (const el of downstream) {
      if (reported.has(el)) continue;
      const t = visibleText(el);
      if (t && (fragAtLoad.get(el) || !FRAGMENT.test(t))) continue;
      reported.add(el);
      errors.push(`${where}: ${whatIs(el)} ${describe(el)} ${t ? `reads as a broken sentence ("${t.slice(-60)}")` : 'goes blank'} ${state}. Write a sentence for that state.`);
    }
  };

  // Everything in OTHER sections that follows the model: a planner here can blank a
  // timeline or a close there (E053). Watched from its state at load.
  const others = [...document.querySelectorAll('[data-cta], [data-date], [data-date-out], [data-date-label], [data-commitment], [data-v], [data-expr]')]
    // Every marked date and commitment is watched, live figures or not: one inside a
    // data-when that a control switches off disappears just the same.
    .filter((el) => !sec.contains(el) && el.closest('[data-section]') && visibleText(el));
  const otherStart = new Map(others.map((el) => {
    firstLabel.set(el, label(el));
    return [el, { neg: NEG.test(blockText(el)), frag: FRAGMENT.test(visibleText(el)) || FRAGMENT.test(blockText(el)) }];
  }));
  const checkOthers = (state) => {
    for (const el of others) {
      if (reported.has(el)) continue;
      const there = `section "${el.closest('[data-section]').dataset.section || el.closest('[data-section]').id}"`;
      const figure = el.matches('[data-v], [data-expr]') && !el.matches('[data-cta], [data-date], [data-date-out], [data-date-label], [data-commitment]');
      // A figure hidden on purpose (data-when) is fine; a date, CTA or commitment that disappears is not.
      if (figure && !shown(el)) continue;
      const t = visibleText(el);
      const start = otherStart.get(el);
      let problem = null;
      if (!t) problem = 'goes blank';
      else if (/NaN|undefined|Infinity|∞/.test(t)) problem = `shows "${t}"`;
      else if (!start.neg && NEG.test(blockText(el))) problem = `shows a negative duration ("${blockText(el).match(NEG)[0]}")`;
      else if (!start.frag && (FRAGMENT.test(t) || FRAGMENT.test(blockText(el)))) problem = `reads as a broken sentence ("${(FRAGMENT.test(t) ? t : blockText(el)).slice(-60)}")`;
      if (!problem) continue;
      reported.add(el);
      errors.push(`${there}: ${whatIs(el)} ${describe(el)} ${problem} when ${where} is worked (${state}). Write a sentence for that state.`);
    }
  };
  // Broken figures: empty, NaN, a negative duration.
  const checkFigures = (state) => {
    for (const el of results) {
      if (!shown(el)) continue;
      const t = el.textContent.trim();
      if (!t) errors.push(`${where}: ${describe(el)} is empty ${state}.`);
      else if (/NaN|undefined|Infinity|∞/.test(t)) errors.push(`${where}: ${describe(el)} shows "${t}" ${state}.`);
      const neg = blockText(el).match(NEG);
      if (neg) errors.push(`${where}: "${neg[0]}" is a negative duration ${state}. Floor it at zero or say what happens instead.`);
    }
  };

  // The state a section starts in, so the zero state can be undone through its own controls.
  const sameSet = (set) => Object.entries(set).every(([k, v]) => base[k] === v);
  const choiceGroups = [...sec.querySelectorAll('[data-choice]')].map((g) => {
    const buttons = [...g.querySelectorAll('button[data-set]')];
    const parse = (b) => { try { return JSON.parse(b.dataset.set); } catch { return {}; } };
    const home = buttons.find((b) => sameSet(parse(b))) || null;
    // "Off": the button whose values are all zero, else the one with the smallest.
    const total = (b) => Object.values(parse(b)).reduce((a, v) => a + (Number(v) || 0), 0);
    const off = buttons.slice().sort((a, b) => total(a) - total(b))[0];
    return { home, off };
  });
  const toggleGroups = [...sec.querySelectorAll('[data-toggle]')].map((g) => {
    const buttons = [...g.querySelectorAll('button[data-i]')];
    const vals = [...g.querySelectorAll('[data-values]')];
    const home = buttons.find((b) => b.classList.contains('is-on') || b.getAttribute('aria-pressed') === 'true') ||
      buttons.find((b) => vals.length && vals.every((el) => { try { return String(JSON.parse(el.dataset.values)[Number(b.dataset.i)]) === el.textContent; } catch { return false; } })) || null;
    const off = buttons.find((b) => /^(off|none|no|without|0)\b/i.test(label(b))) || buttons.find((b) => b.dataset.i === '0') || buttons[0];
    return { home, off };
  });
  let restorable = true;
  for (const inp of inputs) {
    const k = inp.dataset.input;
    if (k in base && Number(inp.value) !== base[k]) {
      restorable = false;
      warnings.push(`${where}: the input "${k}" shows ${inp.value} but the model starts at ${base[k]}, so a reader can't get back to the opening figures (set its value${inp.type === 'range' ? ' and step' : ''} so the default lands on it).`);
    }
  }
  for (const g of [...choiceGroups, ...toggleGroups]) if (g.off && !g.home) restorable = false;

  // 1. Every input moves an answer (Rule 10). Its own echo ({{name}}) doesn't count.
  for (const inp of inputs) {
    const k = inp.dataset.input;
    const own = (el) => el.dataset.v === k || (el.dataset.expr || '').trim() === k;
    const tries = tryValues(inp);
    let moved = false;
    for (const v of tries) {
      await setInput(inp, v);
      const now = snap();
      if (results.some((el, i) => !own(el) && now[i] !== before[i])) moved = true;
      checkFigures(`with "${k}" at ${v}`);
      checkDownstream(`with "${k}" at ${v}`);
      checkOthers(`with "${k}" at ${v}`);
      await setInput(inp, original.get(inp));
      if (moved) break;
    }
    if (!moved) errors.push(`${where}: the input "${k}" moves nothing on the page. Make the answer depend on it, or remove it.`);
  }

  // 2. Zero / all-off: every input at its lowest, every toggle and choice off.
  const offs = [...choiceGroups, ...toggleGroups].map((g) => g.off).filter(Boolean);
  if (inputs.length || offs.length) {
    try {
      const { runModel } = await import(new URL('js/model.mjs', document.baseURI).href);
      const zero = Object.fromEntries(inputs.map((i) => [i.dataset.input, lowest(i)]));
      for (const b of offs) if (b.dataset.set) Object.assign(zero, JSON.parse(b.dataset.set));
      try { runModel(model, zero); } catch (e) {
        errors.push(`${where}: with every input at its lowest the model can't compute (${e.message}), so the page keeps showing the last figures. Guard the formula (max(1, …)) or raise the input's min.`);
      }
    } catch {}
    for (const inp of inputs) await setInput(inp, lowest(inp));
    for (const b of offs) { b.click(); await settle(); }
    checkFigures('with every input at its lowest and every toggle off');
    checkDownstream('with every input at its lowest and every toggle off');
    checkOthers('with every input at its lowest and every toggle off');

    // 3. Reset: the section's own controls bring back every opening figure exactly.
    if (restorable) {
      for (const inp of inputs) await setInput(inp, original.get(inp));
      for (const g of [...choiceGroups, ...toggleGroups]) if (g.home) { g.home.click(); await settle(); }
      const after = snap();
      results.forEach((el, i) => {
        if (after[i] !== before[i]) errors.push(`${where}: after putting every input back, ${describe(el)} shows "${after[i].trim()}" instead of "${before[i].trim()}". A reset has to return the opening figures.`);
      });
    }
  }

  // 4. A preset clicked twice gives the same page as clicked once (E065).
  for (const b of [...sec.querySelectorAll('[data-preset]')].slice(0, limits.presets)) {
    b.click();
    await settle();
    const once = sec.innerText;
    b.click();
    await settle();
    const twice = sec.innerText;
    if (once !== twice) {
      const a = once.split('\n'), c = twice.split('\n');
      const i = a.findIndex((line, n) => line !== c[n]);
      errors.push(`${where}: the preset "${label(b)}" gives a different page on its second click ("${(a[i] ?? '').trim().slice(0, 60)}" becomes "${(c[i] ?? '').trim().slice(0, 60)}"). A preset sets a state; it never adds to the last one.`);
    }
    checkFigures(`after the preset "${label(b)}"`);
    checkDownstream(`after the preset "${label(b)}"`);
    checkOthers(`after the preset "${label(b)}"`);

    // E065: what a preset labels as its own ("Half Forrester's rates: $X") comes from the
    // preset alone. Edit an input the preset doesn't set, click it again: the label holds.
    // Opt-in: [data-preset-label="<preset id>"], or [data-preset-label] inside the button,
    // or anywhere in a section with one preset.
    const presets = sec.querySelectorAll('[data-preset]');
    const labels = [...sec.querySelectorAll('[data-preset-label]')].filter((el) =>
      (b.id && el.dataset.presetLabel === b.id) || (!el.dataset.presetLabel && (b.contains(el) || presets.length === 1)));
    if (!labels.length) continue;
    let keys = [];
    try { keys = Object.keys(JSON.parse(b.dataset.preset)); } catch {}
    const read = () => labels.map((el) => el.innerText.replace(/\s+/g, ' ').trim());
    const held = read();
    for (const inp of inputs.filter((i) => !keys.includes(i.dataset.input)).slice(0, 4)) {
      await setInput(inp, tryValues(inp)[1]);
      b.click();
      await settle();
      const now = read();
      await setInput(inp, original.get(inp));
      b.click();
      await settle();
      const i = now.findIndex((t, n) => t !== held[n]);
      if (i < 0) continue;
      errors.push(`${where}: the preset "${label(b)}" labels "${held[i].slice(0, 60)}" as its own, but it becomes "${now[i].slice(0, 60)}" when "${inp.dataset.input}" changes, which the preset doesn't set (E065). Work the preset's figure from its own baseline, or label it as a share of the reader's figures.`);
      break;
    }
  }

  // 5. A label that promises a computation computes something.
  const promise = /^(run|calculate|compute|estimate|get (?:my |your |the )?results?)\b/i;
  const clickables = [...sec.querySelectorAll('a[href], button, [role="button"]')]
    .filter((el) => !el.matches('[role="tab"]') && shown(el) && promise.test(label(el)))
    .slice(0, limits.labels);
  const everyFigure = () => [...document.querySelectorAll('[data-v], [data-expr], [data-values]')].map((el) => el.textContent).join('\u0001');
  for (const el of clickables) {
    const href = el.getAttribute('href');
    const was = everyFigure();
    if (!(href && !href.startsWith('#'))) { el.click(); await settle(); }
    if (everyFigure() === was) errors.push(`${where}: "${label(el)}" doesn't compute anything; say where it goes ("See the numbers").`);
  }
  return { errors, warnings, restorable };
}

/** Work every control on the live page and assert what it changes. */
export async function exerciseControls(page) {
  const errors = [];
  const warnings = [];
  const started = Date.now();
  const url = page.url();
  // Keep the page where it is: links and forms don't leave it while controls are worked.
  const arm = () => page.evaluate(() => {
    if (window.__interactArmed) return;
    window.__interactArmed = true;
    addEventListener('click', (e) => e.target.closest?.('a[href]') && e.preventDefault(), true);
    addEventListener('submit', (e) => e.preventDefault(), true);
  });
  const total = await page.$$eval('[data-section]', (s) => s.length);
  const n = Math.min(total, LIMITS.sections);
  if (total > n) warnings.push(`controls: only the first ${n} of ${total} sections were worked.`);
  for (let i = 0; i < n; i++) {
    if (Date.now() - started > LIMITS.ms) {
      warnings.push(`controls: stopped after ${i} sections (${LIMITS.ms / 1000}s budget).`);
      break;
    }
    const busy = await page.$$eval('[data-section]', (s, i) => !!s[i]?.querySelector('input[data-input], [data-preset], [data-toggle], [data-choice], a[href], button, [role="button"]'), i);
    if (!busy) continue;
    await arm();
    const r = await page.evaluate(probeSection, i, LIMITS);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    // One model drives the whole page, so each section starts from a fresh load.
    await page.goto(url, { waitUntil: 'networkidle0' });
  }
  return { errors: [...new Set(errors)], warnings: [...new Set(warnings)] };
}

/** Before the PDF transform: apply each section's data-pdf-state (the id of a preset, tab or choice to click). */
export async function selectPdfState(page) {
  return page.evaluate(async () => {
    const errors = [];
    const warnings = [];
    const pause = (ms) => new Promise((r) => setTimeout(r, ms));
    // Record each interactive section's contract while its web-only parts still exist:
    // data-pdf-interactive="kept", or names what export removes ("controls", "results").
    const CONTROLS = 'input[data-input], [role="tab"], [data-preset], [data-toggle], [data-choice]';
    for (const sec of document.querySelectorAll('[data-section]')) {
      const controls = [...sec.querySelectorAll(CONTROLS)];
      if (!controls.length) continue;
      const results = [...sec.querySelectorAll('[data-v], [data-expr]')];
      const gone = (els) => !els.length || els.every((el) => el.closest('[data-pdf-hide]'));
      const removed = [gone(controls) && 'controls', gone(results) && 'results'].filter(Boolean);
      sec.dataset.pdfInteractive = removed.join(' ') || 'kept';
    }
    for (const sec of document.querySelectorAll('[data-section][data-pdf-state]')) {
      const id = sec.dataset.pdfState;
      const name = sec.dataset.section || sec.id;
      const el = sec.querySelector(`#${CSS.escape(id)}`);
      if (!el) {
        errors.push(`section "${name}": data-pdf-state="${id}" names no element with that id in the section. Give the preset to print id="${id}".`);
        continue;
      }
      if (!el.matches('[data-preset], [role="tab"], [data-choice] button, [data-toggle] button')) warnings.push(`section "${name}": data-pdf-state="${id}" is not a preset, tab or choice; it was clicked anyway.`);
      el.click();
      await pause(30);
      for (let t = 0; t < 50 && document.querySelector('[data-rolling]'); t++) await pause(30);
    }
    return { errors, warnings };
  });
}

/** After the PDF transform (.pdf-page elements), before page.pdf(): the printed pages stand without their controls. */
export async function printStateProblems(page) {
  return page.evaluate(() => {
    const errors = [];
    const warnings = [];
    // Printed means on the page: laid out, not hidden, not transparent, not clipped
    // away like .sr-only, at least 2px each way, with no ancestor doing any of that.
    const shown = (el) => {
      if (!el.isConnected || !el.getClientRects().length) return false;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
        const cs = getComputedStyle(n);
        if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) return false;
        if (/rect\(0(?:px)?,? 0(?:px)?,? 0(?:px)?,? 0(?:px)?\)/.test(cs.clip) || /inset\(50%\)/.test(cs.clipPath)) return false;
      }
      return true;
    };
    const text = (el) => (shown(el) ? el.innerText.replace(/\s+/g, ' ').trim() : '');
    const WEB_ONLY = [
      /\b(?:move|drag|slide|adjust|use|pull|nudge)\s+(?:the|a|this|each|any)\s+(?:sliders?|handles?|toggles?|switch(?:es)?|dials?)\b/i,
      /\b(?:click|tap)\s+(?:here|on|the|a|an|to|any|each|it|this|below)\b/i,
      /\btry\s+chang\w*/i,
      /\buse\s+the\s+(?:toggle|tabs|buttons|calculator|controls)\b/i,
      /\bhover\s+(?:over|on)\b/i,
    ];
    let excludes = {};
    try { excludes = JSON.parse(document.getElementById('site-model')?.textContent || '{}').excludes || {}; } catch {}
    const pages = [...document.querySelectorAll('.pdf-page')];
    if (!pages.length) errors.push('PDF: no .pdf-page elements; run printStateProblems after the PDF transform.');
    pages.forEach((pg, i) => {
      const sec = pg.querySelector('[data-section]');
      const name = `PDF page ${i + 1}${sec ? ` ("${sec.dataset.section || sec.id}")` : ''}`;
      // A summary states the printed result: it carries at least one live figure, not just words.
      const summary = [...pg.querySelectorAll('[data-pdf-summary]')].some((el) => text(el) && [...el.querySelectorAll('[data-v], [data-expr]')].some((f) => text(f)));
      const figure = [...pg.querySelectorAll('[data-v], [data-expr]')].some((el) => text(el));
      // The contract selectPdfState recorded before export; without it, what's left on the page.
      const marked = [...pg.querySelectorAll('[data-pdf-interactive]')];
      if (marked.length) {
        for (const s of marked) {
          const removed = s.dataset.pdfInteractive.split(' ').filter((x) => x !== 'kept');
          if (removed.length && !summary) errors.push(`${name}: the PDF leaves out its ${removed.join(' and ')}, so it needs a visible [data-pdf-summary] that states the chosen result and its assumptions.`);
          else if (!removed.length && !summary && !figure) errors.push(`${name} has controls but prints no result. Show the chosen figure, or add a [data-pdf-summary] that states it with its assumptions.`);
        }
      } else if (pg.querySelector('input[data-input], [role="tab"], [data-preset], [data-toggle], [data-choice]') && !summary && !figure) {
        errors.push(`${name} has controls but prints no result. Show the chosen figure, or add a [data-pdf-summary] that states it with its assumptions.`);
      }
      // A proposed promise keeps its qualifier, and a partial total names what it leaves out, on the same page.
      const proposed = [...pg.querySelectorAll('[data-basis="proposed"]')].filter((el) => text(el));
      if (proposed.length && ![...pg.querySelectorAll('[data-conditional]')].some((el) => text(el)))
        errors.push(`${name} prints a proposed commitment ("${text(proposed[0]).slice(0, 60)}") without its [data-conditional] note. Keep the note on the printed page (don't data-pdf-hide it).`);
      const excluded = new Set([...pg.querySelectorAll('[data-excludes]')].filter((el) => text(el)).flatMap((el) => el.dataset.excludes.split(/[\s,]+/)));
      const partial = new Set([...pg.querySelectorAll('[data-v]')].filter((el) => text(el) && Object.hasOwn(excludes, el.dataset.v)).map((el) => el.dataset.v));
      for (const k of partial) if (!excluded.has(k)) errors.push(`${name} prints {{${k}}}, a partial total, without the line that says what it leaves out. Keep a visible data-excludes="${k}" on the same page.`);
      const t = pg.innerText.replace(/\s+/g, ' ');
      for (const re of WEB_ONLY) {
        const m = t.match(re);
        if (m) errors.push(`${name} says "${m[0]}", which a PDF can't do. Mark it data-pdf-hide, or say what the printed figure assumes.`);
      }
    });
    const deck = document.querySelector('.pdf-deck') || document.body;
    const act = [...deck.querySelectorAll('a[data-cta], a[href^="mailto:"], a[href^="tel:"], [data-pdf-contact]')].some((el) => text(el));
    if (!act) errors.push('the PDF has no next step or contact. Keep a visible a[data-cta], a mailto: or tel: link, or add a [data-pdf-contact] line.');
    return { errors: [...new Set(errors)], warnings };
  });
}
