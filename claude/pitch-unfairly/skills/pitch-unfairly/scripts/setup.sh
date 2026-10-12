#!/bin/sh
# One-time setup for the deck workflow, and a fast start for every deck after.
#
#   sh setup.sh [deck-dir] [--offline]
#
# Sets up what the workflow needs in ~/.pitch-unfairly (or
# $PITCH_UNFAIRLY_HOME, or ./.pitch-unfairly when the home folder isn't
# writable). It never uses sudo, never changes system settings, and writes only
# to that folder and the deck folder.
#   - Unfairly: first checks that app.unfairly.ai, where decks are checked and
#     published, can be reached. Where it can't (some agent sandboxes allow
#     only package registries), it reports NETWORK_BLOCKED and installs
#     nothing, so the agent builds in the deck studio instead. --offline skips
#     the check, for building a deck to host yourself.
#   - Node.js 22.12+: the one installed.
#   - The starter's npm packages, from its lockfile (npm ci): installed once per
#     starter version, then copied into each new deck in a second or two.
#   - Chrome for the audits and PDF: an installed Google Chrome, Chromium,
#     Microsoft Edge, or Brave, or a Playwright copy if one exists.
# With deck-dir, it also creates the deck from the starter, or installs the
# packages into an existing deck.
#
# Afterwards, run deck commands from the deck folder as:
#   . ~/.pitch-unfairly/env.sh && npm run dev
set -eu

here=$(cd "$(dirname "$0")" && pwd)
starter="$here/../assets/starter"
home="${PITCH_UNFAIRLY_HOME:-$HOME/.pitch-unfairly}"
deck=
download_chrome=
install_node=
offline=
for arg in "$@"; do
  case "$arg" in
    --offline) offline=1 ;;
    -*) printf 'setup: unknown option %s\n' "$arg" >&2; exit 1 ;;
    *) deck=$arg ;;
  esac
done

say() { printf '%s\n' "$*"; }
fail() { printf 'setup: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "this setup runs on macOS and Linux. On Windows, run it inside WSL." ;;
esac
case "$(uname -m)" in
  arm64 | aarch64) arch=arm64 ;;
  x86_64 | amd64) arch=x64 ;;
  *) arch= ;;
esac

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1"; else wget -qO- "$1"; fi
}

sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1"; else sha256sum "$1"; fi | cut -d' ' -f1
}

# Some agent sandboxes can't reach Unfairly at all: they allow package
# registries and little else. A deck built there could never be checked or
# published, so stop before installing anything and say so; the agent then
# builds in the deck studio, which runs on Unfairly's side. The check reads
# the deck server's public metadata, so a proxy's own error page doesn't pass.
if [ -z "$offline" ]; then
  probe=https://app.unfairly.ai/.well-known/oauth-protected-resource/api/decks/mcp
  if command -v curl >/dev/null 2>&1; then
    meta=$(curl -fsS -m 10 "$probe" 2>/dev/null || true)
  else
    meta=$(wget -qO- -T 10 "$probe" 2>/dev/null || true)
  fi
  case "$meta" in
    *'"resource":"https://app.unfairly.ai/api/decks/mcp"'*) ;;
    *) fail "NETWORK_BLOCKED: this environment can't reach app.unfairly.ai, where decks are checked and published, so nothing was installed. Build the deck in the deck studio instead, as the workflow's \"Building without a shell\" section says. Don't ask the user to change network settings." ;;
  esac
fi

# Sandboxed agents (such as Codex's default workspace-write mode) can't write outside
# the workspace. If the home folder is off limits and no explicit home was
# given, keep everything inside the workspace instead, so setup still works
# without asking for wider permissions.
if ! { mkdir -p "$home" 2>/dev/null && [ -w "$home" ]; }; then
  [ -n "${PITCH_UNFAIRLY_HOME:-}" ] && fail "can't write to $home"
  home="$PWD/.pitch-unfairly"
  mkdir -p "$home"
  say "Your home folder isn't writable here, so the tools go in $home"
  # npm and Puppeteer cache under the home folder too; keep them inside.
  npm_config_cache="$home/npm-cache"
  PUPPETEER_CACHE_DIR="${PUPPETEER_CACHE_DIR:-$home/puppeteer}"
  export npm_config_cache PUPPETEER_CACHE_DIR
  sandboxed=1
