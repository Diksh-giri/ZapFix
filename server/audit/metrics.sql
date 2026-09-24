-- Saved SQL for the PRD success metrics (TDD Appendix F). Read only: run any one query by itself.

-- name: approvals_with_change
-- Every applied change must have an approved approval. The two counts should always match.
select count(*) as applied_changes,
       count(*) filter (where a.decision = 'approved') as with_approved_approval
from config_changes c
join approvals a on a.id = c.approval_id;

-- name: unapproved_changes
-- Workflows last modified by the debugger with no recorded change. Should return no rows.
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
  from step_attempts
  group by run_id
  having bool_or(status = 'succeeded') and count(*) > 1
) t;

-- name: restore_success
-- Restores started and finished, and how many changes are now in the restored state. Target 100 percent.
select (select count(*) from events where type = 'restore_started') as restores_started,
       (select count(*) from events where type = 'restore_finished') as restores_finished,
       (select count(*) from config_changes where status = 'restored') as changes_restored;
