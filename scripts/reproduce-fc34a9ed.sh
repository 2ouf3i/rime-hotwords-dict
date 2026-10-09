#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM="${1:?Usage: reproduce-fc34a9ed.sh <rime-ice checkout> <new output directory>}"
OUTPUT="${2:?Specify a new output directory}"
REF=da1fbe602e38f26db846fa10120ee64c2b0324c0
[[ "$(git -C "$UPSTREAM" rev-parse HEAD)" == "$REF" ]] || { echo "Wrong upstream commit" >&2; exit 1; }
[[ ! -e "$OUTPUT" ]] || { echo "Output already exists" >&2; exit 1; }
mkdir -p "$OUTPUT"
INPUT="$ROOT/inputs/2026-10-09"
node "$ROOT/scripts/build-pinyin-baseline-20261007.mjs" \
  --in "$UPSTREAM/cn_dicts" --out "$OUTPUT/baseline" --ref "$REF" \
  --builtin "$ROOT/vendor/pinyin_simp.dict.yaml" --hotwords "$INPUT/ninan-hotwords.txt" \
  --phrase-weights "$INPUT/phrase-weights.txt" --phrase-weights "$INPUT/everyday-phrases.txt" --phrase-weights "$INPUT/place-names.txt"
node "$ROOT/scripts/build-pinyin-readings-preview.mjs" \
  --baseline "$OUTPUT/baseline" --upstream "$UPSTREAM/cn_dicts" --out "$OUTPUT/readings"
node "$ROOT/scripts/build-pinyin-preview.mjs" \
  --baseline "$OUTPUT/readings" --table "$INPUT/chat-phrases.txt" --out "$OUTPUT/out"
node --input-type=module - "$OUTPUT/out" "$INPUT/expected-manifest.json" <<'JS'
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [out,expected]=process.argv.slice(2);
const e=JSON.parse(readFileSync(expected));
for(const [name,sha,bytes] of [['hotwords.dict.yaml',e.sha256,e.bytes],['hotwords_auto.dict.yaml',e.auto.sha256,e.auto.bytes]]) {
 const data=readFileSync(`${out}/${name}`);
 if(data.length!==bytes||createHash('sha256').update(data).digest('hex')!==sha)throw new Error(`Mismatch: ${name}`);
}
console.log(`Verified ${e.version}: exact main and auto SHA256`);
JS
