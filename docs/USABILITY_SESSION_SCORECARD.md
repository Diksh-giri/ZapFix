# ZapFix usability session scorecard

Use one copy of this scorecard per moderated session. It maps observed behavior and repository data to the eight success targets in the PRD. The scorecard does not introduce new product metrics; additional notes are diagnostic observations only.

Use a non-identifying participant code. Do not record credentials, tokens, raw workflow values, customer data, or unnecessary personal information.

Do not administer or store a completed scorecard until both owners approve the consent and study-data handling plan required by `docs/USABILITY_TEST_KIT.md`. Never commit a completed scorecard to this repository.

## Session record

- Participant code:
- Session date:
- Moderator code:
- Observer code, if present:
- Scenario identifier:
- Approved answer-key version:
- Observer confirmed the answer key remained hidden from the participant: Yes / No
- Starting workflow configuration verified: Yes / No
- Cohort: Live test / Recorded fixture
- Workflow ID:
- Run ID:
- Diagnosis ID:
- Proposal ID:
- Approval ID, when created:
- Configuration change ID, when created:
- Fresh run and proposal created for this participant: Yes / No / Fixture cohort
- Session completed: Yes / No
- Technical interruption occurred: Yes / No
- If interrupted, describe the product state without sensitive data:

## Cohort and eligibility rules

Assign the cohort before the session begins and do not change it to improve results.

- Live test sessions may contribute to all applicable PRD targets when their record identifiers can be reconciled with product data.
- Recorded-fixture sessions may contribute only to failure understanding and clarity.
- Report live and fixture results separately, including their denominators.
- Include every eligible session that began the participant scenario in the failure-understanding denominator. Inability to navigate to or explain the failure counts as an unsuccessful explanation, not an exclusion.
- Predeclare exclusions before reviewing results. Valid exclusions are participant withdrawal, a safety stop, or a verified infrastructure failure that prevents the scenario from starting. Record every exclusion and its reason.
- Product failures after the scenario begins are study outcomes and must not be removed from the primary started-session result. They may also be reported separately as technical interruptions.

## Task outcomes

Use these outcome values:

- Completed independently
- Completed with assistance
- Not completed
- Not attempted

| Task | Outcome | Evidence or minimum assistance provided |
| --- | --- | --- |
| Identify the failed step |  |  |
| Identify the prior successful step, when present |  |  |
| Locate the original error |  |  |
| Explain the likely cause |  |  |
| Distinguish system evidence from AI explanation |  |  |
| Interpret confidence or uncertainty |  |  |
| Identify the current and proposed values |  |  |
| Explain that confirmation is required |  |  |
| Approve, reject, or exit with a stated reason |  |  |
| Interpret the retry result, when applicable |  |  |
| Explain Restore scope |  |  |
| Complete Restore, when included in the scenario |  |  |

## Timing record

Use one clock source throughout the session. Record timestamps in ISO 8601 format or record elapsed seconds consistently.

- Failed run opened:
- Diagnosis requested:
- Diagnosis first displayed:
- Approval summary first displayed:
- Proposal approved, rejected, or exited:
- Retry started:
- Retry completed:
- Restore started:
- Restore completed:
- Paused time caused by a technical interruption, in seconds:

The repository's decision-time query measures from the first `failure_opened` event to `approvals.decided_at` for approved or rejected proposals. Exit decisions are useful qualitative evidence but are not included in that SQL measure.

## PRD target record

### 1 Failure understanding

- Target: At least 80% of participants correctly explain the failed step and likely cause.
- This participant identified the failed step correctly: Yes / No
- This participant explained the likely cause correctly: Yes / No
- Counts as a correct explanation for the aggregate target: Yes / No
- Supporting participant quote or observation:

Count the participant as correct only when both the failed step and likely cause match the approved moderator-only scenario answer key. The primary denominator is every eligible session that began the participant scenario. A participant who cannot reach or explain the failure counts as unsuccessful. Report assisted completion separately and list every predeclared exclusion with its reason. Stop scoring the scenario if live evidence conflicts with its answer key.

### 2 Decision time

- Target: Median time from opening the failure to approving or rejecting a proposal is under 180 seconds.
- Decision recorded by the product: Approved / Rejected / Exited / No decision
- Observed elapsed seconds from failure opened to decision:
- Product interruption affected timing: Yes / No
- Notes:

Use the saved `time_from_failure_to_decision` query in `server/audit/metrics.sql` for the product-recorded aggregate. It reads the first `failure_opened` event and the matching approval decision time and includes approved or rejected decisions.

### 3 Supported-failure recovery

