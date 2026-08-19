-- Allow trusted server-side Supabase clients to use the private CardVault schema.
-- RLS remains enabled and no privileges are granted to anon or authenticated.

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    execute 'grant usage on schema public to service_role';
    execute 'grant select, insert, update, delete on all tables in schema public to service_role';
    execute 'grant usage, select, update on all sequences in schema public to service_role';
    execute 'alter default privileges in schema public grant select, insert, update, delete on tables to service_role';
    execute 'alter default privileges in schema public grant usage, select, update on sequences to service_role';
  end if;
end $$;
