#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?Usage: reproduce.sh NEW_OUTPUT_DIR REVIEWED_MAIN_DICT (Node22+, OpenCC)}"
MAIN="${2:?Supply the exact 08ec8f18 main dictionary, reproduced by scripts/reproduce-08ec8f18.sh}"
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"; MAIN="$(cd "$(dirname "$MAIN")" && pwd)/$(basename "$MAIN")"
node -e 'const f=require("fs"),h=require("crypto");if(h.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex")!=="0ace42e4ce04d4e03820cb6ea3a241b6a1f4d1cdbc41c1d152c1061c33bf5beb")throw Error("Main SHA mismatch")' "$MAIN"
cd "$HERE/toolchain"
node scripts/gen-t9-completions.mjs --dictionary "$MAIN" --out "$OUT/t9_completions.tsv"
cmp "$OUT/t9_completions.tsv" "$HERE/files/t9_completions.tsv"
echo 'Exact T9 data reproduction verified.'
