# Collection and media import

## Preserved sources

- `seed/source/collection-v24.xlsx`: original source workbook.
- `seed/collection.json`: canonical normalized import, 860 physical cards.
- `apps/web/src/data/collection.json`: byte-identical read-only application fallback.
- `seed/source/photos-manifest.csv`: 142 archived image entries with checksums.
- `seed/photos-map.json`: archive folder-to-legacy-card mapping for 16 exact physical copies.

The JSON includes 18 historical grading records from the existing work. These are real preserved inputs, not demo grades. The separately delivered photo/video archive remains outside Git and belongs in private Supabase Storage.

## Validate source integrity

Install importer/validator dependencies once:

```powershell
python -m pip install -r scripts/requirements.txt
```

Then run:

```powershell
npm run validate:data
npm run validate:workbook
```

The first check verifies canonical/fallback JSON equality, unique legacy IDs, copy separation, historical grading counts, media mapping/manifest counts, EV behavior including PSA 5, and absence of an OpenAI dependency. The workbook check independently compares all 860 identities and raw prices to `All Physical Cards` in the v24 workbook.

## Seed PostgreSQL

After both database migrations are applied:

```powershell
$env:DATABASE_URL='your Supabase PostgreSQL URL'
npm --workspace apps/web run db:seed
```

The seed:

- upserts physical cards by `legacy_master_id`;
- matches/creates printings by exact name, number, set, and variant;
- retains a separate UUID and copy label for every physical copy;
- imports the 18 historical grading runs only when that card has no `chat-history-import` run;
- does not delete or overwrite later ChatGPT grading runs;
- preserves raw/as-is values, decision, notes, source context, probabilities, grade values, and available centering measurements.

Run the command again safely after a failed/partial seed. Confirm production counts before importing media.

## Photo archive format

The importer accepts the existing three-level layout, with or without an additional archive root directory:

```text
Card_Name/Copy_1/image.jpg
optional-prefix/Card_Name/Copy_1/image.jpg
```

Folder matching is case-insensitive and based on the last card/copy path segments. It never guesses an unmapped copy. Every image is limited to 25 MB, checked against the manifest SHA-256 when present, and written beneath the mapped permanent UUID:

```text
cards/{physical_card_id}/photos/import-{checksum-prefix}-{safe-filename}
```

An identical image/path is matched idempotently in `media_assets`. Unmapped folders are reported and skipped instead of being assigned to a similar printing.

## Dry-run, then import

Keep the archive outside this repository. First validate it without credentials or uploads:

```powershell
python scripts/import-photo-archive.py C:\path\to\card-photos.zip --dry-run
```

The current archive should map 142 manifest images. Investigate checksum failures or an unexpected mapped count before continuing.

For the real import, use server credentials only in the current shell or a secret manager:

```powershell
$env:SUPABASE_URL='your project URL'
$env:SUPABASE_SERVICE_ROLE_KEY='your service-role key'
$env:MEDIA_BUCKET='grading-media'
python scripts/import-photo-archive.py C:\path\to\card-photos.zip
```

Never put the service-role key in a browser variable, command history shared with others, or Git. After import, spot-check duplicate printings with multiple copies and confirm every media row/path belongs to the intended physical UUID.

## Future spreadsheet revisions

Treat `seed/collection.json` as a generated migration input, not a disposable demo fixture. Before replacing it:

1. Preserve the source workbook under `seed/source` with an explicit version.
2. Maintain stable legacy master IDs for existing physical copies.
3. Assign a new unique ID to every newly discovered physical copy.
4. Never infer or normalize away an uncertain variant.
5. Run both validators and review count/value changes before seeding.
