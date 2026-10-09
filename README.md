# Ninan Rime dictionary data

Dictionary data and reproducible offline build scripts, derived from [rime-ice](https://github.com/iDvel/rime-ice) under [GPL-3.0](LICENSE). Generated files are published in [Releases](https://github.com/2ouf3i/rime-hotwords-dict/releases), separately from application binaries.

## Release 61331724 (2026-10-09)

This release adds 451 reviewed word forms to 34da8ee0. The main table contains 897,589 entries; the 981,645-entry auto-reading table is unchanged. Including the legacy table, there are 1,886,191 distinct strings. Existing dictionary bytes and personal learning data are preserved. Readings were cross-checked independently and weights calibrated with full-pinyin and nine-key regression checks.

Using the same fixed upstream checkout described below, run:

```bash
bash scripts/reproduce-61331724.sh "$PWD/rime-ice" "$PWD/reproduced-61331724"
```

The script reproduces 34da8ee0, appends the frozen selected input in `inputs/2026-10-09-round2`, and verifies both SHA256 hashes and byte counts. This batch was validated with librime 1.16.1 on a Mac; phone latency and installation were not measured in this batch. The `dict/lexicon-expansion.txt` input for future normal builds contains all 3,491 additions from these two expansion batches. Emoji, next-word data, and the language model are unchanged.

## Release 34da8ee0 (2026-10-09)

This release adds 3,040 distinct word forms to fc34a9ed. The main table contains 897,138 entries; the 981,645-entry auto-reading table is unchanged. Main, auto-reading, and legacy tables contain 1,885,740 distinct strings in total. Existing dictionary bytes are preserved; reviewed expressions are appended with independently checked readings and assigned weights. Offline full-pinyin and nine-key conflict checks protect existing correct first candidates. Personal learning data is not included or reset.

Use the same fixed upstream checkout described below, then run:

```bash
bash scripts/reproduce-34da8ee0.sh "$PWD/rime-ice" "$PWD/reproduced-34da8ee0"
```

The script reproduces the previous release, appends `inputs/2026-10-09-expansion/lexicon-expansion.txt`, and verifies both hashes against its expected manifest. These exact files were compiled successfully on iPhone and Fold before publication. Candidate and latency measurements made on a computer are not phone performance measurements.

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
