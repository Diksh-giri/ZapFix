-- Saved SQL for the PRD success metrics (TDD Appendix F).
-- Before running a study metric, create and populate a session-local allowlist with ONLY the
-- live-study run ids recorded in the scorecards. Queries intentionally fail if the allowlist is absent.
--
--   create temporary table study_run_ids (run_id uuid primary key) on commit preserve rows;
--   insert into study_run_ids (run_id) values ('<run-id-from-scorecard>');
--
-- Clear and repopulate it for each reporting cohort. Fixture, smoke, internal and non-study runs
-- must never be inserted. After setup, run any one named query by itself.

-- name: approvals_with_change
-- Every applied change must have an approved approval. The two counts should always match.
select count(*) as applied_changes,
       count(*) filter (where a.decision = 'approved') as with_approved_approval
from config_changes c
join approvals a on a.id = c.approval_id
join proposals p on p.id = a.proposal_id
join diagnoses d on d.id = p.diagnosis_id
join step_attempts s on s.id = d.attempt_id
join study_run_ids study on study.run_id = s.run_id;

-- name: unapproved_changes
-- Diagnostic only: workflows currently marked as debugger-modified with no change record.
-- An empty result cannot prove that zero unapproved changes occurred historically because workflows
-- do not have an append-only mutation log. Do not use this query alone to claim the PRD target.
select w.id as workflow_id
from workflows w
where w.last_modified_by = 'debugger'
  and not exists (select 1 from config_changes c where c.workflow_id = w.id);

-- name: time_from_failure_to_decision
-- Median seconds from the first failure_opened event to the tester's approve or reject decision. Target under 180.
select percentile_cont(0.5) within group (order by extract(epoch from (a.decided_at - f.opened_at))) as median_seconds,
       count(*) as decisions
from approvals a
join proposals p on p.id = a.proposal_id
join diagnoses d on d.id = p.diagnosis_id
join step_attempts s on s.id = d.attempt_id
join study_run_ids study on study.run_id = s.run_id
join (
  select run_id, min(created_at) as opened_at
  from events
  where type = 'failure_opened' and run_id is not null
  group by run_id
) f on f.run_id = s.run_id
where a.decision in ('approved', 'rejected');

-- name: recovery_rate
-- Of the runs that had a debugger change applied, the share whose latest attempt succeeded. Target 70 percent.
with runs_with_change as (
  select distinct s.run_id
  from config_changes c
  join approvals a on a.id = c.approval_id
  join proposals p on p.id = a.proposal_id
  join diagnoses d on d.id = p.diagnosis_id
  join step_attempts s on s.id = d.attempt_id
  join study_run_ids study on study.run_id = s.run_id
),
latest as (
  select distinct on (s.run_id) s.run_id, s.status
  from step_attempts s
  join runs_with_change r on r.run_id = s.run_id
  order by s.run_id, s.attempt_no desc
)
select count(*) as runs_with_change,
       count(*) filter (where status = 'succeeded') as recovered,
       round(100.0 * count(*) filter (where status = 'succeeded') / nullif(count(*), 0), 1) as recovery_pct
from latest;

-- name: retries_per_resolved_run
-- Extra attempts needed before a run succeeded. Target two or fewer.
select count(*) as resolved_runs,
       round(avg(t.attempts - 1), 2) as avg_retries,
       max(t.attempts - 1) as max_retries
from (
  select run_id, count(*) as attempts
  from step_attempts s
  join study_run_ids study on study.run_id = s.run_id
  group by s.run_id
  having bool_or(status = 'succeeded') and count(*) > 1
) t;

-- name: restore_success
-- Restore attempts correlated by the server-generated attempt id. Target 100 percent.
with started as (
  select distinct e.user_id,
         e.run_id,
         e.payload ->> 'restore_attempt_id' as restore_attempt_id,
         e.payload ->> 'config_change_id' as config_change_id
  from events e
  join study_run_ids study on study.run_id = e.run_id
  where e.type = 'restore_started'
    and e.payload ->> 'restore_attempt_id' is not null
),
finished as (
  select distinct e.user_id,
         e.run_id,
         e.payload ->> 'restore_attempt_id' as restore_attempt_id,
         e.payload ->> 'config_change_id' as config_change_id
  from events e
  join study_run_ids study on study.run_id = e.run_id
  where e.type = 'restore_finished'
    and e.payload ->> 'restore_attempt_id' is not null
)
select count(*) as restores_started,
       count(*) filter (where exists (
         select 1 from finished f
         where f.user_id = s.user_id
           and f.run_id is not distinct from s.run_id
           and f.restore_attempt_id = s.restore_attempt_id
           and f.config_change_id = s.config_change_id
       )) as restores_finished,
       round(100.0 * count(*) filter (where exists (
         select 1 from finished f
         where f.user_id = s.user_id
           and f.run_id is not distinct from s.run_id
           and f.restore_attempt_id = s.restore_attempt_id
           and f.config_change_id = s.config_change_id
       )) / nullif(count(*), 0), 1) as restore_success_pct
from started s;
