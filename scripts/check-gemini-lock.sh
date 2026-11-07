#!/usr/bin/env bash
# Fails if the locked Gemini worker was changed without deliberately updating its lock file.
set -euo pipefail
cd "$(dirname "$0")/.."
actual=$(sha256sum workers/verde-roatan-gemini-worker.js | cut -d' ' -f1)
locked=$(tr -d '[:space:]' < workers/GEMINI_WORKER.LOCK)
if [ "$actual" != "$locked" ]; then
  echo "::error::workers/verde-roatan-gemini-worker.js is LOCKED (plant identification works). It changed."
  echo "expected $locked"; echo "actual   $actual"
  echo "If the OWNER approved this change: put the new hash in workers/GEMINI_WORKER.LOCK in the same commit."
  exit 1
fi
echo "Gemini worker lock OK ($actual)"
