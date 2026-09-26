# AGENTS.md: start here (for Claude Code, Codex, and any AI coding agent)

This file is the entry point. Read it fully, then read the brief for the task you were given in
[`docs/TASK_BRIEFS.md`](docs/TASK_BRIEFS.md). Everything you need is inside the repo; do not rely on outside links.

## 1. What this project is
**ZapFix** is a web app where invited testers build a one-trigger, one-action workflow that runs against **real**
Google Calendar, Google Sheets or Slack accounts. When a run fails, ZapFix explains why in plain language, proposes
**one** specific fix (before and after), waits for explicit approval, applies **only** that change, retries **only** the failed
step, and can undo it. Nothing changes without approval. Every change is undoable.

Recovery loop: `failure -> rules classify -> AI explains + picks from allowed fixes -> user confirms -> apply -> retry -> restore if needed`.

## 2. First thing you do: ask the human three questions
1. Which person are you working for: **Dikshyant** (branches `d/...`) or **James** (branches `j/...`)?
2. Which **task ID** (T2 to T32, see `docs/TASKS.md`)?
3. Is `.env.local` set up, and do you have a scratch database available? (Some tasks need them; many do not.)

Then open `docs/TASK_BRIEFS.md`, find your task, and follow section 8 below.

## 3. Commands
| Command | Purpose |
| --- | --- |
| `npm install` | Install (Node 22) |
| `npm run dev` | App at http://localhost:3000 |
| `npm run check` | **Run before every commit.** Type check + lint + unit tests |
| `npm test` / `npm run test:watch` | Vitest |
| `npm run eval` | Rules (and later AI) evaluation set in `evals/` |
| `npm run e2e` | Playwright (run `npx playwright install` once) |
| `npm run build` | Production build |
| `npm run db:generate` / `db:migrate` | Drizzle migrations (needs `DATABASE_URL`) |
| `DB_URL=postgres://... tests/db/run.sh` | Database safety tests. **Scratch database only** (it truncates `auth.users`) |

## 4. Stack (locked, do not swap)
Next.js 16 (App Router) + React 19 + TypeScript 5.9 (`strict`, `noUncheckedIndexedAccess`) + Tailwind 4 (shadcn/ui to be added at the first UI task) +
Zod 4 + Drizzle ORM + postgres.js + Supabase (PostgreSQL + Auth, via `@supabase/ssr`) + Anthropic API (`@anthropic-ai/sdk`) +
Vitest + Playwright + ESLint 9. Hosting: Vercel. Node 22. Path alias: `@/` = repo root.
Do **not** add a new dependency, service, table or endpoint without asking the human (see section 9).

## 5. Repo map
```
app/                     Pages and API route handlers. Handlers stay thin: validate, authorize, call a service.
  api/**/route.ts        18 endpoints. Unbuilt ones use notImplemented("T..", "...") and return 501.
  sign-in/ connections/ workflows/   Placeholder pages
components/              UI. Real: ConfidenceBadge, DiffView, EvidenceList, StepStatusList. Stubs: ApprovalDialog, FieldMapper, TriggerForm, ConnectionCard
server/                  ALL backend logic, one folder per module:
  access/                Sign-in helpers. session.ts (done), invite.ts (T3)
  connections/           crypto.ts (done, tested), secrets.ts (T9)
  workflows/             resolve.ts (done): mappings + transforms -> concrete values
  adapters/              types.ts (contract), registry.ts, fake/ (TEST DOUBLE), google-calendar/, google-sheets/, slack/
  runs/                  engine.ts: guards done; orchestration is T12
  diagnosis/rules/       classify() + one worked rule; two rules TODO (T13)
  diagnosis/ai/          payload.ts, validate.ts, explain.ts (done); client.ts, prompt.ts (T22, T23)
  proposals/             summary.ts (hash done); creation and decisions (T14)
  changes/               applier.ts: pure helpers done; transaction (T14)
  audit/                 events.ts constants done; recording and rate limits (T15)
  templates/             (later, T27)
  http/handler.ts        apiRoute() wrapper, notImplemented()
db/                      schema/index.ts (12 tables), migrations/, policies/001_integrity.sql (triggers + RLS), client.ts
lib/                     Shared: errors.ts, types.ts, canonical.ts, schemas/{standard-error,workflow-config,ai-output,api}.ts
evals/                   run.ts + cases/*.json  (rules/AI evaluation set)
tests/                   unit/, db/ (safety.sql, run.sh, auth_stub.sql), integration/, e2e/, fixtures/ (recorded real app errors)
docs/                    DECISIONS.md, TASKS.md, TASK_BRIEFS.md, TEAM_SPLIT.md, WORKING_AGREEMENT.md, START_HERE.md, TDD.md
```
Find where a task plugs in: `grep -rn "TODO(T" --include=*.ts --include=*.tsx .`

