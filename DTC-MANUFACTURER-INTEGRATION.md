# DTC manufacturer supplement — integration notes

## What changed

- Added a pinned copy of the upstream MIT-licensed SQLite data under `data/dtc-database/`.
- Generated `www/js/dtc-mfr-data.js` with 6,770 English definitions for 32 recognised makes. The source's generic rows and `OTHER` group are not copied into the runtime supplement.
- Added `www/js/dtc-mfr.js`, a strict make-and-code lookup helper. It does not guess unknown makes and has no network, storage, dynamic import, or command-execution behavior.
- The fault-code search and detail screens show manufacturer text only when the active garage vehicle's make matches a source manufacturer. Generic DTC details remain primary and unchanged.
- Added an explicit note that manufacturer text is English reference data and model/year/engine/ECU applicability has not been independently verified.
- Added regression tests and retained the upstream MIT license.

## Important limitations

This supplement does not add enhanced PIDs, ECU communication, ABS/SRS/TCM access, service functions, coding, or active tests. It is a text-reference dataset only. The source contains 76 Kia entries and no Hyundai entries. It contains no Kia-specific P0420 entry; the generic P0420 definition is still used.

## Security properties

- Runtime data is bundled locally and read-only.
- No additional runtime package or Android permission was added.
- No third-party workflow, Java wrapper, or TypeScript wrapper was copied.
- Input codes and manufacturer names are validated against a fixed whitelist.
- Source descriptions are inserted through the existing HTML-escaping helper (`esc`).
- Regeneration is offline-only and is blocked unless the SQLite file's SHA-256 and expected row counts match the reviewed source.

Run `npm test` for regression checks. Regenerate the supplement only with `python3 tools/build-mfr-dtc.py` after reviewing the source and intentionally updating the pinned hash/counts when needed.