fi

# 1. Node.js -----------------------------------------------------------------

node_ok() {
  "$1" -e 'const [a, b] = process.versions.node.split(".").map(Number); process.exit(a > 22 || (a === 22 && b >= 12) ? 0 : 1)' 2>/dev/null
}

node_bin=
if command -v node >/dev/null 2>&1 && node_ok node; then
  say "Node.js $(node -v): using the one installed"
elif [ -x "$home/node/bin/node" ] && node_ok "$home/node/bin/node"; then
  node_bin="$home/node/bin"
  say "Node.js $("$node_bin/node" -v): using the private copy"
else
  found=$(command -v node >/dev/null 2>&1 && node -v || true)
  fail "NEEDS_NODE: Node.js 22.12 or newer isn't on this machine${found:+ (found $found)}, so nothing was installed. Ask the user to install Node.js from https://nodejs.org/en/download and then run setup again, or, if they'd rather not install anything, build the deck in the deck studio as the workflow's \"Building without a shell\" section says."
fi

if [ -n "$node_bin" ]; then
  printf 'export PATH="%s:$PATH"\n' "$node_bin" >"$home/env.sh"
  PATH="$node_bin:$PATH"
  export PATH
else
  printf '# The Node.js on PATH is new enough; nothing to add.\n' >"$home/env.sh"
fi

# Astro writes a telemetry file under the home folder on every build, which
# fails where the home folder isn't writable (as in some agent sandboxes). Turn it
# off; decks don't need it.
printf 'export ASTRO_TELEMETRY_DISABLED=1\n' >>"$home/env.sh"
ASTRO_TELEMETRY_DISABLED=1
export ASTRO_TELEMETRY_DISABLED

if [ "${sandboxed:-}" ]; then
  printf 'export npm_config_cache="%s"\nexport PUPPETEER_CACHE_DIR="%s"\n' "$npm_config_cache" "$PUPPETEER_CACHE_DIR" >>"$home/env.sh"
fi

# 2. Packages, installed once per starter version ----------------------------

engine="$home/engine/$(sha256 "$starter/package-lock.json" | cut -c1-12)"
if [ ! -d "$engine/node_modules" ]; then
  say "Installing the deck engine (about 175 MB, one time)..."
  rm -rf "$engine.partial" && mkdir -p "$engine.partial"
  cp "$starter/package.json" "$starter/package-lock.json" "$engine.partial/"
  (cd "$engine.partial" && PUPPETEER_SKIP_DOWNLOAD=true npm ci --no-audit --no-fund --loglevel=error >/dev/null)
  rm -rf "$engine" && mv "$engine.partial" "$engine"
fi
say "Deck engine ready"

# 3. Chrome --------------------------------------------------------------------

# Succeeds when Puppeteer can launch this Chrome and print a PDF with it.
# An empty path tests Puppeteer's own download.
chrome_works() {
  (
    cd "$engine"
    if [ -n "$1" ]; then
      PUPPETEER_EXECUTABLE_PATH=$1
      export PUPPETEER_EXECUTABLE_PATH
    fi
    node --input-type=module -e "
      import puppeteer from 'puppeteer';
      const browser = await puppeteer.launch({ headless: true });
      try {
        const page = await browser.newPage();
        await page.setContent('<p>ok</p>');
        await page.pdf();
      } finally {
        await browser.close();
      }"
  ) >/dev/null 2>&1
}

