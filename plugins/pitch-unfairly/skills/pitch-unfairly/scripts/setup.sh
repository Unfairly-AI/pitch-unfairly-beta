#!/bin/sh
# One-time setup for the deck workflow, and a fast start for every deck after.
#
#   sh setup.sh [deck-dir]
#
# Installs what the workflow needs into ~/.pitch-unfairly (or
# $PITCH_UNFAIRLY_HOME, or ./.pitch-unfairly when a sandbox blocks the home
# folder), without admin rights or a package manager:
#   - Node.js 22.12+: the one on PATH, or a private copy it downloads.
#   - The starter's packages: installed once per starter version, then cloned
#     into each new deck in a second or two.
#   - Chrome for the audits and PDF: the installed Google Chrome or Chromium
#     when Puppeteer can drive it, otherwise Puppeteer's own download.
# With deck-dir, it also creates the deck from the starter, or installs the
# packages into an existing deck. Every download happens in this one command,
# so a sandboxed agent asks for network access once.
#
# Afterwards, run deck commands from the deck folder as:
#   . ~/.pitch-unfairly/env.sh && npm run dev
set -eu

here=$(cd "$(dirname "$0")" && pwd)
starter="$here/../assets/starter"
home="${PITCH_UNFAIRLY_HOME:-$HOME/.pitch-unfairly}"
deck="${1:-}"

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
  *) fail "no Node.js build for this CPU ($(uname -m))" ;;
esac

fetch() {
  if command -v curl >/dev/null 2>&1; then curl -fsSL "$1"; else wget -qO- "$1"; fi
}
sha256() {
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1"; else sha256sum "$1"; fi | cut -d' ' -f1
}

# Sandboxed agents (Codex's default workspace-write mode) can't write outside
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
  say "Node.js 22.12 or newer isn't installed. Downloading a private copy (about 50 MB, one time)..."
  base=https://nodejs.org/dist/latest-v24.x
  sums=$(fetch "$base/SHASUMS256.txt")
  file=$(printf '%s\n' "$sums" | awk -v want="-$os-$arch.tar.gz" 'substr($2, length($2) - length(want) + 1) == want { print $2; exit }')
  [ -n "$file" ] || fail "no Node.js build for $os-$arch"
  tmp=$(mktemp -d)
  fetch "$base/$file" >"$tmp/$file"
  expected=$(printf '%s\n' "$sums" | awk -v f="$file" '$2 == f { print $1 }')
  [ "$(sha256 "$tmp/$file")" = "$expected" ] || fail "the Node.js download failed its checksum; run setup again"
  rm -rf "$home/node" && mkdir -p "$home/node"
  tar -xzf "$tmp/$file" -C "$home/node" --strip-components=1
  rm -rf "$tmp"
  node_bin="$home/node/bin"
  say "Node.js $("$node_bin/node" -v) installed in $home/node"
fi

if [ -n "$node_bin" ]; then
  printf 'export PATH="%s:$PATH"\n' "$node_bin" >"$home/env.sh"
  PATH="$node_bin:$PATH"
  export PATH
else
  printf '# The Node.js on PATH is new enough; nothing to add.\n' >"$home/env.sh"
fi

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
      "/Applications/Chromium.app/Contents/MacOS/Chromium"
  else
    for name in google-chrome google-chrome-stable chromium chromium-browser; do
      command -v "$name" || true
    done
  fi
}

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
else
  say "Downloading Chrome for the audits and PDF (about 370 MB on disk, one time)..."
  (cd "$engine" && npx --no-install puppeteer browsers install chrome >/dev/null)
  if chrome_works ""; then
    say "Chrome: using Puppeteer's copy"
  else
    # Usually a sandbox that blocks launching browsers. The deck can still be
    # written and built; the audits, screenshots, and PDF need Chrome, so run
    # those outside the sandbox (an agent asks for that permission).
    no_chrome=1
    say "Chrome is installed but can't launch here, likely a sandbox. Write and build the deck now; run the audit, shots, and PDF outside the sandbox."
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
