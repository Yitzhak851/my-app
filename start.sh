#!/usr/bin/env bash
# =============================================================================
#  YBO Social Network - start everything (macOS / Linux / Git Bash)
#
#      ./start.sh
#
#  Sets up anything missing, starts the API and the web app, and opens your
#  browser. Safe to run repeatedly.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
    echo
    echo "  Node.js is not installed, or not on your PATH."
    echo "  Install the LTS version from https://nodejs.org and run this again."
    echo
    exit 1
fi

node scripts/setup.mjs
node scripts/dev.mjs
