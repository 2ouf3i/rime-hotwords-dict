#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?Usage: reproduce.sh NEW_OUTPUT_DIR REVIEWED_MAIN_DICT (Node22+, OpenCC)}"
MAIN="${2:?Supply the exact 8ce298b0 main dictionary, reproduced by scripts/reproduce-8ce298b0.sh}"
mkdir -p "$OUT"; OUT="$(cd "$OUT" && pwd)"; MAIN="$(cd "$(dirname "$MAIN")" && pwd)/$(basename "$MAIN")"
node -e 'const f=require("fs"),h=require("crypto");if(h.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex")!=="818f58f4666fae02c4fce4e9519c591f762e55ac385f8e01443281b3fd77a1b7")throw Error("Main SHA mismatch")' "$MAIN"
cd "$HERE/toolchain"
node scripts/gen-t9-completions.mjs --dictionary "$MAIN" --out "$OUT/t9_completions.tsv"
cmp "$OUT/t9_completions.tsv" "$HERE/files/t9_completions.tsv"
echo 'Exact T9 data reproduction verified.'
