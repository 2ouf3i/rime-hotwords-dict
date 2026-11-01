# Multilingual lexicon snapshot, 2026-11-01

These are the eight exact frozen text resources used by the reviewed Ninan mobile build and this first multilingual OTA publication. `resources.json` records original byte counts, entry counts, source attribution and full SHA-256. The data files retain their source headers. The existing source/generation notices are copied verbatim under `notices/`; delivery-path descriptions in those earlier notices may predate the new OTA channel.

Licensing is per resource: English/mixed English retain AOSP Apache-2.0 attribution; Zhuyin retains McBopomofo MIT/libtabe BSD attribution; Korean/Vietnamese frequency data retain Hermit Dave CC BY-SA 4.0 attribution and the same content license; OPUS next-word data retain the original OPUS/OpenSubtitles citations and Japanese segmentation provenance. The repository GPL license does not replace those resource-specific notices. Ninan original curation is recorded under `curation/`. Personal user text/learning records, full reference-application exports, binaries, model data and disassemblies are not included. No new external corpus was downloaded for this release.

The public snapshot itself is the complete immutable input for the content-addressed publisher. To reproduce and verify the eight distribution objects in a fresh directory:

```sh
python3 scripts/reproduce-multilingual-20261101.py /new/output/path
```

This copies only the frozen data after validating the exact bytes and hash, and writes matching metadata. It does not download corpora or change a running keyboard. Rebuilding from raw upstream corpora is a separate process described by the generation/source notices, not a claim made by this artifact-copy verifier.
