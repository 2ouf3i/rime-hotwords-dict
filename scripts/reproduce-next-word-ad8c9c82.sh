#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
UPSTREAM="${1:?fixed rime-ice checkout required}"
OUT="${2:?new output directory required}"
REF=da1fbe602e38f26db846fa10120ee64c2b0324c0
[[ "$(git -C "$UPSTREAM" rev-parse HEAD)" == "$REF" ]] || { echo 'Wrong upstream commit' >&2; exit 1; }
[[ ! -e "$OUT" ]] || { echo 'Output already exists' >&2; exit 1; }
INPUT="$ROOT/inputs/2026-10-17-nextword"
node "$ROOT/scripts/nextword-20261017/build-next-word-table.mjs"   --in "$UPSTREAM/cn_dicts" --builtin "$ROOT/vendor/pinyin_simp.dict.yaml"   --out "$OUT" --ref "$REF" --blocklist "$INPUT/next-word-blocklist.txt"   --golden "$INPUT/next-word-golden.txt" --everyday "$INPUT/next-word-everyday.txt"
node - "$OUT" "$INPUT/expected-manifest.json" <<'JS'
const fs=require('node:fs'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const dir=process.argv[2],expected=JSON.parse(fs.readFileSync(process.argv[3]));
const actual=JSON.parse(fs.readFileSync(dir+'/manifest.json'));assert.deepEqual(actual,expected);
const b=fs.readFileSync(dir+'/next_word.tsv');assert.equal(b.length,expected.bytes);
assert.equal(crypto.createHash('sha256').update(b).digest('hex'),expected.sha256);
console.log('Exact next-word table and manifest reproduced: '+expected.sha256.slice(0,8));
JS
