# CardVault project status

Status date: 2026-08-19. “Working” means exercised locally in this repository; external services are not claimed healthy without a public health response or owner-provided deployment logs.

## Working

- Next.js production build, TypeScript, ESLint, unit tests, dependency audit, and authenticated HTTP page smoke tests.
- Responsive dashboard, card-list collection search/filtering, physical-card detail, one-pick mixed photo/video upload, media selection, grading queues/batch prompt preparation, gross-EV PSA submission candidates, and atomic exact-copy draft batch creation.
- Path-scoped signed standard/TUS uploads with no browser Supabase credential, strict compact-JWS/expiry validation before any Storage request, independent per-file failure handling, retry-safe rows, and a readiness gate that excludes unfinished/failed cards from both UI and MCP queues. The web UI cannot delete stale placeholders; `database/maintenance` contains a review-only, rollback-by-default cleanup proposal.
- Read-only local fallback containing all 821 active physical cards; write actions fail closed until Supabase is configured.
- Three additive migrations validated by applying them to an embedded PostgreSQL-compatible database; 10 required tables, RLS, service-role access, constraints, triggers, indexes, private storage bucket setup, and separate-copy behavior checked.
- Idempotent seed/import logic for 821 active cards plus 39 reconciled archived rows. All 18 historical grading results remain preserved, and v25 workbook identities/prices match canonical JSON for every active record.
- Photo importer supports the real three-level archive paths, validates checksums/size, maps exact copies, and generates idempotent UUID-scoped private storage paths. Mapping tests pass.
- Video worker dependencies/imports, scoring unit tests, Python compilation, real FFmpeg extraction, and live health endpoint. Dockerfile installs FFmpeg and image libraries.
- Video job ownership validation, asynchronous durable queue/poller, restart recovery, three-attempt failure diagnostics, bounded input/timeout/frame count, sharpness/exposure scoring, perceptual de-duplication, retained frames, per-source contact sheets, and cleanup of prior derived output.
- MCP TypeScript build/tests and 12 tool schemas. Media metadata is never truncated, while image contents support repeatable `imageOffset` pagination beyond the 20-content call limit. Unauthenticated loopback discovery and full OAuth dynamic-registration/PKCE/token/authenticated-discovery smoke tests pass.
- Production protection: web HTTP Basic gate, separate internal bearer token, OAuth MCP, worker shared secret, constant-time secret comparisons, private/signed media URLs, exact UUID ownership checks, type/size limits, and server-only service-role usage.
- No OpenAI SDK, endpoint, grading call, API key, or inference requirement.
- Independent Docker/Railway definitions and lockfiles for all three services, plus health checks and complete setup/deployment documentation.
- Git repository initialized on `main`, `origin` set to `https://github.com/Sokalsky/CardVault.git`, logical commits pushed, and the remote head verified.
- The signed-upload request builder is covered by tests proving that `Authorization` and `apikey` are absent, while malformed, expired, null, undefined, bearer-prefixed, and publishable-key values are rejected locally.

## Needs external setup

- The Railway services use GitHub deployment, but Railway dashboard-side logs, variables, deployment status, and manual controls remain owner-managed because this environment is not linked to the Railway account.
- No Supabase production operation is authorized from this environment. The owner must perform the real post-fix iPhone `.MOV` retry and verify its Storage row/job/frames; no anonymous-user Auth or Storage-policy change is required by the pre-signed upload architecture.
- Docker Desktop/Engine is not installed, so Dockerfiles cannot be built locally. The same application/package installs and service entrypoints are validated outside containers; Railway builds remain the container integration check.
- ChatGPT connection requires the deployed public MCP HTTPS URL and the owner's Developer Mode action.

## Future improvements

- Add a configurable cost model (grading tier, two-way shipping, insurance, selling fees, and taxes) beside the deliberately gross EV metric.
- Add draft-batch editing/status transitions and PSA cert/result reconciliation UI on top of the existing batch/item schema.
- Add scheduled, source-compliant TCGplayer/PriceCharting/PSA valuation refresh with human review and exact-variant safeguards.
- Replace single-owner HTTP Basic protection with Supabase Auth/passkeys if CardVault gains multiple users.
- Add production backup/restore drills, database-atomic worker claims for multiple replicas, and operational alerts.
