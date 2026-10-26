/* An example product moment: one number counting up, with the bars behind it filling in.
   Replace it with a moment from the real product: a screen, a panel, a live calculator.
   Rules (guide: deck_guide topic social): real product only, the moment tells its story in
   under 4 seconds, and it reads with the sound off. */
SOCIAL.moment('metric', {
  w: 600, h: 440, end: 3.2,
  html: `<div class="m-card">
    <p class="m-k">Example metric</p>
    <p class="m-n"><span data-k="n">0</span><small>%</small></p>
    <div class="m-bars">${[42, 55, 61, 70, 84].map((v, i) => `<i data-k="b${i}" style="height:${v}%"></i>`).join('')}</div>
  </div>`,
  update(t, root) {
    const { k, q, E } = SOCIAL.anim;
    q(root, 'n').textContent = Math.round(84 * k(t, 0.3, 1.8, E.out));
    for (let i = 0; i < 5; i++) q(root, `b${i}`).style.transform = `scaleY(${k(t, 0.4 + i * 0.18, 0.7, E.expo)})`;
  },
});
