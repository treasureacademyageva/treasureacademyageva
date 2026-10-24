#!/usr/bin/env python3
"""Regenerate the root SQL mirror from every ordered versioned migration."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS = sorted((ROOT / "supabase" / "migrations").glob("*.sql"))
if not MIGRATIONS:
    raise SystemExit("No Supabase migrations found")

header = """-- SAFE ENTRY POINT — Treasure Academy secure portal and school-office schema
--
-- This file mirrors the versioned migrations listed below in order. It does
-- not apply itself, alter public.school_data, activate a feature gate or retire
-- a former object. Inventory, backup and isolated staging acceptance remain
-- mandatory before any controlled production migration.
--
"""
listing = "".join(f"--   supabase/migrations/{path.name}\n" for path in MIGRATIONS)
header += listing
header += "--\n-- Keep this mirror aligned whenever a versioned migration changes.\n"

parts = [header]
for path in MIGRATIONS:
    marker = (
        "\n-- ============================================================================\n"
        f"-- BEGIN MIRROR: {path.name}\n"
        "-- ============================================================================\n\n"
    )
    parts.append(marker)
    parts.append(path.read_text(encoding="utf-8").rstrip() + "\n")

(ROOT / "supabase-schema.sql").write_text("".join(parts), encoding="utf-8")
print(f"Regenerated supabase-schema.sql from {len(MIGRATIONS)} ordered migrations.")
