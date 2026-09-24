-- Integrity + row-level security for ZapFix. TDD section 13 design rules 1, 2, 4, 5.
-- NOT YET RUN AGAINST A DATABASE. First person to do T5/T6: run this on a scratch Supabase
-- project, fix any syntax problems, and add tests in tests/db/ (safety tests 1, 2, 3, 7).
--
-- Apply as a custom Drizzle migration:
--   npx drizzle-kit generate --custom --name=integrity_and_rls
-- then paste this file into the generated .sql.

-- ---------------------------------------------------------------
-- 1. Foreign keys to Supabase Auth users (Drizzle does not model auth.users)
-- ---------------------------------------------------------------
alter table connections add constraint connections_user_fk foreign key (user_id) references auth.users(id) on delete cascade;
alter table workflows   add constraint workflows_user_fk   foreign key (user_id) references auth.users(id) on delete cascade;
alter table runs        add constraint runs_user_fk        foreign key (user_id) references auth.users(id) on delete cascade;
alter table approvals   add constraint approvals_user_fk   foreign key (user_id) references auth.users(id);
alter table events      add constraint events_user_fk      foreign key (user_id) references auth.users(id) on delete cascade;
alter table rate_limits add constraint rate_limits_user_fk foreign key (user_id) references auth.users(id) on delete cascade;

-- ---------------------------------------------------------------
-- 2. Approvals are append-only; applied changes cannot be rewritten (design rules 1 and 2)
-- ---------------------------------------------------------------
create or replace function forbid_change() returns trigger language plpgsql as $$
begin
  raise exception '% on % is not allowed (append-only)', tg_op, tg_table_name;
end $$;

create trigger approvals_append_only
  before update or delete on approvals
  for each row execute function forbid_change();

create trigger config_changes_no_delete
  before delete on config_changes
  for each row execute function forbid_change();

-- A config change must equal the approval that authorizes it.
create or replace function config_change_matches_approval() returns trigger language plpgsql as $$
declare a approvals%rowtype;
begin
  select * into a from approvals where id = new.approval_id;
  if not found or a.decision <> 'approved' then
    raise exception 'config change requires an approved approval';
  end if;
  if new.field_path <> a.approved_field_path or new.after_value is distinct from a.approved_value then
    raise exception 'config change does not match the approved field and value';
  end if;
  return new;
end $$;

create trigger config_changes_match_approval
  before insert on config_changes
  for each row execute function config_change_matches_approval();

-- After insert, only status and restored_at may change (restore).
create or replace function config_changes_only_status_changes() returns trigger language plpgsql as $$
begin
  if new.workflow_id <> old.workflow_id
     or new.approval_id <> old.approval_id
     or new.field_path <> old.field_path
     or new.before_value is distinct from old.before_value
     or new.after_value is distinct from old.after_value then
    raise exception 'config_changes: only status and restored_at may change';
  end if;
  return new;
end $$;

create trigger config_changes_immutable_fields
  before update on config_changes
  for each row execute function config_changes_only_status_changes();

-- ---------------------------------------------------------------
-- 3. Row-level security (design rule 4). The app server uses the service role, which
--    bypasses RLS, so handlers still check ownership. RLS is the second layer.
--    Authenticated users get SELECT on their own rows only; all writes go through the server.
-- ---------------------------------------------------------------
alter table invites        enable row level security;  -- no policies: server only
alter table connections    enable row level security;
alter table workflows      enable row level security;
alter table runs           enable row level security;
alter table step_attempts  enable row level security;
alter table diagnoses      enable row level security;
alter table proposals      enable row level security;
alter table approvals      enable row level security;
alter table config_changes enable row level security;
alter table events         enable row level security;
alter table rate_limits    enable row level security;

create policy connections_owner_read on connections for select using (user_id = auth.uid());
create policy workflows_owner_read   on workflows   for select using (user_id = auth.uid());
create policy runs_owner_read        on runs        for select using (user_id = auth.uid());
create policy approvals_owner_read   on approvals   for select using (user_id = auth.uid());
create policy events_owner_read      on events      for select using (user_id = auth.uid());
create policy rate_limits_owner_read on rate_limits for select using (user_id = auth.uid());

create policy step_attempts_owner_read on step_attempts for select using (
  exists (select 1 from runs r where r.id = step_attempts.run_id and r.user_id = auth.uid()));
create policy diagnoses_owner_read on diagnoses for select using (
  exists (select 1 from step_attempts s join runs r on r.id = s.run_id
          where s.id = diagnoses.attempt_id and r.user_id = auth.uid()));
create policy proposals_owner_read on proposals for select using (
  exists (select 1 from workflows w where w.id = proposals.workflow_id and w.user_id = auth.uid()));
create policy config_changes_owner_read on config_changes for select using (
  exists (select 1 from workflows w where w.id = config_changes.workflow_id and w.user_id = auth.uid()));

-- ---------------------------------------------------------------
-- 4. Tokens are unreadable by browser roles (design rule 5)
-- ---------------------------------------------------------------
revoke all on schema private from anon, authenticated;
revoke all on all tables in schema private from anon, authenticated;
