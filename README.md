# Ninan Rime dictionary data

Dictionary data and reproducible offline build scripts, derived from [rime-ice](https://github.com/iDvel/rime-ice) under [GPL-3.0](LICENSE). Generated files are published in [Releases](https://github.com/2ouf3i/rime-hotwords-dict/releases), separately from application binaries.

## Release fc34a9ed (2026-10-09)

The main table contains 894,098 entries. This release restores 2,922 missing readings of existing word forms and adds 849 common chat expressions. The 981,645-entry auto-reading table is unchanged. Existing hotwords, everyday phrases, and place-name additions are preserved.

The release deliberately appends to the previous e82c7503 table to reproduce the exact data tested on devices. The frozen baseline builder preserves that older table; the current builder fixes word-and-reading deduplication for future builds. The supplied scripts perform offline data transformations and do not upload or publish anything.

## Reproduce this release exactly

Use Node.js 20 or later and Git. Fetch the fixed upstream commit rather than the moving main branch:

```bash
git clone https://github.com/iDvel/rime-ice.git
git -C rime-ice checkout da1fbe602e38f26db846fa10120ee64c2b0324c0
bash scripts/reproduce-fc34a9ed.sh "$PWD/rime-ice" "$PWD/reproduced"
```

The final step checks both SHA256 hashes and byte counts against `inputs/2026-10-09/expected-manifest.json`. Exact build inputs, including the hotword snapshot, are included. No client settings, personal input, or learning databases are needed.

## Current builder

`build-pinyin-dict.mjs` imports `[base, ext, 8105, others]` with source priority for duplicate **word + reading** pairs. It retains all weights; a global minimum-frequency cutoff is not used. `tencent.dict.yaml` is kept in a separate auto-reading table. `41448.dict.yaml` is excluded. Existing words are not removed merely because they occur in the bundled legacy dictionary.

`--builtin`, `--hotwords`, `--ref`, and at least one `--phrase-weights` input are required. Multiple phrase inputs are accepted in priority order. `build-pinyin-emoji.mjs` and `build-next-word-table.mjs` generate separate optional resources; they are unchanged by this release.

Tests:

```bash
node --test scripts/build-pinyin-dict.test.mjs scripts/build-pinyin-readings-preview.test.mjs scripts/build-pinyin-preview.test.mjs
```

## Sources and licenses

See [NOTICE.md](NOTICE.md) for upstream data, attribution, and input provenance. The application and its source code are not part of this data repository.
