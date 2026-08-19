#!/usr/bin/env python3
"""Idempotently import the preserved card-photo archive into private Supabase Storage."""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import mimetypes
import os
import re
import zipfile
from pathlib import Path, PurePosixPath

from supabase import create_client

ROOT = Path(__file__).resolve().parents[1]
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"}
MAX_IMAGE_BYTES = 25 * 1024 * 1024


def normalized(value: str) -> str:
    return value.replace("\\", "/").strip("/").casefold()


def clean_filename(value: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", Path(value).name)[-120:]


def load_manifest() -> dict[str, dict[str, str]]:
    with (ROOT / "seed/source/photos-manifest.csv").open(newline="", encoding="utf-8-sig") as handle:
        return {normalized(row["archive_filename"]): row for row in csv.DictReader(handle)}


def locate_mapping(parts: tuple[str, ...], folder_map: dict[str, int]) -> tuple[str, int] | None:
    if len(parts) < 3:
        return None
    folder_key = f"{parts[-3]}/{parts[-2]}"
    legacy_id = folder_map.get(normalized(folder_key))
    return (folder_key, legacy_id) if legacy_id is not None else None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("archive", type=Path, help="Photo archive zip path")
    parser.add_argument("--dry-run", action="store_true", help="Validate mappings/checksums without uploading")
    args = parser.parse_args()
    if not args.archive.is_file():
        raise SystemExit(f"Archive not found: {args.archive}")

    raw_map = json.loads((ROOT / "seed/photos-map.json").read_text(encoding="utf-8"))
    folder_map = {normalized(key): int(value) for key, value in raw_map.items()}
    manifest = load_manifest()
    supabase = None
    bucket = os.getenv("MEDIA_BUCKET", "grading-media")
    if not args.dry_run:
        url = os.environ.get("SUPABASE_URL")
        service_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not service_key:
            raise SystemExit("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run is used.")
        supabase = create_client(url, service_key)

    mapped = imported = skipped = 0
    with zipfile.ZipFile(args.archive) as archive:
        entries = [entry for entry in archive.infolist() if PurePosixPath(entry.filename).suffix.lower() in IMAGE_SUFFIXES]
        for entry in entries:
            parts = PurePosixPath(entry.filename).parts
            mapping = locate_mapping(parts, folder_map)
            if not mapping:
                print(f"skip unmapped folder: {entry.filename}")
                skipped += 1
                continue
            _, legacy_id = mapping
            data = archive.read(entry)
            if not data or len(data) > MAX_IMAGE_BYTES:
                print(f"skip invalid size: {entry.filename} ({len(data)} bytes)")
                skipped += 1
                continue
            digest = hashlib.sha256(data).hexdigest()
            manifest_row = manifest.get(normalized("/".join(parts[-3:])))
            if manifest_row and manifest_row.get("sha256") and manifest_row["sha256"].casefold() != digest:
                raise SystemExit(f"Checksum mismatch for {entry.filename}")
            mapped += 1
            if args.dry_run:
                continue

            assert supabase is not None
            rows = supabase.table("physical_cards").select("id").eq("legacy_master_id", legacy_id).limit(1).execute().data
            if not rows:
                print(f"skip: no physical card for legacy id {legacy_id}")
                skipped += 1
                continue
            card_id = rows[0]["id"]
            filename = clean_filename(parts[-1])
            storage_path = f"cards/{card_id}/photos/import-{digest[:16]}-{filename}"
            mime = mimetypes.guess_type(filename)[0] or "image/jpeg"
            existing = supabase.table("media_assets").select("id").eq("storage_path", storage_path).limit(1).execute().data
            if not existing:
                supabase.storage.from_(bucket).upload(storage_path, data, {"content-type": mime, "upsert": "true"})
                supabase.table("media_assets").insert({
                    "physical_card_id": card_id,
                    "kind": "image",
                    "capture_type": "imported_grading_photo",
                    "storage_path": storage_path,
                    "original_filename": filename,
                    "mime_type": mime,
                    "byte_size": len(data),
                    "processing_status": "ready",
                    "selected_for_grading": True,
                }).execute()
            imported += 1
            print(f"imported {legacy_id}: {filename}")

    print(f"Validated {mapped} mapped images; imported/idempotently matched {imported}; skipped {skipped}.")
    if mapped != len(manifest):
        print(f"Warning: manifest contains {len(manifest)} rows; archive mapped {mapped} images.")


if __name__ == "__main__":
    main()
