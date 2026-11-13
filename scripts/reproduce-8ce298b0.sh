#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM="${1:?Usage: reproduce-8ce298b0.sh <pinned cn_dicts directory> <new output directory>}"
OUTPUT="${2:?Specify a new output directory}"
REF=da1fbe602e38f26db846fa10120ee64c2b0324c0
node --input-type=module - "$UPSTREAM" "$ROOT/inputs/2026-11-13-t9-homocode/upstream-sha256.json" <<'JS'
import {readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const [source,expected]=process.argv.slice(2);
for(const [name,sha] of Object.entries(JSON.parse(readFileSync(expected))))if(createHash('sha256').update(readFileSync(`${source}/${name}`)).digest('hex')!==sha)throw Error('Pinned upstream bytes mismatch: '+name);
JS
[[ ! -e "$OUTPUT" ]] || { echo "Output already exists" >&2; exit 1; }
INPUT="$ROOT/inputs/2026-11-13-t9-homocode"
node "$ROOT/scripts/build-pinyin-dict-20261017.mjs" \
  --in "$UPSTREAM" --out "$OUTPUT/out" --ref "$REF" \
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
