# Validation

## Reproducible checks

From a clean checkout with Node.js 22+ and Python 3.12+:

```powershell
npm ci
python -m venv services/video-worker/.venv
.\services\video-worker\.venv\Scripts\python.exe -m pip install -r services/video-worker/requirements.txt
python -m pip install -r scripts/requirements.txt

npm run build
npm run typecheck
npm run lint
npm test
npm run validate:migrations
npm run validate:data
npm run validate:workbook

Push-Location services/video-worker
.\.venv\Scripts\python.exe -m unittest test_worker.py
Pop-Location
.\services\video-worker\.venv\Scripts\python.exe -m unittest scripts/test_importer.py
.\services\video-worker\.venv\Scripts\python.exe -m py_compile services/video-worker/app.py scripts/import-photo-archive.py scripts/validate-workbook.py

npm --workspace services/mcp-server run build
node services/mcp-server/scripts/check-tools.mjs
node services/mcp-server/scripts/check-oauth.mjs
npm audit --audit-level=high
```

The migration validator applies the actual SQL files; it does not merely parse them. The data validator explicitly includes PSA 5 in an EV test. The OAuth smoke test launches and stops its own local service.

## Local runtime smoke test

With web environment configured, build and start:

```powershell
npm --workspace apps/web run build
npm --workspace apps/web run start -- --port 3020
```

Check:

- `/api/health` is public and reports the expected configuration state.
- `/` returns 401 without Basic credentials and 200 with them.
- `/collection`, `/grading`, and one `/cards/{id}` page render with credentials.
- Mobile-width navigation, tables/cards, upload controls, frame selection, and history remain usable.
- Signed resumable requests contain the server-issued `x-signature` JWS and never contain a publishable key, service-role key, or browser `Authorization` header.
- A failed direct upload is recorded, can be retried without duplicating the physical card, and can be reconciled against Storage to remove an empty placeholder.
- Ready-for-Grading is rejected while any upload/video is uploading, queued, processing, or failed.

For the worker, start Uvicorn and verify `/health` returns HTTP 200 with real FFmpeg/OpenCV versions. Generate a short synthetic video with FFmpeg and confirm frames are extracted. A full `/process` integration requires a configured Supabase job/video row.

## Production acceptance

After external provisioning:

1. Apply migrations to a backed-up Supabase project and seed exactly 821 active physical cards plus 39 reconciliation-archived rows and 18 imported grading runs.
2. Import the archive only after its 142-image dry-run succeeds.
3. Build/deploy all three Railway services and inspect logs.
4. Confirm web, worker, and MCP health responses as documented in [DEPLOYMENT.md](DEPLOYMENT.md).
5. Exercise an actual iPhone image upload and `.MOV` TUS upload, short video job, selected-frame update, paged OAuth ChatGPT retrieval, appended grade, and server-computed valuation.
6. Verify prior grading history and duplicate-copy media associations remain unchanged.
7. Confirm `git status --short` is empty and `origin/main` contains the final commit.

Do not mark remote Supabase, Railway, GitHub push, or ChatGPT connection as working until those checks occur against real URLs and logs.
