# First-time setup

## 1. Install prerequisites

- Node.js 22 or newer and npm 10 or newer
- Python 3.12 or newer
- FFmpeg on `PATH` for local video processing
- PostgreSQL `psql` only if applying migrations from the terminal

Clone and install exact JavaScript dependencies:

```powershell
git clone https://github.com/Sokalsky/CardVault.git
Set-Location CardVault
npm ci
```

Create the worker environment:

```powershell
python -m venv services/video-worker/.venv
.\services\video-worker\.venv\Scripts\python.exe -m pip install --upgrade pip
.\services\video-worker\.venv\Scripts\python.exe -m pip install -r services/video-worker/requirements.txt
```

## 2. Create Supabase resources

Create one Supabase project. Record its project URL, anon key, service-role key, and direct or session-pooler PostgreSQL URL. Never expose the service-role key through a `NEXT_PUBLIC_` variable.

Apply migrations in order using the Supabase SQL Editor, or with `psql`:

```powershell
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/0001_init.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/0002_production_hardening.sql
psql $env:DATABASE_URL -v ON_ERROR_STOP=1 -f database/0003_supabase_service_role.sql
```

The migration creates a private `grading-media` bucket, enables RLS on collection tables, and intentionally defines no anonymous table policies. Browser uploads use short-lived server-generated signed URLs; server operations use the service role.

## 3. Configure local environment

Copy `apps/web/.env.example` to `apps/web/.env.local`, and set:

```text
DATABASE_URL                 Supabase PostgreSQL connection string
SUPABASE_URL                 Project URL used only by server code
SUPABASE_SERVICE_ROLE_KEY    Service-role key used only by server code
MEDIA_BUCKET                 grading-media
NEXT_PUBLIC_APP_URL          http://localhost:3000
VIDEO_WORKER_URL             http://localhost:8000
VIDEO_WORKER_SECRET          long random shared secret
MCP_INTERNAL_TOKEN           different long random shared secret
CARDVAULT_WEB_USERNAME       local/private web username
CARDVAULT_WEB_PASSWORD       long web password
```

For the worker, set the variables from `services/video-worker/.env.example` in the shell or a local env loader. Use the same Supabase values, bucket, and `VIDEO_WORKER_SECRET` as the web app. Defaults are 4 sampled frames/second, 12 retained frames, and a 250 MB video limit.

For the MCP service, use the same `MCP_INTERNAL_TOKEN` and set:

```text
APP_INTERNAL_BASE_URL=http://localhost:3000
MCP_PUBLIC_URL=http://localhost:3001
MCP_AUTH_MODE=none
PORT=3001
```

`none` is loopback-only development mode. Production refuses to start without OAuth.

## 4. Seed preserved collection data

```powershell
npm --workspace apps/web run db:seed
```

The seed is idempotent by legacy physical-card ID and preserves each copy. Historical imports are tagged `chat-history-import` and are appended only once; later grading runs are never overwritten. See [DATA_IMPORT.md](DATA_IMPORT.md) for workbook and photo-archive checks.

## 5. Start services

Open three terminals:

```powershell
npm run dev:web
```

```powershell
$env:SUPABASE_URL='your project URL'
$env:SUPABASE_SERVICE_ROLE_KEY='your service-role key'
$env:MEDIA_BUCKET='grading-media'
$env:VIDEO_WORKER_SECRET='the shared worker secret'
.\services\video-worker\.venv\Scripts\python.exe -m uvicorn app:app --app-dir services/video-worker --host 127.0.0.1 --port 8000
```

```powershell
$env:APP_INTERNAL_BASE_URL='http://localhost:3000'
$env:MCP_INTERNAL_TOKEN='the shared MCP token'
$env:MCP_AUTH_MODE='none'
npm run dev:mcp
```

Verify:

```powershell
Invoke-RestMethod http://localhost:3000/api/health
Invoke-RestMethod http://localhost:8000/health
Invoke-RestMethod http://localhost:3001/health
```

The worker health response is HTTP 503 if FFmpeg or OpenCV is unavailable. Web pages require the configured HTTP Basic credentials. Internal MCP routes require the bearer token and are not accessible with the browser credentials.

## 6. Validate

Run the complete matrix in [VALIDATION.md](VALIDATION.md). A local application without Supabase is useful for read-only UI work, but it is not a production integration test.
