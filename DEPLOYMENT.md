# Production deployment

CardVault uses one Supabase project and three Railway services sourced from `main`. Do not deploy until the validation matrix passes and the Supabase project is backed up if it already contains data.

## 1. Supabase

Create the project, then apply `database/0001_init.sql`, `database/0002_production_hardening.sql`, and `database/0003_supabase_service_role.sql` in that order with `psql` and `ON_ERROR_STOP`, as shown in [SETUP.md](SETUP.md). These migrations are additive; none drops collection data. Do not re-create tables manually in the dashboard.

Before a schema change against populated production data:

1. Take a Supabase database backup.
2. Test the migration against a restored/staging database.
3. Run the committed migration once.
4. Verify row counts and recent grading/media records before accepting the deploy.

Run the canonical seed once after migrations:

```powershell
$env:DATABASE_URL='the Supabase PostgreSQL connection string'
npm --workspace apps/web run db:seed
```

The seed upserts all 860 physical cards by legacy ID and does not erase newer grading history. Confirm 860 rows in `physical_cards` and 18 imported rows in `grading_runs` before importing media.

## 2. Railway project and services

Authenticate the installed CLI with `railway login`, or create an empty project in the Railway dashboard. Add three services from `https://github.com/Sokalsky/CardVault`:

| Service | Root Directory | Config file | Public domain |
| --- | --- | --- | --- |
| `cardvault-web` | `/apps/web` | `/apps/web/railway.json` | Yes |
| `cardvault-video-worker` | `/services/video-worker` | `/services/video-worker/railway.json` | Yes, because the web invokes it over HTTPS |
| `cardvault-mcp` | `/services/mcp-server` | `/services/mcp-server/railway.json` | Yes, required by ChatGPT |

Railway does not automatically relocate a config file with a monorepo root directory, so set each absolute config-file path explicitly. Generate an HTTPS domain in each service's Settings → Networking panel. Do not guess these domains before Railway creates them.

The committed Dockerfiles and per-service lockfiles make each subdirectory an independent Docker build context. Health checks are already declared in `railway.json`.

With an authenticated and linked CLI, deployments can be triggered from the repository root:

```powershell
railway up ./apps/web --path-as-root --service cardvault-web --ci
railway up ./services/video-worker --path-as-root --service cardvault-video-worker --ci
railway up ./services/mcp-server --path-as-root --service cardvault-mcp --ci
```

For permanent GitHub deploys, keep each service connected to `main` with its root directory and config path set in Railway. The CLI `--path-as-root` commands are useful for the first smoke deployment.

## 3. Variables

Generate three independent random secrets, not one reused value:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"
```

Use one output for `VIDEO_WORKER_SECRET`, one for `MCP_INTERNAL_TOKEN`, and one for `MCP_OAUTH_SECRET`. Choose a separate memorable 12+ character `MCP_OAUTH_PASSWORD`, plus private web credentials.

### `cardvault-web`

```text
DATABASE_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
MEDIA_BUCKET=grading-media
NEXT_PUBLIC_APP_URL=https://<generated web domain>
VIDEO_WORKER_URL=https://<generated worker domain>
VIDEO_WORKER_SECRET
MCP_INTERNAL_TOKEN
CARDVAULT_WEB_USERNAME
CARDVAULT_WEB_PASSWORD
```

### `cardvault-video-worker`

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
MEDIA_BUCKET=grading-media
VIDEO_WORKER_SECRET
FRAME_SAMPLE_FPS=4
MAX_RETAINED_FRAMES=12
MAX_VIDEO_BYTES=262144000
```

`PORT` is injected by Railway. The worker service-role key and secret must match the web values.

### `cardvault-mcp`

```text
APP_INTERNAL_BASE_URL=https://<generated web domain>
MCP_INTERNAL_TOKEN
MCP_PUBLIC_URL=https://<generated MCP domain>
MCP_AUTH_MODE=oauth
MCP_OAUTH_PASSWORD
MCP_OAUTH_SECRET
MCP_ALLOWED_HOSTS=<generated MCP hostname without https://>
```

`MCP_INTERNAL_TOKEN` must match the web value. `MCP_PUBLIC_URL` is the origin, without `/mcp`. Production startup rejects missing internal credentials, `none` authentication, short OAuth secrets, or a localhost web target.

## 4. Production smoke test

After Railway reports successful health checks:

```powershell
Invoke-RestMethod https://<web-domain>/api/health
Invoke-RestMethod https://<worker-domain>/health
Invoke-RestMethod https://<mcp-domain>/health
```

Expected results:

- Web: `ok: true`, `databaseConfigured: true`, `storageConfigured: true`, `workerConfigured: true`.
- Worker: HTTP 200, `ffmpeg.available: true`, and `opencv.available: true`.
- MCP: `ok: true`, `authMode: oauth`, and `internalAuthConfigured: true`.

Then verify with private web credentials:

1. Collection row count is 860 and duplicate copies have different permanent UUIDs.
2. Upload a small front image and confirm its private storage path starts with that exact card UUID.
3. Upload a short video, wait for a completed job, review retained frames/contact sheet, and toggle selected frames.
4. Mark the card Ready for Grading and retrieve it through MCP.
5. Append a test grade, verify the prior grading run remains, then save values and verify the PSA 1–10 EV formula.

Inspect Railway deployment logs for all three services before treating the release as live. See [MCP_SETUP.md](MCP_SETUP.md) for the ChatGPT connection.
