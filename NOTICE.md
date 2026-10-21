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

## 2026-10-09 second enrichment

The 451-entry second enrichment reuses the local reference lexical observations described above; no new source dataset was downloaded. Independently reviewed daily, work, food, and common product/application word forms were selected. The complete reference exports are not distributed. Readings were checked against existing dictionaries and pinyin-pro, and weights were assigned and conflict-adjusted by Ninan. The frozen final selected input is included, so exact reproduction does not require reference exports or private review tools. No personal user text or learning data is included.

## 2026-10-10 third enrichment

The 601 new word forms reuse the same locally available reference lexical observations, plus manually reviewed expressions; no new source dataset was downloaded. Forty-seven existing word-and-reading weights are adjusted using Ninan's candidate regression results. One additional reading is supplied explicitly; readings were cross-checked against independent existing compound entries and manually reviewed. Reference frequency scores and full reference exports are not distributed. The frozen normal-build inputs and builder reproduce the exact release independently from the fixed rime-ice commit. No personal learning database or user text is included.

## 2026-10-11 fourth enrichment

The fourth batch adds 317 distinct word forms: 175 reviewed idioms/expressions and 142 daily/work terms. It adjusts 110 existing word-and-reading weights, assigned by Ninan using full-pinyin and nine-key candidate regressions. The idioms were selected from a user-supplied word-form list (SHA256 `0d305c85ca8cd7d47b2a6a707b77a9240758df2b8b44595c8290a68956b87dd8`) and cross-checked against existing dictionary readings, pinyin-pro and [pwxcoo/chinese-xinhua](https://github.com/pwxcoo/chinese-xinhua/tree/fe6d6c2e8baa82187f4c96bbe042e43f96c05666). That project describes web-collected data; it is not an official pronunciation adjudication by Xinhua Publishing House. The downloaded idiom JSON has SHA256 `1d4b4f454ce1c416d6a1ab2369d6e66c0ff99e04390172eef70790499e21ce19`. Copyright (c) 2018 PWXCOO; its MIT license is included in `licenses/chinese-xinhua-MIT.txt`. No definitions, examples or complete source table are distributed.

The daily/work terms reuse the previously described user-provided local reference lexical observations. Complete reference exports and reference frequencies/scores are not distributed. All final readings were independently cross-checked, with explicit manual resolution of 市调/产调 (`diao`, referring to 调查). Frozen normal-build inputs reproduce the release without private source lists or review tools. No personal user text or learning data is included.

## 2026-10-13 next-word enrichment

The reviewed everyday contexts and successors are independently written and ordered by Ninan; no user messages, personal learning records or reference frequency scores are included. Five short, already-existing dictionary words (借钱, 人名, 信函, 信笺, 请柬) were suggested by pronunciation-explanation word-form observations in a locally supplied Sogou iOS 20.17.0 package. Their readings were independently confirmed using the pinned rime-ice/legacy dictionaries. Their successor words and order are Ninan's own work. No Sogou association model, decoded association-word pairs, application code, binary resources or complete export are distributed. The association resources were only decoded to internal word IDs and are not used by this build.

`inputs/2026-10-13-nextword` and `scripts/nextword-20261013` freeze the corresponding source inputs and builders. The generated full next-word table is distributed under GPL-3.0, following the rime-ice-derived release rules. The legacy dictionary's Apache-2.0 attribution is retained in this repository.

## 2026-10-14 public next-word enrichment

This batch independently writes and orders everyday continuations using the existing fixed inputs. It does not extract personal learning records or chat messages, download another corpus, or distribute reference applications, dictionary exports or model data. The complete public table remains GPL-3.0; the original conversational input is Apache-2.0. Frozen builders and inputs are in `scripts/nextword-20261014` and `inputs/2026-10-14-nextword`.

## 2026-10-17 fifth and sixth enrichment

This release adds 401 reviewed word forms and adjusts 18 existing word-and-reading weights. The candidate pool combines lexical observations from locally supplied WeChat 3.5.3 and Doubao 1.5.6 packages, the Sogou 20.17.0 Wubi word-form table, and the Typeless 2.7.0 simplified Rime table. The product owner is responsible for reference-data usage rights. Sogou Wubi supplies word forms, not pinyin or association mappings. The pool is only used to identify coverage gaps: complete exports, reference frequency scores, rankings, model data, application code and binary resources are not distributed. Readings are cross-checked independently; 重测 is explicitly reviewed as chong ce (re-testing). All weights and conflict caps are assigned by Ninan using candidate regressions. No personal user text or learning records are included. Frozen selected inputs and the builder reproduce the release without private reference exports. No new corpus was downloaded.

The latest authoritative admin hotword snapshot removes 不敌日本队; this removes exactly one auto-reading row relative to the offline candidate 043066f7, with the main table byte-for-byte unchanged. Frozen inputs in `inputs/2026-10-17-fusion` and `scripts/build-pinyin-dict-20261017.mjs` reproduce final version 1256dd19 via `scripts/reproduce-1256dd19.sh`. Full main and auto tables remain independently distributed under GPL-3.0. Emoji, next-word and language-model resources are unchanged.

## 2026-10-17 seventh enrichment and public-default filtering

This batch reuses the previously described local WeChat, Doubao, Sogou Wubi and Typeless lexical observations. It adds 98 reviewed word forms and independently adjusts 10 existing word-and-reading weights. Final readings and weights are included in the frozen build inputs. Complete reference exports, source scores, binaries, model data and personal learning records are not distributed. No new external source was downloaded. The product owner remains responsible for reference-data usage rights.

Public-default association filtering adds two short terms to Ninan's existing blocklist, following a limited review of locally supplied reference resources. It does not import a complete third-party blacklist or rule model. The main pinyin dictionary is not modified by this association filter. The exact blocklist, original conversational input and frozen builders are included for reproduction; application code, reverse-engineering disassemblies and original reference resources are not included in this public data repository. Full generated tables remain independently distributed under GPL-3.0, and legacy Apache-2.0 attribution is retained.

## 2026-10-18 eighth enrichment

This batch reuses the previously described local WeChat 3.5.3, Doubao 1.5.6, Sogou Wubi 20.17.0 and Typeless Simplified Chinese 2.7.0 lexical observations. It adds 101 reviewed word forms and independently adjusts 12 existing word-and-reading weights. Final readings and weights are included in frozen build inputs. Conflicting readings were held for review rather than accepted by source count. Complete reference exports, source scores, binaries, models, disassemblies and personal learning records are not distributed. No new external source was downloaded. The product owner remains responsible for reference-data usage rights. The complete generated dictionary remains independently distributed under GPL-3.0; existing attribution and license boundaries are preserved.

## 2026-10-19 ninth enrichment

This batch reuses the previously described local WeChat 3.5.3, Doubao 1.5.6, Sogou Wubi 20.17.0 and Typeless Simplified Chinese 2.7.0 lexical observations. Of 1,014 manually selected candidates, 19 were already present and 22 were held for reading, orthography, source or context review; 973 new word forms were retained. Each retained form occurred in at least two of these source observations, which does not imply independent ancestry or measured frequency. Final readings, collision limits and the 9 existing weight adjustments were specified by Ninan and are included in the frozen inputs. Complete reference exports, scores, binaries, models, disassemblies and personal learning records are not distributed. No new external source was downloaded. The product owner remains responsible for reference-data usage rights. Complete generated dictionary tables remain independently distributed under GPL-3.0 with existing attribution and license boundaries retained.

## 2026-10-22 tenth enrichment

Reuses the previously documented local WeChat 3.5.3, Doubao 1.5.6, Sogou Wubi 20.17.0 and Typeless Simplified Chinese 2.7.0 observations, without new downloads or personal input records. The 547 accepted expressions occur in one (448), two (98), or three (1) of these reference observations; source counts do not establish frequency or independent ancestry. Readings were checked using existing Rime data, segmentation and pinyin-pro paths and reviewed by meaning. Ninan assigned weights independently; reference scores, complete exports, models, binaries and personal learning data are not distributed. The product owner remains responsible for reference-data usage rights. Complete generated tables remain independently distributed under GPL-3.0 with existing attribution and licensing boundaries.

The final frozen hotword input also includes the two public admin-accepted terms 红果短剧 and 田柯宇, observed in the latest backend snapshot before release; they are not counted among the 547 manually reviewed reference expressions.

## 2026-10-22 eleventh enrichment

Reuses the previously described local lexical-observation pool without new source downloads. The 1,014 accepted forms occur in one (977) or two (37) observations; counts do not establish measured frequency or independent ancestry. Readings were cross-checked using existing Rime entries, segmentation, pinyin-pro and manual review by meaning. Ninan independently assigned all weights, collision caps and the 12 existing weight adjustments. The product owner remains responsible for reference-data usage rights. Complete reference exports, source frequency scores, models, binaries, disassemblies and personal input/learning data are not distributed. Frozen selected inputs reproduce the exact release without the private source pool. The complete generated tables remain independently distributed under GPL-3.0, with the existing attribution and license boundaries retained.
