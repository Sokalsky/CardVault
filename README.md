# CardVault

CardVault is a private Pokémon collection manager and PSA pre-grading workflow. A card printing describes an issue/variant; every physical copy is a separate, permanently identified record with its own media, defects, grading history, values, and PSA lifecycle.

The repository preserves the current collection: 860 distinct physical cards, the canonical v24 workbook, 18 historical grading runs, and mappings for the separately stored photo archive. It does not contain the photo archive itself.

## Architecture

- `apps/web`: Next.js 16/TypeScript web application, server APIs, responsive collection/media/grading/submission screens, and read-only collection fallback when a database is unavailable.
- `database`: reproducible additive PostgreSQL/Supabase migrations. Row-level security is enabled and the media bucket is private.
- `services/video-worker`: Python/FastAPI worker using FFmpeg, OpenCV, exposure scoring, perceptual-hash de-duplication, retained frames, and contact sheets.
- `services/mcp-server`: authenticated Streamable HTTP MCP service with 12 focused tools for ChatGPT.
- `seed`: canonical collection JSON, original workbook, historical grading data, and photo mapping metadata.
- `scripts`: migration/data/workbook validation and the idempotent photo-archive importer.

CardVault does not use the OpenAI API. The web app stores and organizes collection data; ChatGPT retrieves selected media and writes results through MCP. No `OPENAI_API_KEY` is accepted or required.

## Data and valuation rules

Physical copies are never deduplicated by name, set, number, or variant. Each `physical_cards.id` UUID owns its media and history. Storage paths are scoped as `cards/{physical_card_id}/...`, and both web and worker validate that relationship.

Each grading run is immutable history with separate centering, corners, edges, and surface assessments; defects; PSA 1–10 probabilities; confidence; recommendation; timestamp; and rubric version. A re-grade appends a run.

Raw pricing uses TCGplayer first and PriceCharting second. PSA valuation uses exact-card, exact-variant, exact-grade PSA recent sales median when at least three usable sales exist, then PSA Estimate, then PriceCharting fallback. Sources, URLs, checked dates, methods, notes, and sale counts are retained.

Expected slab value is computed server-side from every nonzero probability, including PSA 5 and 6:

```text
Σ(P(grade) × value(grade)), grades 1 through 10
gross EV uplift = expected slab value - raw midpoint
```

Gross uplift is not net profit; it excludes grading, shipping, insurance, marketplace fees, taxes, and other costs.

## Quick start

Prerequisites: Node.js 22+, npm 10+, Python 3.12+, and FFmpeg for local video processing.

```powershell
npm ci
python -m venv services/video-worker/.venv
.\services\video-worker\.venv\Scripts\python.exe -m pip install -r services/video-worker/requirements.txt
npm run build
npm run typecheck
npm run lint
npm test
npm run validate:migrations
npm run validate:data
npm run validate:workbook
```

Without Supabase, `npm run dev:web` serves the preserved collection in explicitly read-only fallback mode. Database writes, signed uploads, and media processing require the environment documented in [SETUP.md](SETUP.md).

Service starts:

```powershell
npm run dev:web
.\services\video-worker\.venv\Scripts\python.exe -m uvicorn app:app --app-dir services/video-worker --host 127.0.0.1 --port 8000
npm run dev:mcp
```

Health endpoints are `http://localhost:3000/api/health`, `http://localhost:8000/health`, and `http://localhost:3001/health`.

## Documentation

- [SETUP.md](SETUP.md): clone-to-local setup
- [DEPLOYMENT.md](DEPLOYMENT.md): Supabase and Railway production deployment
- [MCP_SETUP.md](MCP_SETUP.md): connect the MCP service to ChatGPT Developer Mode
- [DATA_IMPORT.md](DATA_IMPORT.md): collection seed and photo archive import
- [VALIDATION.md](VALIDATION.md): reproducible validation and smoke tests
- [PROJECT_STATUS.md](PROJECT_STATUS.md): verified status and external blockers
