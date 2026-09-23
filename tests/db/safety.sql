-- Database safety tests (TDD section 22: tests 1, 2, 3, 4, 7 + row-level security + tokens).
-- Run on a database where db/migrations and db/policies/001_integrity.sql are applied.
-- Prints one line per check and a summary. Exit code is handled by run.sh.

create schema if not exists t;
drop table if exists t.results;
create table t.results (name text, pass boolean);
grant usage on schema t to authenticated;
grant all on t.results to authenticated;

-- expect_error: the statement MUST fail. expect_ok: it MUST succeed.
create or replace function t.expect_error(check_name text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; insert into t.results values (check_name, false);
  exception when others then insert into t.results values (check_name, true);
  end;
end $$;
create or replace function t.expect_ok(check_name text, stmt text) returns void language plpgsql as $$
begin
  begin execute stmt; insert into t.results values (check_name, true);
  exception when others then insert into t.results values (check_name, false); raise notice '  (% failed: %)', check_name, sqlerrm;
  end;
end $$;

-- ---------- fixtures ----------
truncate auth.users cascade;
insert into auth.users(id) values ('00000000-0000-0000-0000-0000000000a1'), ('00000000-0000-0000-0000-0000000000a2');
insert into workflows(id,user_id,name,app,action_key,trigger_schema,action_config)
  values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','wf','google_calendar','create_event','{}','{"attendee_email":{"kind":"mapped","source":"email"}}');
insert into runs(id,workflow_id,user_id,trigger_data)
  values ('20000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','{}');
insert into step_attempts(id,run_id,attempt_no,status,config_snapshot,idempotency_key)
  values ('30000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001',1,'failed','{}','r:a:1');
insert into diagnoses(id,attempt_id,category,supported,rule_evidence,candidates,confidence_ceiling,ai_status,confidence)
  values ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','missing_required_field',true,'[]','[]','high','ok','high');
insert into proposals(id,diagnosis_id,workflow_id,kind,field_path,current_value,proposed_value,valid_options,expected_effect,base_config_version)
  values ('50000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','config_change','actionConfig.attendee_email','{}','{}','[]','x',1),
         ('50000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','config_change','actionConfig.attendee_email','{}','{}','[]','x',1),
         ('50000000-0000-0000-0000-000000000003','40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','config_change','actionConfig.attendee_email','{}','{}','[]','x',1);
insert into approvals(id,proposal_id,user_id,decision,approved_field_path,approved_value,summary_shown)
  values ('60000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','approved','actionConfig.attendee_email','{"kind":"mapped","source":"contact_email"}','{}'),
         ('60000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-0000000000a1','rejected',null,null,'{}');

-- ---------- 1. no change without a matching approval ----------
select t.expect_error('1a config change without a valid approval id is refused',
 $q$ insert into config_changes(workflow_id,approval_id,field_path,before_value,after_value)
     values ('10000000-0000-0000-0000-000000000001','99999999-0000-0000-0000-000000000000','actionConfig.attendee_email','{}','{}') $q$);
select t.expect_error('1b config change tied to a REJECTED approval is refused',
 $q$ insert into config_changes(workflow_id,approval_id,field_path,before_value,after_value)
     values ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000002','actionConfig.attendee_email','{}','{}') $q$);
select t.expect_error('1c config change with a DIFFERENT value than approved is refused (tamper test, safety test 2)',
 $q$ insert into config_changes(workflow_id,approval_id,field_path,before_value,after_value)
     values ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','actionConfig.attendee_email','{}','{"kind":"mapped","source":"OTHER"}') $q$);
select t.expect_error('1d config change on a DIFFERENT field than approved is refused',
 $q$ insert into config_changes(workflow_id,approval_id,field_path,before_value,after_value)
     values ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','actionConfig.title','{}','{"kind":"mapped","source":"contact_email"}') $q$);
select t.expect_ok('1e config change that matches its approval is accepted',
 $q$ insert into config_changes(id,workflow_id,approval_id,field_path,before_value,after_value)
     values ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','actionConfig.attendee_email','{"kind":"mapped","source":"email"}','{"source":"contact_email","kind":"mapped"}') $q$);
select t.expect_error('1f an approval can authorize only ONE change',
 $q$ insert into config_changes(workflow_id,approval_id,field_path,before_value,after_value)
     values ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','actionConfig.attendee_email','{}','{"kind":"mapped","source":"contact_email"}') $q$);

-- ---------- 3. approvals are append-only; applied changes cannot be rewritten ----------
select t.expect_error('3a approvals cannot be updated', $q$ update approvals set decision='rejected' where id='60000000-0000-0000-0000-000000000001' $q$);
select t.expect_error('3b approvals cannot be deleted', $q$ delete from approvals where id='60000000-0000-0000-0000-000000000001' $q$);
select t.expect_error('3c config change value cannot be edited after the fact', $q$ update config_changes set after_value='{}' where id='70000000-0000-0000-0000-000000000001' $q$);
select t.expect_error('3d config change cannot be deleted', $q$ delete from config_changes where id='70000000-0000-0000-0000-000000000001' $q$);
select t.expect_ok('3e restore (status + restored_at) is allowed', $q$ update config_changes set status='restored', restored_at=now() where id='70000000-0000-0000-0000-000000000001' $q$);
select t.expect_error('3f an APPROVED approval must carry a field path and value',
 $q$ insert into approvals(proposal_id,user_id,decision,summary_shown) values ('50000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-0000000000a1','approved','{}') $q$);

-- ---------- 4. one running attempt, one success, per run and step ----------
select t.expect_ok('4a one running attempt is accepted', $q$ insert into step_attempts(run_id,attempt_no,status,config_snapshot,idempotency_key) values ('20000000-0000-0000-0000-000000000001',2,'running','{}','r:a:2') $q$);
select t.expect_error('4b a second running attempt is refused (double-click)', $q$ insert into step_attempts(run_id,attempt_no,status,config_snapshot,idempotency_key) values ('20000000-0000-0000-0000-000000000001',3,'running','{}','r:a:3') $q$);
update step_attempts set status='succeeded' where run_id='20000000-0000-0000-0000-000000000001' and attempt_no=2;
select t.expect_error('4c a second success for the same step is refused', $q$ insert into step_attempts(run_id,attempt_no,status,config_snapshot,idempotency_key) values ('20000000-0000-0000-0000-000000000001',4,'succeeded','{}','r:a:4') $q$);
select t.expect_error('4d duplicate attempt number is refused', $q$ insert into step_attempts(run_id,attempt_no,status,config_snapshot,idempotency_key) values ('20000000-0000-0000-0000-000000000001',1,'failed','{}','r:a:1b') $q$);

-- ---------- 5. confidence can never exceed the rules' ceiling ----------
select t.expect_error('5a confidence above the ceiling is refused', $q$ insert into diagnoses(attempt_id,category,supported,rule_evidence,candidates,confidence_ceiling,ai_status,confidence) values ('30000000-0000-0000-0000-000000000001','invalid_format',true,'[]','[]','medium','ok','high') $q$);
select t.expect_ok('5b confidence at or below the ceiling is accepted', $q$ insert into diagnoses(attempt_id,category,supported,rule_evidence,candidates,confidence_ceiling,ai_status,confidence) values ('30000000-0000-0000-0000-000000000001','invalid_format',true,'[]','[]','medium','ok','medium') $q$);
select t.expect_ok('5c no confidence is fine when the AI was unavailable', $q$ insert into diagnoses(attempt_id,category,supported,rule_evidence,candidates,confidence_ceiling,ai_status) values ('30000000-0000-0000-0000-000000000001','unsupported',false,'[]','[]','low','unavailable') $q$);

-- ---------- 7. row-level security: a user sees only their own rows; tokens unreadable ----------
insert into connections(id,user_id,provider) values ('80000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-0000000000a1','google');
insert into private.connection_secrets(connection_id,ciphertext) values ('80000000-0000-0000-0000-000000000001','\xdeadbeef');
grant select on all tables in schema public to authenticated;

set app.uid = '00000000-0000-0000-0000-0000000000a2';
set role authenticated;
insert into t.results select '7a other user sees NO workflows', (select count(*) from workflows) = 0;
insert into t.results select '7b other user sees NO runs', (select count(*) from runs) = 0;
insert into t.results select '7c other user sees NO step attempts (via join)', (select count(*) from step_attempts) = 0;
insert into t.results select '7d other user sees NO approvals', (select count(*) from approvals) = 0;
insert into t.results select '7e other user sees NO connections', (select count(*) from connections) = 0;
select t.expect_error('7f authenticated role cannot read token secrets', $q$ select * from private.connection_secrets $q$);
select t.expect_error('7g authenticated role cannot write workflows directly (writes go through the server)', $q$ update workflows set name='hacked' $q$);
reset role;

set app.uid = '00000000-0000-0000-0000-0000000000a1';
set role authenticated;
insert into t.results select '7h owner DOES see their own workflow', (select count(*) from workflows) = 1;
insert into t.results select '7i owner sees their own step attempts', (select count(*) from step_attempts) >= 1;
reset role;

-- ---------- summary ----------
select case when pass then 'PASS' else 'FAIL' end as result, name from t.results order by name;
select count(*) filter (where pass) as passed, count(*) filter (where not pass) as failed from t.results;
