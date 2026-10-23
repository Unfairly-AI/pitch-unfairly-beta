// Cutouts are assets; reference screenshots must retain the source's original styling.
export async function withTransparentBackground(page, capture) {
  const style = await page.addStyleTag({ content: 'html, body { background: transparent !important; } body * { background-color: transparent !important; }' });
  try { return await capture(); }
  finally { await style.evaluate((node) => node.remove()); }
}
