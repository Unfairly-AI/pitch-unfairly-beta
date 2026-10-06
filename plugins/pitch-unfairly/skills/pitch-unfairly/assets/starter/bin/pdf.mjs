// After `astro build`: render dist/deck.pdf from the built deck, so the PDF
// button works anywhere the folder is hosted, with no server.
import puppeteer from 'puppeteer';
import { writeFile } from 'node:fs/promises';
import { serveDir } from './serve.mjs';
import { countPdfPages, renderPdf } from './render-pdf.mjs';

const dir = process.argv[2] ?? 'dist';
const server = await serveDir(dir);
const browser = await puppeteer.launch({ headless: true });
try {
  const pdf = await renderPdf(browser, server.url);
  await writeFile(`${dir}/deck.pdf`, pdf);
  console.log(`${dir}/deck.pdf: ${countPdfPages(pdf)} pages, ${(pdf.length / 1024).toFixed(0)} KB`);
} finally {
  await browser.close();
  await server.close();
}
