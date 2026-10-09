# Data sources and licenses

## rime-ice — GPL-3.0

[rime-ice](https://github.com/iDvel/rime-ice), by iDvel and contributors. This release uses commit `da1fbe602e38f26db846fa10120ee64c2b0324c0`. Its dictionary source comments retain the original upstream credits. The generated derivative dictionaries and our build scripts are distributed under GPL-3.0; see LICENSE.

## Legacy pinyin dictionary — Apache-2.0

`vendor/pinyin_simp.dict.yaml` derives from Rime pinyin-simp and [AOSP PinyinIME](https://android.googlesource.com/platform/packages/inputmethods/PinyinIME/). Copyright 2009 The Android Open Source Project. Its AOSP source attribution remains in the file; the Apache license is included in `licenses/Apache-2.0.txt`. It is a build input; modern builds do not delete overlapping upstream entries.

## Everyday phrases — Tatoeba, CC BY 2.0 FR

Some short everyday expressions were selected from [Tatoeba contributors’ Chinese sentences](https://tatoeba.org/en/downloads), licensed under [CC BY 2.0 FR](https://creativecommons.org/licenses/by/2.0/fr/). The source export URL and SHA256 are documented in `scripts/mine-everyday-phrases.mjs`. The inputs contain short lexical expressions and occurrence-derived weight tiers rather than the complete sentence corpus. The transformation includes simplified-character normalization and manual selection. Attribution is retained in both generated dictionary headers.

## Place names — THUOCL and administrative data

Frequency evidence uses [THUOCL](https://github.com/thunlp/THUOCL), copyright 2018 THUNLP, under MIT; the complete notice is in `licenses/THUOCL-LICENSE`.

Place-name facts also use [Administrative-divisions-of-China](https://github.com/modood/Administrative-divisions-of-China), under WTFPL. The data is organized from published administrative division codes. `scripts/gen-place-names.mjs` documents exact source hashes and transformations. Readings are checked against existing dictionaries and our manually reviewed input.

## Ninan inputs and chat expressions

The hotword snapshot and manually prepared phrase/readings inputs are included to make the release reproducible. The 849 short common chat expressions were selected from lexical observations of a reference application provided by the user. The complete exported reference dictionary is not distributed. Pronunciations were independently checked using our existing dictionaries and pinyin-pro; weights were assigned independently. Reference frequencies, rankings, language models, prediction data, correction rules, and executable code are not included. The input file records source hashes and selection scope.

No personal user text or user learning database is included. Auxiliary generation may use opencc-js and pinyin-pro, which keep their own upstream licenses and are not bundled into generated data files.

## 2026-10-09 expansion

The 3,040-entry expansion contains reviewed everyday and work vocabulary plus complete chat expressions, using user-provided local WeChat and Doubao keyboard lexical observations to identify missing word forms. It also includes 220 expressions selected from the previously downloaded Tatoeba Chinese sentence export described above. The product owner is responsible for the reference-data usage rights. The complete reference exports are not distributed. Readings were independently cross-checked; weights and conflict adjustments were assigned by Ninan, without distributing reference frequency scores, model data, or executable code. The frozen selected input is included, so exact reproduction does not require those reference exports.
