#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="${1:?Usage: reproduce.sh NEW_OUTPUT_DIR [REVIEWED_MAIN_DICT] (Node22+, OpenCC)}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
MAIN="${2:-$OUT/hotwords.dict.yaml}"
if [[ ! -f "$MAIN" ]]; then curl -fL https://github.com/2ouf3i/rime-hotwords-dict/releases/download/dict-9e926c40/hotwords.dict.yaml -o "$MAIN"; fi
node -e 'const f=require("fs"),h=require("crypto");if(h.createHash("sha256").update(f.readFileSync(process.argv[1])).digest("hex")!=="25bc6eb04b4fdee7f53f314bbb3800cfd10b6d2a15f9256806f664c00c33d2ce")throw Error("Main dictionary SHA mismatch")' "$MAIN"
cd "$HERE/toolchain"
node scripts/gen-t9-completions.mjs --dictionary "$MAIN" --out "$OUT/t9_completions.tsv"
node backend/scripts/build-next-word-table.mjs --in "$HERE/source" --builtin apps/apple/NinanKeyboard/Rime/pinyin_simp.dict.yaml --out "$OUT/nextword" --ref da1fbe602e38f26db846fa10120ee64c2b0324c0 --blocklist backend/dict/next-word-blocklist.txt --golden backend/dict/next-word-golden.txt --everyday backend/dict/next-word-everyday.txt
cmp "$OUT/t9_completions.tsv" "$HERE/files/t9_completions.tsv"
cmp "$OUT/nextword/next_word.tsv" "$HERE/files/next_word.tsv"
echo 'Both public payloads reproduced byte for byte.'
