// Screenshots a review can compare by hash: the same page gives the same bytes
// on every run. The reviewer carries a section's verdict forward only while its
// screenshots' sha256 is unchanged, so a pixel that differs between two runs of
// the same build makes it judge a change that isn't there (clorox-1-11-test,
// Oct 28: phone 07-voice, 05-hands and 11-next came out with a different hash on
// rebuilds of an unchanged site, each one channel of one anti-aliased edge).
//
// Two sources, each settled here:
// - Rasterization: Chrome's GPU raster anti-aliases edges (a circle, a rounded
//   card) a value apart from run to run. Software raster with a fixed colour
//   profile is the same every time (STABLE_ARGS).
// - Time: a running animation, a playing video, a font or image still loading
//   is caught at whatever moment the shot happens (settleForShots).

/** Chrome flags for byte-stable screenshots: software raster, sRGB. */
export const STABLE_ARGS = ['--disable-gpu', '--disable-gpu-rasterization', '--disable-partial-raster', '--force-color-profile=srgb'];

/** puppeteer.launch options with STABLE_ARGS added to any given. */
export const stableLaunch = (options = {}) => ({ headless: true, ...options, args: [...new Set([...(options.args ?? []), ...STABLE_ARGS])] });

// Every animation and transition settled (a zero-length animation shows its end state), no blinking caret.
const FREEZE = `*, *::before, *::after { animation-play-state: paused !important; animation-delay: 0s !important; animation-duration: 0s !important; animation-iteration-count: 1 !important; transition: none !important; caret-color: transparent !important; }
  html { scroll-behavior: auto !important; }`;

/**
 * Hold the page still for screenshots: animations and transitions stopped at
 * their end, every video paused on its first frame, lazy images loaded and
 * decoded, web fonts loaded. Returns a function that undoes it (the freeze CSS
 * and the paused videos), for checks that run on the same page afterwards.
 */
export async function settleForShots(page) {
  const style = await page.addStyleTag({ content: FREEZE });
  const playing = await page.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const was = [];
    for (const [i, v] of [...document.querySelectorAll('video')].entries()) {
      if (!v.paused || v.autoplay) was.push(i);
      v.dataset.shotPaused = String(i);
      v.autoplay = false;
      v.pause();
      v.preload = 'auto';
      if (v.readyState < 2) {
        v.load();
        await Promise.race([new Promise((r) => v.addEventListener('loadeddata', r, { once: true })), wait(5000)]);
      }
      if (v.currentTime !== 0) {
        await Promise.race([new Promise((r) => { v.addEventListener('seeked', r, { once: true }); v.currentTime = 0; }), wait(3000)]);
      }
    }
    for (const img of document.images) if (img.loading === 'lazy') img.loading = 'eager';
    await Promise.all([...document.images].map((img) => (img.complete ? img.decode() : new Promise((r) => { img.addEventListener('load', r, { once: true }); img.addEventListener('error', r, { once: true }); }).then(() => img.decode())).catch(() => {})));
    await document.fonts.ready;
    // Two frames, so everything above is painted.
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    return was;
  });
  return async () => {
    await style.evaluate((n) => n.remove()).catch(() => {});
    await page.evaluate((was) => {
      for (const v of document.querySelectorAll('video[data-shot-paused]')) {
        if (was.includes(Number(v.dataset.shotPaused))) { v.autoplay = true; v.play().catch(() => {}); }
        delete v.dataset.shotPaused;
      }
    }, playing).catch(() => {});
  };
}
