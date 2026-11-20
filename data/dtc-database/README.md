# AC OBD — manufacturer-specific DTC supplement

This supplement is derived from the `dtc-database` project by Wal33D (Waleed Judah), licensed under MIT. The original license is retained in this directory.

- Upstream project: https://github.com/Wal33D/dtc-database
- Local source: `dtc_codes.db`
- Source SHA-256: `099a4ffd60398112a0540b0bbc93a5929e05e7f4e6d4988ca2a50858af01b743`
- Imported records: 6,770 English manufacturer-specific definitions
- Included makes: 32 (the source `OTHER` group is deliberately excluded)
- Kia records: 76
- Hyundai records: 0
- Locale: English only

The AC OBD app already carries the OBDex generic DTC dataset. This supplement is used only as a separate manufacturer note when the active vehicle make matches. It never replaces a generic definition and it is not proof that a code applies to every model, year, engine or ECU from that manufacturer. It is not a factory service manual and must not be used alone to recommend a repair.

The source has no model/year/engine applicability table. Missing entries mean “no matching record in this dataset”, not “the vehicle does not support this code”. In particular, this dataset has no Kia-specific P0420 definition; the generic P0420 explanation remains the correct displayed base entry.

## Security and build

The app ships the generated `www/js/dtc-mfr-data.js` as static read-only text data. Runtime lookup performs no HTTP request, telemetry, file write, dynamic code loading, shell command or third-party API call. All dynamic descriptions are HTML-escaped before display.

To regenerate, run `python3 tools/build-mfr-dtc.py` from the project root. The builder reads only the local SQLite file, opens it read-only, checks SQLite integrity and validates a pinned SHA-256 and record counts. Any source change stops the build until explicitly reviewed. Do not import the upstream Android module, CI workflow or TypeScript dependencies into AC OBD.
