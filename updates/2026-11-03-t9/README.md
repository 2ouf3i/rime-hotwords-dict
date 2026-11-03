# Ninan T9 and next-word data, 2026-11-03

GPL-3.0 independent data update; these full-dictionary derivatives are not bundled in the application. T9 calibrates existing core vocabulary from the already published reviewed main dictionary 9e926c40 (source, frozen inputs and exact main reproduction: ../../scripts/reproduce-9e926c40.sh and release dict-9e926c40). The next-word table uses rime-ice base commit da1fbe602e38f26db846fa10120ee64c2b0324c0, Ninan reviewed successor phrases and filtering of weak word-internal fragments.

resources.json records exact payload hashes. toolchain/ contains corresponding build sources, pinned pinyin-pro 3.28.1, reviewed inputs, Apache base and OpenCC conversion data. source/base.dict.yaml is the frozen upstream base. No private input, user learning, application binary, private model or credential is included.

With Node22+ and OpenCC installed, run `cd toolchain/backend && npm ci --ignore-scripts`, then from this folder `bash reproduce.sh NEW_OUTPUT_DIR [REVIEWED_MAIN_DICT]`. If not supplied, the main input is fetched from the previously published GitHub release and verified by SHA. Both generated payloads are compared byte for byte including provenance headers. This is an offline data builder, not a client runtime release.

Licenses: repository GPL-3.0 and rime-ice notices apply to the derived payloads and upstream base. Bundled pinyin base and OpenCC data retain Apache-2.0 (../../licenses/Apache-2.0.txt). pinyin-pro retains MIT from npm. Some reviewed phrases are selected against Tatoeba Chinese examples under CC BY 2.0 FR; original credit lines remain in the inputs and T9 header. No third-party app code, artwork or private learning is distributed.
