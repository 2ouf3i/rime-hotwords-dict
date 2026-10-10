#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM="${1:?Usage: reproduce-3b76b062.sh <rime-ice checkout> <new output directory>}"
OUTPUT="${2:?Specify a new output directory}"
REF=da1fbe602e38f26db846fa10120ee64c2b0324c0
[[ "$(git -C "$UPSTREAM" rev-parse HEAD)" == "$REF" ]] || { echo "Wrong upstream commit" >&2; exit 1; }
[[ ! -e "$OUTPUT" ]] || { echo "Output already exists" >&2; exit 1; }
INPUT="$ROOT/inputs/2026-10-11-round4"
node "$ROOT/scripts/build-pinyin-dict-20261011.mjs" \
  --in "$UPSTREAM/cn_dicts" --out "$OUTPUT/out" --ref "$REF" \
  --builtin "$ROOT/vendor/pinyin_simp.dict.yaml" --hotwords "$INPUT/ninan-hotwords.txt" \
  --phrase-weights "$INPUT/phrase-weights.txt" --phrase-weights "$INPUT/everyday-phrases.txt" \
  --phrase-weights "$INPUT/place-names.txt" --phrase-weights "$INPUT/chat-phrases-preview.txt" \
  --phrase-weights "$INPUT/lexicon-expansion.txt" --additional-readings "$INPUT/lexicon-additional-readings.txt"
node --input-type=module - "$OUTPUT/out" "$INPUT/expected-manifest.json" <<'JS'
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [out,expected]=process.argv.slice(2);
const e=JSON.parse(readFileSync(expected));
for(const [name,sha,bytes] of [['hotwords.dict.yaml',e.sha256,e.bytes],['hotwords_auto.dict.yaml',e.auto.sha256,e.auto.bytes]]) {
 const data=readFileSync(`${out}/${name}`);
 if(data.length!==bytes||createHash('sha256').update(data).digest('hex')!==sha)throw new Error(`Mismatch: ${name}`);
}
if(!readFileSync(`${out}/manifest.json`).equals(readFileSync(expected)))throw new Error('Manifest mismatch');
console.log(`Verified ${e.version}: exact main, auto and manifest bytes`);
JS