## 6. The contracts (the "plugs" between modules and between the two developers)
| Contract | Defined in | Meaning |
| --- | --- | --- |
| `StandardError` | `lib/schemas/standard-error.ts` | What every adapter returns on failure: `{category_hint, code, message (sanitized), field?, retryable, outcome: not_executed / failed / uncertain}`. Rules read ONLY this. |
| `AppAdapter` | `server/adapters/types.ts` | `id, provider, actions[], validateConfig(), execute(actionKey, values, ctx)`. `execute` never throws raw app errors; a timeout is outcome `uncertain`. |
| `RuleInput`, `Candidate`, `Classification` | `server/diagnosis/rules/types.ts` | Rules turn an error into a category, evidence, and the **allowed** fixes with a confidence ceiling. |
| `AiPayload`, `AiOutput` | `server/diagnosis/ai/payload.ts`, `lib/schemas/ai-output.ts` | The AI sees field names and value shapes only. Its answer is validated against the candidate list and the ceiling. |
| API request bodies | `lib/schemas/api.ts` | Zod schemas for the endpoints. Add each new one here. |
| `ApprovalSummary` + `summaryHash` | `server/proposals/summary.ts` | Exactly what the user saw; the server re-hashes on confirm. |
| Error body | `lib/errors.ts` | `{ error: { code, message, details? } }` via `AppError`. |
| Workflow config | `lib/schemas/workflow-config.ts` | Action field -> `mapped` (trigger field, optional transform) or `static`. Transforms are a closed list. |

The **fake adapter** (`server/adapters/fake`) lets screens, rules and tests work before real adapters exist. It is a test tool; never register it in `registry.ts`.

## 7. Locked decisions that affect code every day
(Full list: `docs/DECISIONS.md`. Changing one needs BOTH developers to agree and the docs updated in the same PR.)
- **Real integrations**, not simulations. Apps: Google Calendar, Slack, Google Sheets. **Gmail (send email) and Drive (create file) joined the MVP on 2026-09-24** (see `docs/DECISIONS.md`, decision 002).
- Trigger is a **built-in form**. One trigger + one action per workflow.
- **Rules decide what is allowed; the AI explains and picks from that list.** The AI can never propose anything off the list. Invalid AI output is **rejected, never repaired**; retry once, then manual mode.
- Confidence is **High / Medium / Low**, never a percentage. Rules set the ceiling; the AI may only lower it. Low or no candidates = **no fix offered**.
- The AI sees **field names and value shapes only**, never raw content, never credentials.
- User can approve, reject, exit, or **pick from valid options**. No free-text edits. **One change per approval.**
- **Approve + apply is one all-or-nothing transaction** (`POST /api/proposals/{id}/confirm`).
- **Retry only the failed step**, same saved trigger data, one attempt per click. Outcome `uncertain` needs explicit confirmation. Never retry automatically.
- **Stop proposing after two applied-but-unsuccessful repairs** (`runs.repair_count`); show manual mode.
- **Restore** undoes debugger changes most-recent-first; warn if the field was edited by hand since.
- No queue, no cache, no search, no file storage, no notifications. Runs and diagnoses execute inline, with a `running` status row written first.
- Tokens: AES-256-GCM, server-only, separate `private` schema. Google stays in **Testing mode** (connections expire after 7 days; testers reconnect).
- If the AI is unavailable: manual mode (original error + rule evidence + fixed tips + "Try diagnosis again"), no fix.

## 8. How to start ANY task (the loop)
1. Confirm person, task ID, branch: `d/T12-run-engine` or `j/T19-debugger-panel`. Create it from `main`.
2. Read your brief in `docs/TASK_BRIEFS.md`, plus the appendix sections it points to.
3. Run `npm run check` first. It must be green **before** you change anything. If not, tell the human.
4. Read the files listed under "Start here" and the `TODO(T..)` comment for your task.
5. **Write the tests first** (or alongside). Put unit tests in `tests/unit/`, DB tests in `tests/db/`, real error samples in `tests/fixtures/<app>/`.
6. Implement in small steps. Keep route handlers thin; put logic in `server/<module>/`.
7. Run `npm run check` after each meaningful step.
8. Remove or update the `TODO(T..)` comments you resolved. Update the status line in `docs/TASKS.md`.
9. Commit with a clear message. Push the branch. **Do not merge or push to `main`.**
10. Open a PR using the template. Safety-critical paths need BOTH developers' review (section 10).

## 9. Stop and ask the human when
- A locked decision seems wrong, or a task seems to need one changed.
- You want to add a dependency, service, table, column, endpoint or environment variable.
- You need real API behavior you cannot verify. **Do not guess** how Google or Slack respond: read their current docs, or ask the human to run a real call and save the response as a fixture.
- You need a secret, a Supabase or Google project, or a paid plan.
- Requirements conflict, or a brief is ambiguous.
- Anything touches safety-critical code and you are unsure of the impact.

