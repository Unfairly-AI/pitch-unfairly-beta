// Render a deck's 1920x1080 stage to PDF, one page per slide.
export async function renderPdf(browser, base) {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto(`${base.replace(/\/$/, '')}/?pdf=1`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForFunction(() => window.__deckReady === true, { timeout: 15000 });
    // The dev toolbar otherwise adds a trailing blank page.
    await page.evaluate(() => document.querySelector('astro-dev-toolbar')?.remove());
    return Buffer.from(await page.pdf({
      width: '1920px',
      height: '1080px',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    }));
  } finally {
    await page.close();
  }
}

export function countPdfPages(bytes) {
  return (bytes.toString('latin1').match(/\/Type\s*\/Page(?!s)/g) || []).length;
}
