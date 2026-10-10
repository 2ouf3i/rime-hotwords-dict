# Ninan Rime dictionary data

Dictionary data and reproducible offline build scripts, derived from [rime-ice](https://github.com/iDvel/rime-ice) under [GPL-3.0](LICENSE). Generated files are published in [Releases](https://github.com/2ouf3i/rime-hotwords-dict/releases), separately from application binaries.

## Release 3b76b062 (2026-10-11)

This release adds 317 distinct word forms and adjusts 110 existing word-and-reading weights relative to 9dadeaf4. The main table contains 897,596 entries; the 981,640-entry auto-reading table is byte-for-byte unchanged. Main, auto-reading and legacy tables contain 1,886,209 distinct strings. The new vocabulary includes 175 reviewed idioms/expressions and 142 daily/work terms. Readings and candidate conflicts were checked independently; weights were assigned by Ninan. See NOTICE.md for the chinese-xinhua MIT attribution and selection boundaries.

```bash
bash scripts/reproduce-3b76b062.sh "$PWD/rime-ice" "$PWD/reproduced-3b76b062"
```

The frozen builder and `inputs/2026-10-11-round4` reproduce exact main, auto-reading and manifest bytes using the same fixed upstream commit. Current normal builds use 4,409 primary expansion entries plus the existing additional-reading input. The tested incremental preview was 63b252aa; normal construction moves one unchanged supplementary-reading row after the new additions, producing 3b76b062. All rows and weights are identical between those two versions; full-pinyin and nine-key candidate equivalence was separately checked.

Quality and latency were measured with librime 1.16.1 and Octagram on a Mac, using isolated synthetic learning data. Phone latency and old-client download/compilation were not retested. Personal learning databases are neither distributed nor reset. Emoji, next-word data and the language model retain their existing OTA versions.

## Release 9dadeaf4 (2026-10-10)

This release adds 601 distinct word forms and one additional reading to the live fc1dcd4d dictionary, and adjusts 47 existing word-and-reading weights. The main table contains 897,279 entries and the auto-reading table 981,640. Main, auto-reading and legacy tables contain 1,885,892 distinct strings. Both `shui` and `shei` are supported for “这个是谁的”. The fc1dcd4d baseline already removed 914 main and five auto-reading rows containing ideographs that supported device fonts cannot render, and included two reviewed additions plus one weight adjustment; this release retains those changes.

```bash
bash scripts/reproduce-9dadeaf4.sh "$PWD/rime-ice" "$PWD/reproduced-9dadeaf4"
```

Use the fixed upstream commit described below. The script builds from `inputs/2026-10-10-round3` using the frozen builder `build-pinyin-dict-20261010.mjs` and verifies main, auto-reading and manifest bytes against the tested snapshot. The selected new words, exact weight overrides and additional reading are included for provenance; the complete reference exports are not required or distributed. Current normal builds use 4,092 primary expansion entries and a separate additional-readings input. An existing upstream reading keeps its upstream weight rather than being duplicated or overwritten.

Quality and latency were measured with librime 1.16.1 and Octagram on a Mac using isolated synthetic learning data. Phone latency and old-client download/compilation were not retested. Personal learning databases are neither included nor reset. Emoji, next-word data and the language model retain their existing OTA versions.

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

`--builtin`, `--hotwords`, `--ref`, and at least one `--phrase-weights` input are required. Multiple phrase inputs are accepted in priority order. Optional `--additional-readings` entries add independently reviewed pronunciations of existing words after weight application. Ideographs known to be unrenderable are filtered from both final tables. `build-pinyin-emoji.mjs` and `build-next-word-table.mjs` generate separate optional resources; they are unchanged by this release.

Tests:

```bash
node --test scripts/build-pinyin-dict.test.mjs scripts/build-pinyin-readings-preview.test.mjs scripts/build-pinyin-preview.test.mjs
```

## Sources and licenses

See [NOTICE.md](NOTICE.md) for upstream data, attribution, and input provenance. The application and its source code are not part of this data repository.
