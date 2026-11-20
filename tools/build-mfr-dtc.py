#!/usr/bin/env python3
"""Build the offline manufacturer-specific DTC supplement from the pinned local SQLite source."""
from pathlib import Path
import hashlib
import json
import re
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / "data" / "dtc-database" / "dtc_codes.db"
OUT = ROOT / "www" / "js" / "dtc-mfr-data.js"
EXPECTED_SHA256 = "099a4ffd60398112a0540b0bbc93a5929e05e7f4e6d4988ca2a50858af01b743"
EXPECTED_ROWS = 6770
EXPECTED_MAKES = 32


def main() -> int:
    if not DB.is_file():
        raise SystemExit("Pinned DTC SQLite file is missing")
    digest = hashlib.sha256(DB.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit("DTC source hash mismatch; review the source before updating the pin")
    conn = sqlite3.connect(f"file:{DB.as_posix()}?mode=ro", uri=True)
    try:
        if conn.execute("PRAGMA quick_check").fetchone()[0] != "ok":
            raise SystemExit("SQLite integrity check failed")
        rows = conn.execute(
            "SELECT code, manufacturer, description FROM dtc_definitions "
            "WHERE is_generic=0 AND locale='en' AND manufacturer <> 'OTHER' "
            "ORDER BY manufacturer, code"
        ).fetchall()
    finally:
        conn.close()
    data = {}
    for code, make, description in rows:
        if not re.fullmatch(r"[PBCU][0-9A-F]{4}", code or ""):
            raise SystemExit(f"Invalid DTC code in source: {code!r}")
        if not re.fullmatch(r"[A-Z0-9]+", make or ""):
            raise SystemExit(f"Invalid make key in source: {make!r}")
        if not isinstance(description, str) or not description.strip() or len(description) > 600:
            raise SystemExit(f"Invalid description for {code}")
        bucket = data.setdefault(make, {})
        if code in bucket:
            raise SystemExit(f"Duplicate code: {make}/{code}")
        bucket[code] = description
    if len(rows) != EXPECTED_ROWS or len(data) != EXPECTED_MAKES or len(data.get("KIA", {})) != 76:
        raise SystemExit("Unexpected source counts; stop and review before rebuilding")
    payload = "// Offline, read-only manufacturer-specific DTC supplement. Generated from data/dtc-database/dtc_codes.db.\n"
    payload += "window.DTC_MFR_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    OUT.write_text(payload, encoding="utf-8")
    print(f"Generated {len(rows)} DTC definitions for {len(data)} makes: {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
