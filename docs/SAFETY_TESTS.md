# The eleven safety tests (T28)

These must all pass before any tester is invited. Each one protects a promise ZapFix makes to its users:
**nothing changes without approval, only the approved change is applied, and everything can be undone.**

`tests/unit/safety-suite.test.ts` fails if any of the files below is deleted or loses its marker text, so a safety test cannot quietly disappear.

| # | The promise, in plain words | Where it is tested |
| --- | --- | --- |
| 1 | No change to a workflow without a matching approval | `tests/db/safety.sql` (1a to 1f) · `tests/unit/proposal-decision-confirm.test.ts` |
| 2 | If a change differs from what was approved, it is refused | `tests/db/safety.sql` (1c, 1d) · `tests/unit/applier.test.ts` · `tests/unit/proposal-decision-confirm.test.ts` |
| 3 | Approvals cannot be edited or deleted afterwards | `tests/db/safety.sql` (section 3) |
| 4 | Clicking Retry twice at once creates one attempt; a step never succeeds twice | `tests/db/safety.sql` (section 4) · `tests/unit/run-engine.test.ts` · `tests/integration/runs-db.test.ts` |
| 5 | Approve-and-apply is all-or-nothing: if any part fails, nothing is saved | `tests/unit/proposal-decision-confirm.test.ts` · `tests/integration/proposals-db.test.ts` |
| 6 | Restore gives back the exact old value, and warns if you edited it by hand | `tests/unit/proposal-restore.test.ts` · `tests/unit/applier.test.ts` · `tests/integration/proposals-db.test.ts` |
| 7 | One user can never see or change another user's data; tokens are unreadable | `tests/db/safety.sql` (section 7) |
| 8 | Tokens, keys and personal content never reach the AI, logs, API responses or stored errors | `tests/unit/ai-payload.test.ts` · `tests/unit/no-secret-logging.test.ts` · `tests/unit/no-secret-leaks.test.ts` |
| 9 | A fix that is not on the rules' list, over-confident, or badly formed is rejected and manual mode shows | `tests/unit/ai-validate.test.ts` |
| 10 | After two repairs that did not help, ZapFix stops proposing | `tests/unit/run-guards.test.ts` · `tests/unit/run-engine.test.ts` |
| 11 | If we are not sure a step already happened, it is not retried without explicit confirmation | `tests/unit/run-guards.test.ts` · `tests/unit/run-engine.test.ts` · `tests/integration/runs-db.test.ts` |

## How to run them

| Kind | Command | Needs |
| --- | --- | --- |
| Unit (most of them) | `npm test` | nothing |
| Database rules | `DB_URL=<scratch database> tests/db/run.sh` | a scratch database. CI runs this on every pull request. |
| Real-database code paths | `DB_URL=<scratch database> CONFIRM_SCRATCH=yes npx vitest run tests/integration --no-file-parallelism` | the same scratch database, migrations applied. CI runs this too. |

**Scratch databases only.** The database tests empty `auth.users`. Never point `DB_URL` at zapfix-dev or production. The integration tests refuse to run against the app's own `DATABASE_URL`.

## Still open

- **Test 10:** `assertCanDiagnose(run.repairCount)` (in `server/runs/engine.ts`) exists and is tested, but the diagnosis endpoint (T13) has to call it. Until then, nothing enforces the limit in the running app.
- **Test 8, AI payload in practice:** the payload builder is tested, but the real diagnosis endpoint that calls it does not exist yet (T13).
