#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$SCRIPT_DIR/test-pioneer-midi.c"
BIN="/tmp/playmyjam-pioneer-sim"

if [ ! -x "$BIN" ] || [ "$SRC" -nt "$BIN" ]; then
  echo "Compiling native macOS CoreMIDI Virtual Pioneer DDJ-FLX4 simulator..."
  clang -O2 "$SRC" -framework CoreMIDI -framework CoreFoundation -lm -o "$BIN"
fi

exec "$BIN" "$@"
