-- REVIEW-ONLY Dragonite stale-media cleanup proposal.
--
-- This file is intentionally NOT a migration. It must not be run automatically.
-- It targets only the two named Dragonite physical cards, only non-ready rows
-- created before the end of the failed test window, and ends with ROLLBACK.
--
-- IMPORTANT: the five placeholders may already be absent. In that case the review
-- SELECT returns zero rows and no further action is needed.

begin;

create temporary table cardvault_review_stale_cards (
  physical_card_id uuid primary key
) on commit drop;

insert into cardvault_review_stale_cards (physical_card_id) values
  ('de42c4d8-611b-4d4b-a69a-c6685eb70534'),
  ('ec67db89-c70e-498e-806b-4cedc2500214');

-- Approval review: this must return only the known non-ready placeholders.
select
  media.id,
  media.physical_card_id,
  media.kind,
  media.original_filename,
  media.storage_path,
  media.processing_status,
  media.created_at
from media_assets as media
join cardvault_review_stale_cards as target
  on target.physical_card_id = media.physical_card_id
where media.processing_status in ('uploading', 'failed')
  and media.created_at < timestamptz '2026-08-19 04:00:00+00'
order by media.physical_card_id, media.created_at;

-- APPROVAL-GATED CHANGE (disabled): after reviewing the SELECT above, an
-- administrator may copy only this DELETE into a separate transaction. The
-- status/card/time-window guards prevent it from deleting ready media, later
-- retries, or records belonging to other cards.
--
-- delete from media_assets as media
-- using cardvault_review_stale_cards as target
-- where media.physical_card_id = target.physical_card_id
--   and media.processing_status in ('uploading', 'failed')
--   and media.created_at < timestamptz '2026-08-19 04:00:00+00'
-- returning media.id, media.physical_card_id, media.original_filename, media.processing_status;

rollback;