## 10. Rules that never bend
1. **No configuration change without a matching approval record.** The database enforces this. Never work around it.
2. **Tokens and keys never appear** in logs, API responses, AI payloads, stored errors, fixtures, tests or the browser. Do not `console.log` request bodies or payloads.
3. **Do not add raw values to `buildAiPayload`.** Names and shapes only. Mask values that app errors echo (`maskQuotedValues`).
4. **Only the approved change is applied.** Re-check with `assertChangeMatchesApproval`; confirm compares `summaryHash`.
5. **Real actions are never retried automatically.**
6. **Every table has `user_id` scoping** (RLS as second layer). Handlers must still verify ownership; the app server uses the service connection, which bypasses RLS.
7. Use **test accounts only**. Never test against someone else's real Google or Slack account.
8. Never run `tests/db/safety.sql` against production or a shared Supabase project.
9. Never `git push --force`, never commit `.env*` (except `.env.example`), never commit `node_modules`.
Safety-critical paths (BOTH developers must review): `db/policies/`, `server/changes/`, `server/connections/`, `server/proposals/`, `server/runs/`, `server/diagnosis/ai/`, and anything that logs or sends data to another service.

## 11. Code conventions
- Imports use the `@/` alias. Pure logic must stay importable by Vitest: **do not** `import "server-only"` in pure modules (only `db/client.ts`, `server/access/session.ts`, `server/connections/secrets.ts` use it).
- Route handlers: `export const POST = apiRoute({ body: SomeSchema }, async ({ user, body, params }) => { ... })`. Return a plain object (JSON), a `Response`, or nothing (204). Throw `new AppError("code", "plain sentence")` for errors.
- In Next.js 16, route/page `params` is a **Promise**: `const { id } = await params`. `apiRoute` already awaits it and gives you `params`.
- Validate every request body and every AI output with Zod. Define shared schemas in `lib/schemas/`.
- `noUncheckedIndexedAccess` is on: handle `undefined` from array/record access instead of using `!` (the existing non-null assertions are limited to regex match groups and tests).
- Store timestamps as `timestamptz`. Store structured data in `jsonb`. Keep table and column names as in `db/schema/index.ts`; snake_case in SQL, camelCase in Drizzle.
- Sanitize before storing: `step_attempts.error_raw` must have secrets removed and echoed values masked.
- UI text: sentence case, active voice, plain words. Say **"may fix"**, never "will fix". AI text is labeled "AI-generated explanation" and kept visually separate from system facts. Do not rely on color alone for meaning.
- Unused stub parameters start with `_` (ESLint allows this).
- Comment style for unfinished work: `// TODO(T12): ...`. Do not leave TODOs for tasks you completed.

## 12. Testing recipe
| Kind | Where | Notes |
| --- | --- | --- |
| Unit | `tests/unit/*.test.ts` | Pure logic; use `fakeAdapter` for adapter behavior |
| Integration | `tests/integration/` | Route handlers with recorded fixtures (no live calls in CI) |
| Database | `tests/db/safety.sql` via `tests/db/run.sh` | Triggers, constraints, RLS. Add a check for every new integrity rule |
| Eval | `evals/cases/*.json`, `npm run eval` | One case per real error shape, including cases where the right answer is "no fix" |
| E2E | `tests/e2e/` | Playwright |
Whenever a **real app returns an error you have not seen**, save it (sanitized) to `tests/fixtures/<app>/`, then add an eval case and a rule test.
Current baseline: 42 unit tests, 28 DB checks, 2 eval cases, all passing. Keep it that way.

## 13. Definition of done (every task)
The task's acceptance list in `docs/TASK_BRIEFS.md` is met; tests added; safety tests still pass; `npm run check` green; `TODO(T..)` updated; `docs/TASKS.md` status updated; new assumptions recorded in the PR; the other developer reviews.

## 14. Environment notes
- Copy `.env.example` to `.env.local`. Most unit tests and `npm run dev` need **no** secrets. `getSessionUser()` returns `null` if Supabase env vars are unset.
- `db/client.ts` uses `prepare: false` (works with Supabase's pooled connection). Use the **direct** connection string for `db:migrate`.
- Google OAuth app is in Testing mode: add each tester as a test user; their Google authorization lasts 7 days.
- The design document (TDD) lives in a shared online doc. If `docs/TDD.md` has been replaced by the exported Markdown, use it; the essentials for building are already in `docs/TASK_BRIEFS.md` appendices.
- Path notes: the sign-in page is `app/sign-in/`; the connections dynamic segment is `app/api/connections/[param]/` (provider name for `start`/`callback`, connection id for `DELETE`).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