chrome_candidates() {
  if [ "$os" = darwin ]; then
    printf '%s\n' \
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      "$HOME/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      "/Applications/Chromium.app/Contents/MacOS/Chromium" \
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" \
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
    # A Playwright browser, if one is already on the machine, newest first.
    ls -d "$HOME/Library/Caches/ms-playwright"/chromium-*/chrome-mac*/*.app/Contents/MacOS/* 2>/dev/null | sort -r
  else
    for name in google-chrome google-chrome-stable chromium chromium-browser microsoft-edge brave-browser; do
      command -v "$name" || true
    done
    ls -d "$HOME/.cache/ms-playwright"/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -r
  fi
}

# Codex runs commands in a sandbox (it sets CODEX_SANDBOX) that kills any
# browser it starts, and macOS then shows a crash dialog for each one. So there,
# find the installed Chrome without launching it, and leave the browser steps
# for a mode that allows them. Other sandboxes are found by trying a launch below.
if [ -n "${CODEX_SANDBOX:-}" ]; then
  chrome=$(chrome_candidates | while IFS= read -r path; do
    if [ -x "$path" ]; then printf '%s' "$path"; break; fi
  done)
  no_chrome=1
  say "BROWSER_BLOCKED: this sandbox doesn't let a browser start, so setup didn't launch one. Write the story and slides here (npm run dev previews them), and run the brand capture, checks, and publish in the deck studio instead, as the workflow's \"When the browser is blocked\" section says. Don't ask the user to change settings or try another way around the sandbox."
else
  chrome=$(chrome_candidates | while IFS= read -r path; do
    if [ -x "$path" ] && chrome_works "$path"; then
      printf '%s' "$path"
      break
    fi
  done)

  if [ -n "$chrome" ]; then
    say "Chrome: using $chrome"
  elif chrome_works ""; then
    say "Chrome: using Puppeteer's copy"
  elif chrome_candidates | { while IFS= read -r path; do [ -x "$path" ] && exit 0; done; exit 1; }; then
    # Installed but won't launch: usually an environment that blocks browsers.
    no_chrome=1
    say "Chrome is installed but can't launch here. Write the story and slides now (npm run dev previews them); the audit, shots, and PDF need a browser, so ask the user how they want to run them."
  else
    no_chrome=1
    say "NEEDS_CHROME: No working Google Chrome, Chromium, Edge, or Brave found. Write the story and slides now (npm run dev previews them). The audit, shots, and PDF need Chrome: ask the user to install Google Chrome and run setup again, or, if they'd rather not, run the checks and publish in the deck studio as the workflow's \"When the browser is blocked\" section says."
  fi
fi
# 4. The deck ------------------------------------------------------------------

if [ -n "$deck" ]; then
  if [ ! -e "$deck/package.json" ]; then
    if [ -e "$deck" ] && [ -n "$(ls -A "$deck")" ]; then
      fail "$deck already has files and isn't a deck; pick a new or empty folder"
    fi
    mkdir -p "$deck"
    (cd "$starter" && tar --exclude=node_modules --exclude=dist --exclude=.astro --exclude=artifacts -cf - .) | (cd "$deck" && tar -xf -)
    say "Created $deck from the starter"
  fi

  if [ ! -d "$deck/node_modules" ]; then
    if cmp -s "$deck/package-lock.json" "$engine/package-lock.json"; then
      # Copy-on-write clone where the disk supports it (APFS, Btrfs, XFS);
      # a plain copy otherwise.
      if [ "$os" = darwin ]; then
        cp -cR "$engine/node_modules" "$deck/node_modules" 2>/dev/null ||
          { rm -rf "$deck/node_modules" && cp -R "$engine/node_modules" "$deck/node_modules"; }
      else
        cp -a --reflink=auto "$engine/node_modules" "$deck/node_modules"
      fi
    else
      (cd "$deck" && PUPPETEER_SKIP_DOWNLOAD=true npm ci --no-audit --no-fund --loglevel=error >/dev/null)
    fi
  fi

  # Point the deck's scripts at the Chrome that passed the check.
  if [ -n "$chrome" ]; then
    node -e 'require("fs").writeFileSync(process.argv[1], JSON.stringify({ executablePath: process.argv[2] }, null, 2) + "\n")' \
      "$deck/.puppeteerrc.json" "$chrome"
  else
    rm -f "$deck/.puppeteerrc.json"
  fi
  say "Deck ready in $deck"
fi

say ""
say "Run deck commands from the deck folder as:"
say "  . \"$home/env.sh\" && npm run dev"
