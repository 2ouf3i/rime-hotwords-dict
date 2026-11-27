# Nine-key pinyin initials ranking, 2026-11-27

This standalone T9 v3 table adjusts candidates for 72 everyday expressions when entering syllable initials. Ninan added 43 existing Chinese dictionary expressions to the reviewed T9 word list and revised 29 editorial weights. The Chinese reference dictionary is ee249d04.

To reproduce the table, use Node.js 22 or later and OpenCC. Run npm ci --ignore-scripts in toolchain/backend, then run the following command from this directory with the ee249d04 main dictionary.

    bash reproduce.sh /path/to/new-output /path/to/hotwords.dict.yaml

The script checks the reference dictionary digest and compares the generated table byte for byte with files/t9_completions.tsv. The digests and counts are in resources.json. See the root NOTICE.md and licenses directory for the base data, Tatoeba and OpenCC attributions.
