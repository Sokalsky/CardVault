-- Split the collection into Pokémon and Sports domains.
-- Additive and idempotent: existing rows are Pokémon by default.

alter table card_printings add column if not exists domain text not null default 'pokemon';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'card_printings_domain_check'
  ) then
    alter table card_printings
      add constraint card_printings_domain_check check (domain in ('pokemon', 'sports'));
  end if;
end $$;

create index if not exists idx_card_printings_domain on card_printings(domain);
