// The live-state check every showpiece gets: a slide's walkthrough, calculator
// or any other piece that changes on screen, driven the way a viewer drives it.
//
// A showpiece declares itself in its markup, which is the whole contract:
//   data-showpiece="<kind>"   on its root
//   data-state="<state>"      the state showing now, kept current by its script
//   data-final="<state>"      the state the PDF prints, and where it rests
//   data-settle="<ms>"        how long its entrance plays (optional, 0)
//   data-drive="<state>"      on each control: the state a click on it shows
// and the audit checks, on the stage and on a phone:
//   - at rest and in the PDF it shows its final state;
//   - entering its slide plays it, and once it settles it shows that same state,
//     so the live deck ends where the PDF starts;
//   - every control is a real button with words, at least 24px tall on a
//     phone, and a click on it shows the state it names;
//   - in every state it reaches, it stays inside its slide.
// bin/audit.mjs runs it; npm run deck:gallery -- --audit runs it on the toolbox.

const MAX_SETTLE = 8000;

/** In the page: the slide index and contract of every showpiece. */
function listShowpieces() {
  const slides = [...document.querySelectorAll('.slide')];
  return [...document.querySelectorAll('[data-showpiece]')].map((root, k) => {
    root.setAttribute('data-showpiece-k', String(k));
    const slide = root.closest('.slide');
    return {
      k,
      kind: root.dataset.showpiece,
      slide: slides.indexOf(slide),
      id: slide?.id?.replace(/^slide-/, '') ?? '(no slide)',
      final: root.dataset.final ?? null,
      settle: Number(root.dataset.settle) || 0,
      drives: [...root.querySelectorAll('[data-drive]')].map((b) => b.dataset.drive),
    };
  });
}

/** In the page: the showpiece's state and what's wrong with it as it stands. */
function inspect(k, phone) {
  const root = document.querySelector(`[data-showpiece-k="${k}"]`);
  const slide = root.closest('.slide');
  const issues = [];
  const r = root.getBoundingClientRect();
  const s = slide.getBoundingClientRect();
  if (r.right > s.right + 1 || r.bottom > s.bottom + 1 || r.left < s.left - 1) issues.push(`runs outside its slide (${Math.round(r.width)}×${Math.round(r.height)} at ${Math.round(r.left - s.left)},${Math.round(r.top - s.top)})`);
  if (root.scrollWidth > root.clientWidth + 1) issues.push(`scrolls sideways (${root.scrollWidth}px in ${root.clientWidth}px)`);
  for (const b of root.querySelectorAll('[data-drive]')) {
    const label = (b.textContent ?? '').trim() || b.getAttribute('aria-label');
    if (b.tagName !== 'BUTTON' && b.tagName !== 'A' && b.tagName !== 'INPUT') issues.push(`control "${label}" is a <${b.tagName.toLowerCase()}>; make it a button so a keyboard reaches it`);
    if (!label) issues.push('a control has no words');
    const h = b.getBoundingClientRect().height;
    if (phone && b.offsetParent && h < 24) issues.push(`control "${label}" is ${Math.round(h)}px tall; a phone needs 24px to tap`);
  }
  return { state: root.dataset.state ?? null, issues };
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Audit every showpiece on a built deck. `open(viewport, query)` resolves to a
 * puppeteer page at the deck with its ready signal awaited. Returns problems
 * as "mode: slide: message" strings and the number of showpieces checked.
 */
export async function auditShowpieces(open) {
  const problems = [];
  let count = 0;
  const modes = [
    ['showpiece', { width: 1920, height: 1080 }, false],
    ['showpiece-mobile', { width: 393, height: 745, isMobile: true, hasTouch: true }, true],
  ];
  for (const [mode, viewport, phone] of modes) {
    // The PDF's state: every showpiece rests on its final state.
    const pdf = await open(viewport, '?pdf=1');
    const listed = await pdf.evaluate(listShowpieces);
    count = Math.max(count, listed.length);
    for (const sp of listed) {
      const where = `${mode}: ${sp.id}`;
      if (sp.final === null) { problems.push(`${where}: data-showpiece="${sp.kind}" has no data-final, the state its PDF page prints`); continue; }
      if (!sp.drives.length) problems.push(`${where}: data-showpiece="${sp.kind}" has no data-drive control; a showpiece the viewer can't change is a picture`);
      const rest = await pdf.evaluate(inspect, sp.k, phone);
      if (rest.state !== sp.final) problems.push(`${where}: the PDF shows state ${rest.state}, not its final state ${sp.final}`);
      if (!phone) rest.issues.forEach((i) => problems.push(`${where} (pdf): ${i}`));
    }
    await pdf.close();
    if (!listed.length) continue;

    // The live deck: enter each showpiece's slide, let it play, then drive it.
    const page = await open(viewport, '');
    await page.evaluate(listShowpieces);
    for (const sp of listed) {
      if (sp.final === null) continue;
      const where = `${mode}: ${sp.id}`;
      await page.evaluate((i) => window.deckReplay?.(i), sp.slide);
      await wait(Math.min(sp.settle, MAX_SETTLE) + 250);
      const played = await page.evaluate(inspect, sp.k, phone);
      if (played.state !== sp.final) problems.push(`${where}: after its entrance (${sp.settle}ms) it shows state ${played.state}, not ${sp.final}; the live deck has to end where the PDF starts`);
      played.issues.forEach((i) => problems.push(`${where}: ${i}`));
      for (const want of sp.drives) {
        const button = await page.$(`[data-showpiece-k="${sp.k}"] [data-drive="${want}"]`);
        if (!(await button?.isVisible())) continue;
        await button.click();
        await wait(60);
        const after = await page.evaluate(inspect, sp.k, phone);
        if (after.state !== want) problems.push(`${where}: its control for state ${want} shows state ${after.state}`);
        after.issues.forEach((i) => problems.push(`${where} (state ${want}): ${i}`));
      }
    }
    await page.close();
  }
  return { problems: [...new Set(problems)], count };
}