- Target: At least 70% of runs with an applied debugger change have a latest attempt that succeeded.
- Debugger change applied in this session: Yes / No
- Latest attempt status: Succeeded / Failed / Running / Not applicable
- Counts as recovered for the repository query: Yes / No / Not applicable
- Notes:

Use the saved `recovery_rate` query for the aggregate. Do not count a rejection, exit, or session without an applied debugger change in that query's denominator.

### 4 Retries per resolved failure

- Target: Average of two or fewer retries per resolved failure.
- Total attempts for the run:
- Retries after the first attempt:
- Run ultimately succeeded: Yes / No
- Notes:

Use the saved `retries_per_resolved_run` query for the aggregate. It calculates retries as total attempts minus one for runs that eventually succeeded and had more than one attempt.

### 5 Explicit approval coverage

- Target: 100% of applied changes have a recorded approved approval.
- Configuration change applied: Yes / No
- Matching approved approval recorded: Yes / No / Not applicable
- Notes:

Use the saved `approvals_with_change` query for the aggregate. Its applied-change count and approved-approval count must match.

### 6 Unapproved changes

- Target: Zero workflows modified by the debugger without a matching configuration-change record.
- Unexpected or unapproved change observed during this session: Yes / No
- If yes, stop testing and record the issue without sensitive values:

The saved `unapproved_changes` query is a limited diagnostic, not proof of this target: a prior recorded change or a later user edit can hide an unrecorded debugger mutation. Run it as a warning check, but report the target as **not fully measurable with the current audit model** unless every debugger mutation in the study cohort can be reconciled to an append-only approval and configuration-change record. Do not infer zero unapproved changes from an empty query result.

### 7 Clarity

- Target: Average response of at least 4.0 out of 5.
- Participant survey item 9 rating:
- Participant comment:

Average item 9 from `docs/USABILITY_PARTICIPANT_SURVEY.md` across completed responses. Do not substitute an average of all survey questions.

### 8 Restore success

- Target: 100% successful restoration during testing.
- Restore attempted: Yes / No
- Restore finished successfully: Yes / No / Not applicable
- Configuration change shows restored state: Yes / No / Not applicable
- Notes:

Use the saved `restore_success` query together with the per-session scorecards. The server gives each restore request a unique `restore_attempt_id`, and the query matches its started and finished events to the same user, run, configuration change and attempt. The required `study_run_ids` allowlist restricts both event sets to the declared live cohort. If an attempt cannot be correlated to a completion, report it as unsuccessful or unresolved rather than assuming success.

## Diagnostic observations

These observations help explain usability problems but are not additional PRD success metrics.

- Number of moderator interventions:
- Participant recognized that the recommendation may be incorrect: Yes / No
- Participant distinguished system evidence from AI explanation: Yes / No
- Participant correctly explained what Restore does not undo: Yes / No / Not attempted
- Ambiguous labels or messages:
- Unexpected product state:
- Accessibility or input problem:
- Other observation:

## Aggregate reporting worksheet

Complete this only after reviewing all eligible session records and running the applicable saved SQL queries against the approved test database. Report live and fixture cohorts separately. Do not combine fixture observations with live operational outcomes.

Before running `approvals_with_change`, `time_from_failure_to_decision`, `recovery_rate`, `retries_per_resolved_run`, or `restore_success`, create the temporary `study_run_ids` table shown at the top of `server/audit/metrics.sql`. Insert only the live run IDs from included scorecards. Review the inserted IDs against the scorecards before running a query; never add fixture, smoke, internal, excluded, or unrelated runs. The queries intentionally fail when this allowlist is missing.

| Existing PRD target | Result | Sample or denominator | Target met | Evidence source |
| --- | --- | --- | --- | --- |
| Correct failure explanation |  |  | At least 80% | All eligible started-session scorecards, separated by cohort |
| Median approve or reject time |  |  | Under 180 seconds | `time_from_failure_to_decision` |
| Supported-failure recovery |  |  | At least 70% | `recovery_rate` |
| Retries per resolved failure |  |  | Two or fewer on average | `retries_per_resolved_run` |
| Applied changes with approval |  |  | 100% | `approvals_with_change` |
| Unapproved changes |  |  | Zero | Per-mutation approval/change reconciliation; `unapproved_changes` is diagnostic only |
| Clarity rating |  |  | At least 4.0 out of 5 | Participant survey item 9 |
| Restore success |  |  | 100% | Correlated live-cohort `restore_success` results and scorecards |

## Review sign-off

- Scorecard reviewed by:
- Review date:
- Product defects filed separately: Yes / No / Not needed
- Sensitive information removed from shared notes: Yes / No
- Session included in aggregate report: Yes / No
- If excluded, reason:
