create table if not exists card_printings (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  card_number text,
  set_name text,
  year integer,
  variant text,
  category text,
  source_url text,
  created_at timestamptz not null default now(),
  unique (name, card_number, set_name, variant)
);

create table if not exists physical_cards (
  id uuid primary key default gen_random_uuid(),
  legacy_master_id integer unique,
  card_printing_id uuid not null references card_printings(id) on delete cascade,
  copy_label text,
  copy_number integer,
  raw_low numeric(12,2),
  raw_high numeric(12,2),
  raw_mid numeric(12,2),
  as_is_low numeric(12,2),
  as_is_high numeric(12,2),
  as_is_mid numeric(12,2),
  value_bucket text,
  condition_note text,
  notes text,
  grading_status text not null default 'ungraded',
  latest_likely_grade numeric(4,1),
  latest_grade_label text,
  latest_expected_value numeric(12,2),
  latest_ev_uplift numeric(12,2),
  submission_decision text,
  sleeve boolean not null default false,
  toploader boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_physical_cards_printing on physical_cards(card_printing_id);
create index if not exists idx_physical_cards_status on physical_cards(grading_status);
create index if not exists idx_physical_cards_legacy on physical_cards(legacy_master_id);

create table if not exists media_assets (
  id uuid primary key default gen_random_uuid(),
  physical_card_id uuid not null references physical_cards(id) on delete cascade,
  kind text not null check (kind in ('image','video','centering','contact_sheet')),
  capture_type text not null default 'grading_photo',
  storage_path text not null,
  original_filename text,
  mime_type text,
  byte_size bigint,
  width integer,
  height integer,
  duration_ms integer,
  processing_status text not null default 'ready',
  selected_for_grading boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_media_assets_card on media_assets(physical_card_id);

create table if not exists extracted_frames (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid not null references media_assets(id) on delete cascade,
  physical_card_id uuid not null references physical_cards(id) on delete cascade,
  storage_path text not null,
  timestamp_ms integer,
  sharpness_score numeric(12,4),
  perceptual_hash text,
  selected_for_grading boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_extracted_frames_card on extracted_frames(physical_card_id);

create table if not exists grading_runs (
  id uuid primary key default gen_random_uuid(),
  physical_card_id uuid not null references physical_cards(id) on delete cascade,
  grader text not null default 'chatgpt',
  rubric_version text not null default 'psa-strict-v1',
  centering_grade text,
  centering_notes text,
  corners_grade text,
  corners_notes text,
  edges_grade text,
  edges_notes text,
  surface_grade text,
  surface_notes text,
  likely_grade numeric(4,1),
  likely_grade_label text,
  probability_5 numeric(6,4),
  probability_6 numeric(6,4),
  probability_7 numeric(6,4),
  probability_8 numeric(6,4),
  probability_9 numeric(6,4),
  probability_10 numeric(6,4),
  confidence numeric(6,4),
  decision text,
  notes text,
  source_context jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_grading_runs_card_created on grading_runs(physical_card_id, created_at desc);

create table if not exists grading_defects (
  id uuid primary key default gen_random_uuid(),
  grading_run_id uuid not null references grading_runs(id) on delete cascade,
  physical_card_id uuid not null references physical_cards(id) on delete cascade,
  side text,
  region text,
  category text,
  severity text,
  description text not null,
  media_asset_id uuid references media_assets(id) on delete set null,
  extracted_frame_id uuid references extracted_frames(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists valuations (
  id uuid primary key default gen_random_uuid(),
  physical_card_id uuid not null references physical_cards(id) on delete cascade,
  grading_run_id uuid references grading_runs(id) on delete set null,
  raw_low numeric(12,2),
  raw_high numeric(12,2),
  raw_mid numeric(12,2),
  value_5 numeric(12,2),
  value_6 numeric(12,2),
  value_7 numeric(12,2),
  value_8 numeric(12,2),
  value_9 numeric(12,2),
  value_10 numeric(12,2),
  source_5 text,
  source_6 text,
  source_7 text,
  source_8 text,
  source_9 text,
  source_10 text,
  expected_graded_value numeric(12,2),
  gross_ev_uplift numeric(12,2),
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists psa_submission_batches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'draft',
  service_level text,
  grading_fee_per_card numeric(12,2),
  shipping_estimate numeric(12,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists psa_submission_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references psa_submission_batches(id) on delete cascade,
  physical_card_id uuid not null references physical_cards(id) on delete cascade,
  grading_run_id uuid references grading_runs(id) on delete set null,
  declared_value numeric(12,2),
  expected_grade numeric(4,1),
  expected_value numeric(12,2),
  actual_grade numeric(4,1),
  psa_cert_number text,
  created_at timestamptz not null default now(),
  unique(batch_id, physical_card_id)
);

create table if not exists processing_jobs (
  id uuid primary key default gen_random_uuid(),
  media_asset_id uuid references media_assets(id) on delete cascade,
  physical_card_id uuid references physical_cards(id) on delete cascade,
  kind text not null,
  status text not null default 'queued',
  attempts integer not null default 0,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Supabase Storage bucket. This block is safe only inside a Supabase project.
do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public)
    values ('grading-media', 'grading-media', false)
    on conflict (id) do nothing;
  end if;
end $$;
