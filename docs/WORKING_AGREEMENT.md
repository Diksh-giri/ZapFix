# Working agreement (two people, one codebase)

## Rhythm
- `main` is always deployable. Nobody pushes to it directly: every change is a pull request.
- Branch names: `a/<task>-<short-name>` or `b/<task>-<short-name>` (for example `a/T12-run-engine`).
- Keep PRs small (a task or part of one). The other person reviews. Merge when `npm run check` and CI are green.
- Sync for 10 minutes at the start of each work session: what you are on, what you need from the other lane.

## Safety-critical code: both of you must review
Changes to any of these need approval from BOTH people, no exceptions:
`db/policies/`, `server/changes/`, `server/connections/`, `server/proposals/`, `server/runs/`,
`server/diagnosis/ai/` (payload and validation), and anything that logs or sends data to another service.

## Rules that never bend (from the locked decisions)
1. No configuration change without a matching approval record. The database enforces it; do not work around it.
2. Tokens and keys never appear in logs, API responses, AI payloads, error messages, or the browser.
3. The AI sees field names and value shapes only. Do not add raw values to `buildAiPayload`.
4. The AI can only choose from the rules' candidate list. Do not "repair" invalid AI output; reject it.
5. Real actions are never retried automatically. Retries are user-triggered and guarded.
6. Never test against someone else's real account. Use your own test calendar, channel and sheet.

## Decisions
- A locked decision (docs/DECISIONS.md) changes only when both of you agree. Update the TDD in the same PR.
- New material decision (new service, new table, new endpoint, new dependency with a cost)? Write two or three sentences in the PR and get the other person's yes before building.

## Database changes
- One person creates migrations at a time. Say so in chat before running `db:generate`; two people generating migrations at once causes conflicts that are painful to untangle.
- Every migration that adds a table also adds its row-level security policy and constraint tests in `tests/db/`.
- Never run `tests/db/safety.sql` against production or a shared project: it truncates `auth.users`.

## Secrets
- `.env.local` is never committed. Share secrets through a password manager, not chat.
- Google and Slack app credentials, the AI key, and the token-encryption key are separate values with separate owners noted in your password manager.

## Definition of done for a task
- The task's "definition of done" in TDD section 26 is met.
- Tests added for the logic; safety tests still pass; `npm run check` is green.
- The relevant `TODO(T..)` comments are removed or updated.
- Any new assumption or open question is added to TDD section 28.

## Fixtures
Whenever a real app returns an error you have not seen before, save the (sanitized) response under `tests/fixtures/<app>/` and add an eval case in `evals/cases/`. That is how the rules get better.
