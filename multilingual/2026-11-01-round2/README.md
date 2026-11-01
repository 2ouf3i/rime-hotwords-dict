# Multilingual lexicon enrichment, 2026-11-01, round 2

This is the exact seven-resource data snapshot and its reproducible editing layer. It is a patch to the existing eight-resource manifest; the Vietnamese syllable wordlist is unchanged and is not withdrawn. `resources.json` records content-addressed distribution objects with full SHA-256, sizes, counts and attribution. The final Chinese dictionary is a separate GPL-3.0 resource (`9e926c40`), not part of these seven files.

English adds 28 words and raises 120 editor-selected frequencies; mixed English adds 103 entries under the original selection rules. Zhuyin adds 105 reviewed Taiwan Mandarin word-readings. Korean retains all 30,000 baseline words/weights and adds 36 original everyday/modern forms. Japanese/Korean/Vietnamese next-word curation reviews 65/66/98 keys. Curation order and added weights are Ninan editorial decisions, not reference-application scores or measured corpus frequencies. Unreviewed next-word rows are preserved; some reviewed successors are removed or reordered. No new external source corpus was downloaded and no personal input or learning record is included.

Licensing remains per resource: AOSP English/mixed (Apache-2.0), McBopomofo/libtabe Zhuyin (MIT/BSD), FrequencyWords Korean/Vietnamese (CC BY-SA 4.0), and the existing OPUS/OpenSubtitles and Mozc citations/notices for next-word data. The original notices are retained verbatim under `notices/`; the repository root GPL license does not relicense these independent contents. The original/reviewed overlays are under `curation/` and in `frozen-inputs.json.gz`.

The frozen input contains audited revision-1 snapshots, the reviewed editing layer and the bundled AOSP-derived pinyin fallback used only by the mixed-English selector. With the previously approved, pinned McBopomofo `be6564acad6c4d3265c34a2e1a872d80f9db6068` Source/Data directory already available:

```sh
python3 multilingual/2026-11-01-round2/reproduce-offline.py \
  --zhuyin /existing/McBopomofo/Source/Data \
  --out /new/output/directory
```

This independently regenerates all seven exact distribution resources and checks full byte sizes and hashes. It does not download data, publish, install an App or modify a running keyboard. The next-word reconstruction uses the frozen audited baseline and explicit overlays; it does not claim to re-statistically-train from full original subtitles. Native consumer parity and local ranking/performance checks are development evidence, not independent user accuracy or phone performance. Native-language user naturalness remains untested.
