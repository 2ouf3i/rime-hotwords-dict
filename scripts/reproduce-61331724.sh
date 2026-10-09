#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM="${1:?Usage: reproduce-61331724.sh <rime-ice checkout> <new output directory>}"
OUTPUT="${2:?Specify a new output directory}"
[[ ! -e "$OUTPUT" ]] || { echo "Output already exists" >&2; exit 1; }
mkdir -p "$OUTPUT"
bash "$ROOT/scripts/reproduce-34da8ee0.sh" "$UPSTREAM" "$OUTPUT/previous"
INPUT="$ROOT/inputs/2026-10-09-round2"
node "$ROOT/scripts/build-pinyin-preview.mjs" \
  --baseline "$OUTPUT/previous/out" --table "$INPUT/lexicon-enrichment-round2.txt" --out "$OUTPUT/out"
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
