import { defineConfig } from 'astro/config';

// A static build that works from any folder: the hosted copy lives at
// cdn.pitchunfairly.com/<slug>/v<n>/, so every asset URL must be relative.
// Stylesheets are inlined (their font URLs then resolve against the page),
// and assetsPrefix '.' makes script and font URLs start with ./_astro/.
export default defineConfig({
  output: 'static',
  devToolbar: { enabled: false },
  build: {
    inlineStylesheets: 'always',
    assetsPrefix: '.',
  },
});
