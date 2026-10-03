#!/usr/bin/env bash
#
# One command to get the studio running on a machine that has never seen it.
#
# Everything here is something a person would otherwise have to know: which Node version Next.js 16
# needs, that dependencies have to be installed before the first run, and which port the application
# listens on. A contributor who has to be told four of those before they can look at the screen is a
# contributor who looks at the screen a day later than they meant to.
#
#   ./scripts/start.sh          # install if needed, then start the development server
#   ./scripts/start.sh --check  # the suites and the type check, without starting anything
#
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

PORT=3400
NEEDS_NODE=20

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n\n' "$*" >&2; exit 1; }

# --- Node ------------------------------------------------------------------------------------
command -v node >/dev/null 2>&1 || die "Node is not installed. Install Node ${NEEDS_NODE} or newer: https://nodejs.org"
major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt "$NEEDS_NODE" ]; then
  die "Node $(node -v) is too old — Next.js 16 needs Node ${NEEDS_NODE} or newer.
If you use nvm:  nvm install ${NEEDS_NODE} && nvm use ${NEEDS_NODE}"
fi
say "Node $(node -v)"

# --- Dependencies ----------------------------------------------------------------------------
# Reinstalled when the lockfile is newer than the tree, so a pull that changed dependencies does not
# leave somebody debugging a module that was never fetched.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules ]; then
  say "Installing dependencies — a few minutes the first time"
  npm install
else
  say "Dependencies are up to date"
fi

# --- Checks, if that is all that was asked ----------------------------------------------------
if [ "${1:-}" = "--check" ]; then
  say "Type check"; npm run typecheck
  say "Test suite"; npm test
  say "All clear"
  exit 0
fi

# --- Run -------------------------------------------------------------------------------------
if command -v lsof >/dev/null 2>&1 && lsof -i ":${PORT}" >/dev/null 2>&1; then
  die "Something is already listening on port ${PORT}.
Stop it, or run on another port with:  npx next dev -p 3401"
fi

say "Starting the studio on http://localhost:${PORT}"
printf '  Landing page      http://localhost:%s/\n' "$PORT"
printf '  The workspace     http://localhost:%s/app/\n' "$PORT"
printf '  Lessons           http://localhost:%s/app/lessons/\n' "$PORT"
printf '  The factory       http://localhost:%s/app/factory/\n' "$PORT"
printf '\n  The first page takes a moment to compile. Ctrl-C to stop.\n\n'
exec npm run dev
