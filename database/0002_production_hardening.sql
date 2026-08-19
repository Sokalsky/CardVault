-- Additive production hardening for existing CardVault databases.
-- This migration does not drop or rewrite collection data.

alter table grading_runs add column if not exists probability_1 numeric(6,4);
alter table grading_runs add column if not exists probability_2 numeric(6,4);
alter table grading_runs add column if not exists probability_3 numeric(6,4);
alter table grading_runs add column if not exists probability_4 numeric(6,4);
alter table grading_runs add column if not exists front_centering_left numeric(5,2);
alter table grading_runs add column if not exists front_centering_right numeric(5,2);
alter table grading_runs add column if not exists front_centering_top numeric(5,2);
alter table grading_runs add column if not exists front_centering_bottom numeric(5,2);
alter table grading_runs add column if not exists back_centering_left numeric(5,2);
alter table grading_runs add column if not exists back_centering_right numeric(5,2);
alter table grading_runs add column if not exists back_centering_top numeric(5,2);
alter table grading_runs add column if not exists back_centering_bottom numeric(5,2);

alter table extracted_frames add column if not exists exposure_score numeric(8,6);
alter table extracted_frames add column if not exists overall_score numeric(12,6);

alter table valuations add column if not exists value_1 numeric(12,2);
alter table valuations add column if not exists value_2 numeric(12,2);
alter table valuations add column if not exists value_3 numeric(12,2);
alter table valuations add column if not exists value_4 numeric(12,2);
alter table valuations add column if not exists source_1 text;
alter table valuations add column if not exists source_2 text;
alter table valuations add column if not exists source_3 text;
alter table valuations add column if not exists source_4 text;
alter table valuations add column if not exists source_details jsonb;
alter table valuations add column if not exists checked_at timestamptz;

create unique index if not exists media_assets_storage_path_idx on media_assets(storage_path);
create unique index if not exists card_printings_normalized_identity_idx
  on card_printings(name, coalesce(card_number, ''), coalesce(set_name, ''), coalesce(variant, ''));
create index if not exists idx_processing_jobs_status_created on processing_jobs(status, created_at);
create index if not exists idx_valuations_card_created on valuations(physical_card_id, created_at desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'physical_cards_grading_status_check') then
    alter table physical_cards add constraint physical_cards_grading_status_check check (
      grading_status in (
        'ungraded', 'needs_photos', 'ready_for_grading', 'grading', 'needs_more_photos',
        'graded', 'recheck', 'grade_candidate', 'do_not_grade', 'submitted_to_psa', 'psa_returned'
      )
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'processing_jobs_status_check') then
    alter table processing_jobs add constraint processing_jobs_status_check
      check (status in ('queued', 'processing', 'completed', 'failed')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'psa_submission_batches_status_check') then
    alter table psa_submission_batches add constraint psa_submission_batches_status_check
      check (status in ('draft', 'preparing', 'submitted', 'returned', 'closed')) not valid;
  end if;
end $$;

create or replace function set_cardvault_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists physical_cards_set_updated_at on physical_cards;
create trigger physical_cards_set_updated_at before update on physical_cards
for each row execute function set_cardvault_updated_at();
drop trigger if exists processing_jobs_set_updated_at on processing_jobs;
create trigger processing_jobs_set_updated_at before update on processing_jobs
for each row execute function set_cardvault_updated_at();
drop trigger if exists psa_submission_batches_set_updated_at on psa_submission_batches;
create trigger psa_submission_batches_set_updated_at before update on psa_submission_batches
for each row execute function set_cardvault_updated_at();

create or replace function validate_cardvault_media_parent()
returns trigger language plpgsql as $$
declare parent_card uuid;
begin
  select physical_card_id into parent_card from media_assets where id = new.media_asset_id;
  if parent_card is null or parent_card <> new.physical_card_id then
    raise exception 'media asset does not belong to physical card';
  end if;
  return new;
end $$;

drop trigger if exists extracted_frames_validate_parent on extracted_frames;
create trigger extracted_frames_validate_parent before insert or update on extracted_frames
for each row execute function validate_cardvault_media_parent();

-- Supabase REST must not expose collection tables to the anon role. The web app,
-- worker, and MCP integration use server-side Postgres/service-role credentials.
alter table card_printings enable row level security;
alter table physical_cards enable row level security;
alter table media_assets enable row level security;
alter table extracted_frames enable row level security;
alter table grading_runs enable row level security;
alter table grading_defects enable row level security;
alter table valuations enable row level security;
alter table psa_submission_batches enable row level security;
alter table psa_submission_items enable row level security;
alter table processing_jobs enable row level security;

do $$
begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    update storage.buckets set public = false where id = 'grading-media';
  end if;
end $$;
