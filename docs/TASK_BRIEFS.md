# Task briefs (T2 to T32)

How to use this file: find your task ID, read its brief, then follow the loop in `AGENTS.md` section 8.
Each brief has: **Goal**, **Start here** (files), **Build** (steps), **Acceptance** (definition of done), **Watch out**.
IDs, owners, dependencies and status are also in `docs/TASKS.md`. Reference material (API, tables, states, error codes) is in the appendices at the bottom.

**Already done in the scaffold (no brief needed):** T1 repo and app skeleton, T4 CI (`.github/workflows/ci.yml`), T8 adapter contract, standard error and the fake adapter.

Owners: **D** = Dikshyant (safety core + AI client), **J** = James (experience, workflows, rules). Sizes are relative effort: S, M, L, XL.

---

## Phase 1: Foundation

### T2. Create the accounts and projects (Both, S)
**Depends on:** T1. **Status:** Not started.
**Goal:** every external service exists and both developers can reach it.
**Build (a human does this; the agent writes the checklist output and env values list):**
1. **Supabase:** create a **production-ish dev project** and a **separate scratch project** for destructive DB tests. Disable public sign-up (Authentication settings). Note the URL, anon key, service-role key, direct DB connection string.
2. **Vercel:** create the project from the GitHub repo; add env vars (server-only); confirm a preview deploy loads `/api/health`.
3. **Google Cloud:** new project; enable Google Calendar API and Google Sheets API; configure the OAuth consent screen as **External, publishing status Testing**; add each developer and tester as **test users** (cap 100); create an OAuth client (Web application) with redirect URIs for local and Vercel: `http://localhost:3000/api/connections/google/callback` and the deployed equivalent.
4. **Slack:** can wait until T25.
5. **Secrets:** generate `TOKEN_ENCRYPTION_KEY` with `openssl rand -base64 32`. Store all secrets in a password manager. Never in chat or git.
**Acceptance:** preview deploy loads; both developers have access to every project; `.env.local` works on both laptops; `npm run check` green on both.
**Watch out:** never share the service-role key with the browser or commit it. Google test users must be added or sign-in shows "access blocked".

### T3. Sign-in and invite gate (J, M)
**Depends on:** T2. **Status:** Done (2026-09-25): invite-gated Supabase magic-link sign-in verified against the dev project for invited, unknown, revoked and sign-out cases.
**Goal:** only invited emails can sign in; each user sees only their own data.
**Start here:** `server/access/session.ts`, `server/access/invite.ts`, `app/sign-in/page.tsx`, `app/auth/confirm/route.ts`, `db/schema/index.ts` (`invites`).
**Build:**
1. Supabase Auth email sign-in (ask the human whether to use email magic link or email+password; magic link avoids password handling).
2. `isInvited(email)`: look up `invites` where status in `invited`/`active`; refuse `revoked` or unknown. Mark `invited` -> `active` on first sign-in.
3. Enforce the gate server-side (a callback route or middleware), not just in the UI. Public sign-up must also be off in Supabase.
4. Sign-in page with clear "not invited" message; sign-out.
5. Handlers using `apiRoute` already return 401 when `getSessionUser()` is null.
**Acceptance:** invited email signs in; uninvited email is refused; revoked email cannot get a new session; unit test for `isInvited` logic.
**Watch out:** do not use "Sign in with Google" for app sign-in; it is separate from the Google connection. The invite list is managed in the Supabase dashboard (no endpoint by design).

---

## Phase 2: Database

### T5. Create the tables on real Supabase (D, M)
**Depends on:** T2. **Status:** Done (2026-09-24): migrations applied to the dev project; `npm run db:check` shows 12 tables. Use the Session pooler connection string in `DATABASE_URL` (the direct host is IPv6-only and often unreachable).
**Start here:** `db/schema/index.ts`, `db/migrations/0000_init.sql`, `drizzle.config.ts`.
**Build:**
1. `DATABASE_URL=<direct connection string> npm run db:migrate` against the **dev** project.
2. Review the migration; adjust column types if needed (`npm run db:generate` for changes). Only one developer generates migrations at a time; tell the other first.
3. Confirm all 12 tables plus the `private.connection_secrets` table exist.
**Acceptance:** migration applies cleanly to an empty Supabase database.
**Watch out:** the `private` schema must exist before secrets are written. Do not change table or column names without updating the appendices and the other developer.

### T6. Turn on the safety rules (D, M)
**Depends on:** T5. **Status:** Done (2026-09-24): safety rules are migration `0001_integrity_and_rls.sql`; all 28 checks pass on the scratch Supabase project; applied to dev.
**Start here:** `db/policies/001_integrity.sql`, `tests/db/safety.sql`.
**Build:**
1. On the **scratch** Supabase project, apply `001_integrity.sql` (as a custom Drizzle migration: `npx drizzle-kit generate --custom --name=integrity_and_rls`, paste the SQL, then migrate). Fix any Supabase-specific differences.
2. Run `tests/db/safety.sql` against the scratch project only (it truncates `auth.users`). Every check must PASS.
3. Apply the same migration to the dev project.
**Acceptance:** safety tests 1 (no change without approval), 2 (tamper refused), 3 (append-only), 4 (one running, one success), 7 (row-level security and tokens unreadable) all pass on real Supabase.
**Watch out:** RLS is a **second** layer; the app server uses the service connection which bypasses it. Never remove the triggers to make something work.

### T7. Database test suite (D, M)
**Depends on:** T6. **Status:** Done for the existing 28 checks (2026-09-24). They pass on plain Postgres (CI) and on scratch Supabase: apply migrations with `DATABASE_URL=<scratch> npm run db:migrate`, then `CONFIRM_SCRATCH=yes DB_URL=<scratch> tests/db/run.sh` (needs `psql`; scratch only, it truncates `auth.users`). Keep adding a check per new integrity rule.
**Build:** add a check to `tests/db/safety.sql` for every new integrity rule you add; document how to run against Supabase scratch; keep the CI `db-safety` job green.
**Acceptance:** checks run in CI and locally; each new rule has a passing and a failing case.

---

## Phase 3: Backend

### T9. Connections: Google (and later Slack) (D, XL)
**Depends on:** T3, T5. **Status:** Code done and unit-tested (2026-09-24): OAuth state + PKCE cookie, encrypted token bundle, `getAccessToken` with quiet renewal, Google and Slack clients, connections service, Drizzle store, and the four routes. Still to do: run the store against a real database, and a real end-to-end connect for Google and Slack (needs T3 sign-in). Scopes approved: Calendar `calendar.events.owned`, Sheets `spreadsheets`, `gmail.send`, `drive.file`, `openid email`; Slack bot `chat:write`, `chat:write.public`. Slack needs an HTTPS redirect URL.
**Goal:** a tester connects Google; the encrypted token is stored; the Run Engine can get a fresh access token; expiry is detected and surfaced.
**Start here:** `server/connections/secrets.ts` (TODO), `server/connections/crypto.ts`, `app/api/connections/**`, `db/schema/index.ts` (`connections`, `connectionSecrets`), `.env.example`.
**Build:**
1. **Choose the narrowest scopes** that allow: create a Calendar event; append a Sheets row. **Bring the scope list to the human for approval before requesting it.** Do not include Gmail or Drive scopes.
2. `POST /api/connections/{provider}/start`: random `state` bound to the session, PKCE where supported, exact redirect URI; return the provider URL.
3. `GET /api/connections/{provider}/callback`: verify `state`; exchange the code; encrypt tokens with `encryptToken(..., getTokenKey().key)`; save `connections` (status `active`, `connected_at`, scopes, account label) and `private.connection_secrets` (`ciphertext`, `key_version`). Redirect to `/connections`.
4. `getAccessToken(connectionId)` (server only): decrypt, renew with the refresh token if needed. If renewal fails (`invalid_grant`, revoked, 7-day expiry) set `connections.status = 'needs_reconnect'`, record `last_error_code`, and return a typed failure. Renewal is invisible plumbing; **a failed renewal is what becomes the "expired connection" failure**.
5. `GET /api/connections` (status list, `connected_at`), `DELETE /api/connections/{id}` (revoke at provider if supported, delete rows).
6. Write the Google 7-day note into the API response so the UI can show it (connection age).
**Acceptance:** tester connects and disconnects Google; token never leaves the server; renewal failure flips status to `needs_reconnect`; **safety test 8** (no tokens in logs, responses, AI payloads, stored errors) passes; unit tests for state/PKCE handling.
**Watch out:** Google Testing mode: authorizations expire 7 days after consent. Use Google's current OAuth docs, not memory. Never log the code, tokens or secrets. Sensitive-scope classification must be confirmed before requesting scopes.

### T10. Workflow service (J, M)
**Depends on:** T5, T8. **Status:** In progress (2026-09-26): app catalog plus owner-scoped workflow create, list, and read are done; update and time-zone behavior pending.
**Start here:** `lib/schemas/workflow-config.ts`, `lib/schemas/api.ts` (`CreateWorkflowRequest`, `PatchWorkflowRequest`), `server/workflows/resolve.ts`, `server/adapters/registry.ts`, `app/api/apps`, `app/api/workflows/**`.
**Build:**
1. `GET /api/apps`: return the catalog from `listAdapters()` (actions, fields, required flags).
2. `POST /api/workflows`: validate body; `adapter.validateConfig(actionKey, config)` must return `[]`; verify `connectionId` belongs to the user; insert (`config_version` 1, `last_modified_by` 'user').
3. `GET /api/workflows` and `GET /api/workflows/{id}`: owner only.
4. `PATCH /api/workflows/{id}`: require `expectedConfigVersion`; on mismatch throw `AppError("version_conflict", ...)`; on success increment `config_version`, set `last_modified_by = 'user'`; also expire any `pending` proposals for that workflow (status `expired`).
5. Handle `t.timeZone` in `date_to_rfc3339` (see TODO in `resolve.ts`) once the human confirms the time-zone behavior.
**Acceptance:** create, list, open, edit work with ownership checks; invalid mappings are refused with 422; version conflicts return 409; unit and integration tests.
**Watch out:** never trust `user_id` from the body; use the session user. Transforms are a closed list (`date_to_rfc3339`, `trim`, `lowercase`).

### T11. Google Calendar adapter and real error fixtures (D, L)
**Depends on:** T8, T9. **Status:** Adapter code done and unit-tested (2026-09-24): `execute("create_event")` with timeout, status-to-`StandardError` mapping, uncertain outcome on timeout or dropped connection, masked messages. Duplicate protection checked against Google's docs: `events.insert` accepts a client-supplied `id` (lowercase base32hex, 5 to 1024 chars; a repeat is `409 duplicate`), so the id is derived from run + step (not the attempt number) and a `409 duplicate` counts as success. Guests are not emailed (`sendUpdates=none`). Real fixtures recorded (2026-09-24) with a test account and saved, sanitized, under `tests/fixtures/google-calendar/` (success, empty_attendee_email, invalid_date_format, invalid_token); the 400 mapping is refined from them. Real findings: an empty attendee gives `400 invalid` \"Invalid attendee email.\" (the adapter maps it to `missing_field` + `attendee_email`); a bad date gives `400 badRequest` \"Bad Request\" with NO field (the adapter finds the one non-RFC 3339 date field itself). The existing missing-field rule fires on the real error. Handoff to James for T13 and T24: the expired-connection and invalid-format rules are still stubs; `tests/unit/calendar-fixtures-rules.test.ts` has `it.todo` items ready for them. Still to do: a real end-to-end event through the app (needs sign-in).
**Goal:** create a real event; turn every failure into a `StandardError`; capture real error responses.
**Build:**
1. `execute("create_event", values, ctx)`: call Google Calendar events insert with `ctx.accessToken`; use `AbortController` with `ctx.timeoutMs`.
2. Map results: success -> `{ ok: true, externalRef: <event id>, requestSummary }`. Failures -> `StandardError`: missing required value -> `missing_field` with `field`; bad date/time format -> `invalid_value` with `field`; 401/`invalid_grant` -> `auth`; 429 -> `rate_limit`; 5xx -> `unavailable`; **timeout or dropped connection -> outcome `uncertain`**.
3. Mask any value the API echoes in an error message (`maskQuotedValues` in `server/diagnosis/ai/payload.ts`).
4. **Duplicate protection:** check Google's current docs on whether events insert accepts a client-supplied event id usable as the idempotency key; if yes, derive it from `ctx.idempotencyKey`. If not sufficient, rely on the one-success rule and the uncertain-outcome rule. Record the result in the PR.
5. With a real test account, create **three deliberately broken workflows** (empty attendee email; date like `03/15/2026`; revoked or expired token) and save the sanitized raw responses under `tests/fixtures/google-calendar/*.json`. **Hand these to James for T13 and T24.**
**Acceptance:** a real event is created; the three failure types return the right `StandardError`; fixtures saved; no personal data or tokens in fixtures.
**Watch out:** do not guess Google's error shapes; record real ones. Use only your own test calendar.

### T12. Run Engine (D, L)
**Depends on:** T6, T10, T11. **Status:** Code done and unit-tested (2026-09-24): guards, orchestration (`startRun`, `getRun` with reconcile-on-read, `retryFailedStep`), Drizzle run store, and the three routes, wired to T9's `getAccessToken` and T15's rate limits and events (`retry_started`, `retry_finished`). A dead connection becomes an `auth` failure (`not_executed`) and a temporary refresh problem an `unavailable` one, so neither calls the app. Decision (2026-09-24, Dikshyant): the retry `Idempotency-Key` header is accepted but not stored (no new column); the database's one-running-attempt rule stops double clicks. Known gap: replaying a request after the first try failed can make a second real call, so the retry button must be disabled while a request is in flight. Defaults: `APP_CALL_TIMEOUT_MS` 15 s, `STALE_RUNNING_MS` 90 s (optional env overrides). Still to do: run the run store against a real database (needs a scratch user), and an end-to-end run once the Calendar adapter (T11) and sign-in exist.
**Start here:** `server/runs/engine.ts`, `db/schema/index.ts` (`runs`, `stepAttempts`), `server/workflows/resolve.ts`, `app/api/workflows/[id]/runs`, `app/api/runs/[id]`, `app/api/runs/[id]/retry`.
**Build:**
1. `startRun(workflowId, userId, triggerData)`: validate trigger data against the workflow's `trigger_schema`; require an `active` connection (else `no_active_connection`); insert `runs` (`running`); call `executeAttempt`.
2. `executeAttempt(runId, ...)`: insert `step_attempts` with status `running`, `attempt_no`, `config_snapshot` (the config **actually used**), `idempotency_key` (`idempotencyKey(runId, "action", n)`). The DB rejects a second running or a second succeeded attempt. Resolve values with `resolveConfig`; get a token via T9's `getAccessToken`; call `adapter.execute` (timeout from `APP_CALL_TIMEOUT_MS`). Update the attempt: `succeeded` (+ `external_ref`), `failed` (+ sanitized `error_raw`, `error_std`), or leave `running` if interrupted. Run status follows the latest attempt.
3. Reconcile on read: when `GET /api/runs/{id}` finds a `running` attempt older than `STALE_RUNNING_MS`, write `uncertain` (use `effectiveStatus`). No cron.
4. `retryFailedStep(runId, { confirmUncertain })`: call `assertRetryAllowed`; new attempt with the **current** workflow config and the **same** `runs.trigger_data`. If a debugger change was applied since the previous attempt and this attempt fails, increment `runs.repair_count`.
5. Endpoints: `POST /api/workflows/{id}/runs` (body `RunWorkflowRequest`), `GET /api/runs/{id}` (run, attempts, trigger data, latest diagnosis id), `POST /api/runs/{id}/retry` (header `Idempotency-Key`; a repeated key returns the original attempt).
6. Check the rate limit (T15) before starting a run or retry.
**Acceptance:** **safety tests 4 and 11** pass; a double-click creates one attempt; an interrupted call becomes `uncertain`; a retry never runs against a succeeded step.
**Watch out:** write the `running` row **before** the real call. Never auto-retry. Never store tokens in `request_summary`.

### T13. Diagnosis rules and the diagnosis endpoint (J, M)
**Depends on:** T11, T12. **Status:** Partly: `classify`, `ceilingFor`, and the **missing-required-field** rule (worked example) are done.
**Start here:** `server/diagnosis/rules/*`, `tests/unit/rules.test.ts`, `evals/cases/example.json`, `tests/fixtures/google-calendar/` (from T11).
**Build:**
1. **`invalid-format.ts`:** match `error.category_hint === "invalid_value"` with `error.field`; compare the value shape (`shapeOf` from `server/diagnosis/ai/payload.ts`) with the field type; candidates = transforms from the closed list (e.g., `date_to_rfc3339` with the detected `fromFormat`). `MM/DD/YYYY` vs `DD/MM/YYYY` is ambiguous: offer both as candidates (ceiling becomes Medium) rather than guessing.
2. **`expired-connection.ts`:** match `category_hint === "auth"`; one candidate of kind `reconnect_guidance` (id `reconnect`), **no config change**, ceiling High.
3. Keep `classify()` order; add tests for each rule using recorded fixtures; add an eval case per real error shape, including cases where the right answer is "no fix".
4. **Diagnosis orchestration** (agree ownership with Dikshyant; recommended: James wires it, Dikshyant supplies the AI): `POST /api/runs/{id}/diagnosis`: refuse with `repair_limit_reached` when `runs.repair_count >= 2`; apply the rate limit; `classify()` -> `buildAiPayload()` -> `explainWithAi()` (client injected) -> insert `diagnoses` (`category`, `supported`, `rule_evidence`, `candidates`, `confidence_ceiling`, `ai_status`, `ai_output`, `confidence`, `model`). `GET /api/diagnoses/{id}` returns it. Proposal creation is T14.
**Acceptance:** each category classified correctly on real fixtures; unsupported returns no candidates and Low; `npm run eval` passes; new rules have tests.
**Watch out:** never propose a fix that maps to an empty value. Rules produce **only valid** candidates; the AI never widens the list.

### T14. Proposal, one-step confirm, restore (D, XL)
**Depends on:** T6, T13. **Status:** Partly: `applyFieldChange`, `assertChangeMatchesApproval`, `hasManualEditConflict`, `summaryHash` done and tested.
**Start here:** `server/changes/applier.ts`, `server/proposals/summary.ts`, `db/policies/001_integrity.sql`, `app/api/proposals/**`, `app/api/config-changes/[id]/restore`, Appendix E below.
**Build:**
1. **Create proposal** from a diagnosis: `kind` = `config_change` (with `field_path`, `current_value`, `proposed_value`, `valid_options` from the candidates, `expected_effect`, `base_config_version`) or `reconnect_guidance` (no approval row; the UI shows Reconnect). Supersede older `pending` proposals. No proposal when confidence is Low or no candidate was selected.
2. `buildApprovalSummary(...)` returning the `ApprovalSummary` shown to the user.
3. `POST /api/proposals/{id}/decision` (`rejected` / `exited`): insert an `approvals` row with no value; proposal -> `decided`.
4. `POST /api/proposals/{id}/confirm`: implement the transaction in Appendix E with `db.transaction`. Compare `summaryHash` against the server-rebuilt summary.
5. `POST /api/config-changes/{id}/restore`: only the **latest applied** change; `hasManualEditConflict` unless `confirmOverwrite`; write back `before_value`; status `restored`; bump `config_version`; events.
**Acceptance:** **safety tests 1, 2, 5, 6** pass (5: force a failure mid-transaction and confirm nothing was written); confirm rejects a stale `base_config_version` (409 `proposal_outdated`), an option not in `valid_options` (422), or a hash mismatch; restore returns the exact before value.
**Watch out:** everything in confirm is **one** transaction. Do not update the workflow outside it. Restore reverts ZapFix settings only; it cannot undo actions already taken in Calendar/Slack/Sheets. State this in the response text.

### T15. Events, metrics, rate limits (D, M)
**Depends on:** T5. **Status:** Code done and unit-tested (2026-09-24): `recordEvent` (ids and enums only; secret-like keys refused; `once` per run), `checkRateLimit` (hourly UTC window per user and bucket, 429 with `retryAfterSeconds`), Drizzle store, `POST /api/events` (body now also needs `runId`, so the event can be tied to a run and its ownership checked), and the six saved metric queries in `server/audit/metrics.sql`. The six metric queries were run read-only against the dev database and execute cleanly (no data yet, so they return zeros). Still to do: exercise the Drizzle store's write paths on the scratch database (events need a real `auth.users` row); the 30-per-hour limits are still proposals; the main actions (retry, diagnosis, proposal, restore) must call `recordEvent` as those tasks land.
**Start here:** `server/audit/events.ts`, `db/schema/index.ts` (`events`, `rateLimits`), `app/api/events`, `lib/schemas/api.ts` (`EventRequest`).
**Build:**
1. `recordEvent(db, { userId, runId?, type, payload })` (payload has ids and enums only, no personal content).
2. `checkRateLimit(db, userId, bucket)`: upsert a counter per user, bucket and hour window; throw `AppError("rate_limited", ...)`.
3. `POST /api/events` for `failure_opened` and `summary_viewed` (server-side events are written by the services).
4. Saved SQL for the PRD metrics in `server/audit/metrics.sql` (see Appendix F).
**Acceptance:** events written on the main actions; limits enforced with a 429; metric queries run.
**Watch out:** never put tokens or personal content in `payload`. Numbers in `RATE_LIMITS` are proposals; confirm with the human.

---

## Phase 4: Frontend (all J, all use the API in Appendix A)

**Shared UI rules for T16 to T21:** first UI task runs `npx shadcn@latest init` (interactive; ask the human) and adds only the components it needs. Fetch with plain `fetch`; **poll every 1.5 s** while status is `running` or a diagnosis is pending (whether to add SWR/TanStack Query is an open minor decision: default to none). Every screen needs **loading, empty, error, and success** states. Text: sentence case, plain words, "may fix" not "will fix". Real-account warnings on the Connections screen and the workflow editor ("Actions run on your real accounts. Use a test calendar, channel and sheet."). Do not rely on color alone. Until real endpoints exist, build against the fake adapter and mock responses that match `lib/schemas/api.ts`.

### T16. Connections screen (J, S)
**Depends on:** T9. **Start here:** `components/ConnectionCard.tsx` (stub), `app/connections/page.tsx`.
**Build:** one card per provider (Google, Slack): status (`active`, `needs_reconnect`, `revoked`), connected date, Connect / Reconnect / Disconnect buttons. For Google show: "Google test connections last about 7 days" and the days remaining. Calls: `GET /api/connections`, `POST /api/connections/{provider}/start`, `DELETE /api/connections/{id}`.
**Acceptance:** connect, reconnect and disconnect work; warnings visible; empty state guides the first connection.

### T17. Workflow editor, field mapper, trigger form (J, M)
**Depends on:** T10. **Start here:** `components/FieldMapper.tsx`, `components/TriggerForm.tsx` (stubs), `app/workflows/page.tsx`, `app/workflows/[id]/page.tsx`.
**Build:** workflow list with empty state; create flow: name, app, action (from `GET /api/apps`), connection; **field mapper**: each action field maps to a trigger field, a fixed value, or a trigger field plus a transform (closed list); required fields marked; **trigger form** built from `trigger_schema` (text, email, date, number) with a **Run test** button that posts `triggerData`. Edits use `PATCH` with `expectedConfigVersion` and handle the 409.
**Acceptance:** build, save, edit, and run a workflow end to end against the fake adapter, then the real one.

### T18. Run detail screen (J, M)
**Depends on:** T12. **Start here:** `components/StepStatusList.tsx`, `app/workflows/[id]/page.tsx`.
**Build:** step status list, the data passed (trigger data), the original error (sanitized) when failed, attempt history, **Diagnose** and **Retry** buttons. Disable Retry while an attempt is running; for `uncertain` show the warning and require explicit confirmation before sending `confirmUncertain: true`. Log `failure_opened` once via `POST /api/events`.
**Acceptance:** live status updates via polling; failure view shows failed step, steps that succeeded before, and the original error.

### T19. Debugger panel and confirm dialog (J, L)
**Depends on:** T14, T23 (build against mocks until they land). **Start here:** `components/DiffView.tsx`, `ConfidenceBadge.tsx`, `EvidenceList.tsx` (done), `components/ApprovalDialog.tsx` (stub), `server/proposals/summary.ts`.
**Build:**
1. Diagnosis card: **"Confirmed by the system"** (`EvidenceList`) visibly separate from the **"AI-generated explanation"**; `ConfidenceBadge` (High/Medium/Low with a one-line reason); likely cause in plain words.
2. Proposal: `DiffView` (field, current, proposed), expected effect, valid-option picker (from `valid_options`; no free text), the line **"No change will be made unless you confirm."**
3. `ApprovalDialog`: repeats failed step, error, likely cause, evidence, current and proposed value, expected effect, uncertainty. Buttons: **Confirm**, **Choose a different option**, **Reject**, **Exit**. Confirm sends `selectedOptionId`, `expectedConfigVersion`, `summaryHash` (the hash comes from the server payload, not computed in the browser).
4. Reject/Exit call `POST /api/proposals/{id}/decision`. Handle 409 `proposal_outdated` ("This proposal is out of date. Request a new diagnosis.").
5. `reconnect_guidance` proposals show a **Reconnect** button (no approval flow).
6. Log `summary_viewed` when the dialog opens.
**Acceptance:** Low confidence shows no proposal; approve, reject, exit and pick-another-option all work; nothing is applied on reject or exit; text never claims certainty.

### T20. Result and restore views (J, M)
**Depends on:** T14. **Build:** after Confirm show "Change applied" with original and updated values and the approval record; a Retry result banner (resolved / same error / new error; new error starts a new diagnosis); **Restore** with the `manual_edit_conflict` warning and confirmation; a note that Restore reverts ZapFix settings only. After two failed repairs show the hand-over message (`repair_limit_reached`).
**Acceptance:** verify and restore flows work; conflict warning appears when the setting was edited by hand.

### T21. Manual mode and per-category tips (J, S)
**Depends on:** T13. **Build:** shown when the failure is unsupported, confidence is Low, no valid candidate exists, the repair limit is reached, or `ai_status` is `unavailable`/`invalid`. Shows the original error, rule evidence, **fixed** tips (no AI), a **Try diagnosis again** button (only when the AI failed), and a link back to the workflow editor. Tip text is fixed per category, for example:
- Missing field: "Check that the form field feeding this setting is filled in, or map a different field."
- Invalid format: "Check the format the app expects and convert the value before sending it."
- Expired connection: "Reconnect the app from the Connections page."
- Unsupported: "The original error is shown above. Check the app's status page, or edit the workflow manually."
**Acceptance:** each manual-mode trigger shows the right message; no fix is ever offered here.

---

## Phase 5: AI

### T22. AI client (D, L, with T23)
**Depends on:** T13. **Status:** Partly: `buildAiPayload`, `shapeOf`, `maskQuotedValues` done.
**Start here:** `server/diagnosis/ai/client.ts` (`createAnthropicClient` throws `not_implemented`), `explain.ts`, `.env.example` (`ANTHROPIC_API_KEY`, `AI_MODEL`, `AI_CALL_TIMEOUT_MS`).
**Build:** implement `AiClient.complete({ system, user, timeoutMs })` with `@anthropic-ai/sdk`: model from `AI_MODEL` (never hard-coded), low temperature, output capped near 700 tokens, enforce `timeoutMs` (abort), return the text. **Check the SDK's current documentation** before writing calls. Never log the payload, prompt or key. Measure real token use on a few cases and record it in the PR.
**Acceptance:** the client works against the real API in a local check; unit tests mock the SDK; **safety test 8** (payload snapshot contains names and shapes only).
**Watch out:** the provider must stay swappable: everything else depends only on the `AiClient` interface.

### T23. Prompt, answer checking, retry and fallback (D, L, with T22)
**Depends on:** T22. **Status:** Partly: `validateAiOutput` and `explainWithAi` (validate, retry once, fall back) done and tested; `prompt.ts` is a draft.
**Build:** tune `SYSTEM_PROMPT` against the evaluation set (T24); keep app-supplied text only inside the delimited `<data>` block; confirm off-list picks and over-ceiling confidence are rejected; map results to `diagnoses.ai_status` (`ok`, `invalid`, `unavailable`).
**Acceptance:** **safety test 9**; evaluation gates met (Appendix F); fallback shows manual mode.
**Watch out:** never "repair" a bad AI answer. The AI has no tools.

### T24. AI evaluation set (J, M)
**Depends on:** T11, T23. **Status:** Partly: `evals/run.ts` checks rules only; 2 example cases.
**Build:** about 40 cases in `evals/cases/*.json` built from **recorded real errors**: roughly 10 per supported category plus 10 unsupported/contradictory/"correctly no fix". Extend the runner: replay recorded AI responses by default (so CI never calls the API), with an opt-in flag to call the real model. Checks: correct category; selected fix is on the list; no fix when there should be none; confidence within ceiling; schema valid; payload has no personal content.
**Acceptance:** runner reports per-case results and gates (Appendix F); wired into CI.

---

## Phase 6: More integrations (after Milestone 1: full loop on Calendar)

### T25. Slack (D, M)
**Status:** Adapter code done and unit-tested (2026-09-24): `post_message` via `chat.postMessage`, Slack's `ok:false` error codes mapped to `StandardError` (auth, not_found on the channel, missing/invalid text or channel, rate limit, unavailable with outcome `uncertain`), timeout or dropped connection `uncertain`, no duplicate protection (Slack has none; checked against its docs). Still to do: record real fixtures with `scripts/record-slack-fixtures.ts` (needs a test workspace and channel), confirm the empty-channel and empty-text responses against them, then rules coverage, eval cases and an e2e test (James for the rules and evals).
Use T9's machinery with provider `slack` (OAuth, bot token, encrypted). Adapter `post_message` (channel, text). Slack has no native duplicate protection: rely on the one-success and uncertain-outcome rules. Map real error codes to `StandardError` (channel not found, not in channel, revoked/invalid token -> auth). Save fixtures, add rules coverage and eval cases, add an e2e test. **Acceptance:** full loop on Slack.

### Gmail and Drive adapters (D)
**Status:** Adapter code done and unit-tested (2026-09-24), sharing `server/adapters/google-http.ts` with Calendar. Gmail `send_email` (`users.messages.send`, scope `gmail.send`; a line break in the recipient or subject is refused to stop header injection) and Drive `create_file` (multipart `files.create`, scope `drive.file`). Neither API has usable idempotency (Gmail none; Drive only via a separate `generateIds` call that returns fresh ids), so both rely on the one-success and uncertain-outcome rules. `gmail` and `google_drive` are now in `APP_IDS` and the registry; both use the `google` provider connection. Still to do: real fixtures with a test account (recorder scripts in the style of Calendar), rules coverage and eval cases (James), an e2e test.

### T26. Google Sheets (J, M)
Reuse the Google connection. Adapter `append_row` (spreadsheet id, sheet name, values). Sheets is forgiving about formats, so invalid-format cases are mainly covered by Calendar; still capture real errors (permission, wrong sheet name). Fixtures, rules, eval cases, e2e. **Acceptance:** full loop on Sheets.

### T27. Templates and nice-to-have screens (J, M)
`server/templates/`: a small set (3 to 5) of ready-made workflows created via the normal workflow service, **including deliberately broken ones** (empty attendee email, wrong date format, expired connection scenario) that double as test scenarios. Also SHOULD-HAVE items: run timestamp, history of approved debugger changes, original-versus-retry comparison, return-to-editor shortcut. History needs a read endpoint that is **not** in the approved API list: propose it to the human before adding.

---

## Phase 7: Testing

### T28. The eleven safety tests (D, M)
Must all pass in CI before testers are invited. Status today in brackets.
1. No config change without a valid approval [DB done]
2. Value differing from the approval is refused (tamper) [DB done]
3. Approvals cannot be updated or deleted [DB done]
4. Simultaneous retries create one attempt; a step never has two successes [DB done; add integration test after T12]
5. Confirm is all-or-nothing: forced failure leaves no approval, change or config update [after T14]
6. Restore returns the exact before value; a manual edit triggers `manual_edit_conflict` [logic done; add integration test after T14]
7. One user cannot read or change another user's rows [DB done]
8. Tokens never appear in AI payloads, logs, API responses or stored errors [payload test done; add log/response/stored-error checks after T9, T12]
9. Off-list fix, over-ceiling confidence, or bad JSON is rejected and shows manual mode [unit done]
10. After two applied-but-unsuccessful repairs, diagnosis refuses new proposals [after T12, T13]
11. An `uncertain` attempt cannot be retried without confirmation [unit done; add integration test after T12]

### T29. End-to-end tests (J, M)
Playwright: connect a **test** Google account, run the deliberately broken workflow, diagnose, approve, retry, restore; Calendar first, then Slack, then Sheets. CI uses recorded fixtures (no live calls). Keep a manual "live smoke" checklist: one real run per app before each release.

### T30. Usability test kit (J, S)
Tasks, survey, and metric queries for a small tester group. Targets (PRD): 80% of participants correctly explain the failure; clarity rating at least 4.0 of 5; median time from opening a failure to approve/reject under 3 minutes; 70% recovery on supported failures; two or fewer retries per resolved failure; 100% restore success; every applied change has an approval; zero unapproved changes. **Schedule sessions within days of each tester's Google connection** (7-day expiry).

---

## Phase 8: Deployment (Both)

### T31. Production setup
Production Supabase project (disable public sign-up, load invites, apply migrations and policies), Vercel production env vars (server-only), Google consent screen in Testing with all testers added, Slack app with the narrowest bot scopes, encryption key and rotation plan, plan/terms check.

### T32. Launch checklist
Confirm vendor terms (AI provider data retention, Vercel plan terms for this use, Supabase free-tier limits and invite-only settings); all eleven safety tests pass; live smoke run per app; tester briefing (real accounts warning; use a test calendar, channel and sheet; reconnect Google before sessions); then invite testers.

---

# Appendices (reference)

## A. API endpoints (18 endpoints in 17 rows; all require sign-in except the OAuth callback, which validates `state`)
Common errors: 401, 403, 404, 409 (state conflict), 422 (validation), 429 (rate limited). Body shape: `{ "error": { "code", "message", "details"? } }`.

| Method and path | Purpose / request | Success response | Specific errors | Task |
| --- | --- | --- | --- | --- |
| GET `/api/apps` | Supported apps, actions, required fields | App catalog | none | T10 |
| GET `/api/connections` | Connection status per provider | List with status, `connected_at` | none | T9 |
| POST `/api/connections/{provider}/start` | Begin Connect; provider in google, slack | Redirect URL with state | 422 unknown provider | T9 |
| GET `/api/connections/{provider}/callback` | Provider returns here; validates state and code | Redirect to `/connections` | 400 bad state; 409 denied | T9 |
| DELETE `/api/connections/{id}` | Disconnect (revoke at provider if supported) | 204 | 404 | T9 |
| POST `/api/workflows` | `CreateWorkflowRequest` | Workflow | 422 missing required mapping | T10 |
| GET `/api/workflows`, GET `/api/workflows/{id}` | List, open | Workflow(s) | 404 | T10 |
| PATCH `/api/workflows/{id}` | `PatchWorkflowRequest` (`expectedConfigVersion`) | Workflow with new `config_version` | 409 `version_conflict`; 422 | T10 |
| POST `/api/workflows/{id}/runs` | `RunWorkflowRequest` (`triggerData`) | Run with first attempt | 409 `no_active_connection`; 429 | T12 |
| GET `/api/runs/{id}` | Run status, attempts, trigger data, latest diagnosis id (polled) | Run detail | 404 | T12 |
| POST `/api/runs/{id}/retry` | Header `Idempotency-Key`; body `RetryRequest` | New attempt | 409 `attempt_running`, `already_succeeded`, `uncertain_needs_confirmation` | T12 |
| POST `/api/runs/{id}/diagnosis` | Request a diagnosis | Diagnosis id (poll result) | 409 `repair_limit_reached`; 429 | T13 |
| GET `/api/diagnoses/{id}` | Category, evidence, explanation, confidence, proposal (polled) | Diagnosis + proposal | 404 | T13 |
| POST `/api/proposals/{id}/decision` | `DecisionRequest`: `rejected` or `exited` | Proposal status | 409 not pending | T14 |
| POST `/api/proposals/{id}/confirm` | `ConfirmRequest`: `selectedOptionId?`, `expectedConfigVersion`, `summaryHash` | Updated workflow, config change id, approval id | 409 `proposal_outdated`/not pending/config changed; 422 option not valid | T14 |
| POST `/api/config-changes/{id}/restore` | `RestoreRequest`: `confirmOverwrite?` | Restored config | 409 `manual_edit_conflict`, not the latest applied change | T14 |
| POST `/api/events` | `EventRequest`: `failure_opened` or `summary_viewed` | 204 | 422 unknown type | T15 |

## B. Database tables (`db/schema/index.ts` is the source of truth)
`invites` (email PK, status invited/active/revoked) · `connections` (user, provider google/slack, status active/needs_reconnect/revoked, scopes, account_label, connected_at, last_error_code; unique user+provider) · `private.connection_secrets` (connection_id, ciphertext bytea, key_version) · `workflows` (user, name, app, action_key, connection_id, trigger_schema, action_config, config_version, last_modified_by user/debugger) · `runs` (workflow, user, trigger_data, status, repair_count) · `step_attempts` (run, step_key, attempt_no, status, config_snapshot, request_summary, error_raw, error_std, idempotency_key, external_ref; partial unique: one `running` and one `succeeded` per run+step) · `diagnoses` (attempt, category, supported, rule_evidence, candidates, confidence_ceiling, ai_status, ai_output, confidence ≤ ceiling, model) · `proposals` (diagnosis, workflow, kind, field_path, current_value, proposed_value, valid_options, expected_effect, base_config_version, status) · `approvals` (proposal unique, user, decision approved/rejected/exited, approved_field_path, approved_value, was_edited, summary_shown; **append-only**) · `config_changes` (workflow, approval_id NOT NULL UNIQUE, field_path, before_value, after_value, status applied/restored) · `events` (user, run?, type, payload) · `rate_limits` (user, bucket, window_start, count).
Integrity (in `db/policies/001_integrity.sql`): change must match its approval; approvals and applied changes are immutable (only `status`/`restored_at` may change); RLS on every table; `private` schema unreadable by browser roles.

## C. States
- **Attempt:** `running` → `succeeded` | `failed` | `uncertain`. `failed` → (retry) new attempt `running`. `uncertain` → retry only with confirmation. A stale `running` (older than `STALE_RUNNING_MS`) is read as `uncertain`. Run status follows its latest attempt.
- **Proposal:** `pending` → `decided` | `superseded` (new diagnosis) | `expired` (workflow config changed by hand).
- **Connection:** `active` | `needs_reconnect` | `revoked`. **Config change:** `applied` → `restored`.
- **Repair counter:** `runs.repair_count` increases when a retry fails after a debugger change; at 2 the diagnosis endpoint returns `repair_limit_reached`.

## D. Error codes (`lib/errors.ts`)
`unauthenticated` 401 · `forbidden` 403 · `not_found` 404 · `conflict` 409 · `validation_failed` 422 · `rate_limited` 429 · `internal` 500 · `not_implemented` 501 · 409 family: `repair_limit_reached`, `manual_edit_conflict`, `proposal_outdated`, `attempt_running`, `already_succeeded`, `uncertain_needs_confirmation`, `version_conflict`, `no_active_connection`.

## E. The confirm transaction (`POST /api/proposals/{id}/confirm`), one `db.transaction`
1. Load the proposal and workflow; verify ownership; proposal is `pending`.
2. The request's `expectedConfigVersion`, the proposal's `base_config_version` and the workflow's current `config_version` must all be equal (else 409 `proposal_outdated`).
3. If `selectedOptionId` is given it must be in `valid_options` (else 422); it defines the value to apply, otherwise use the proposed value.
4. Rebuild the `ApprovalSummary` server-side; `summaryHash(summary)` must equal the request's `summaryHash`.
5. Insert `approvals` (`decision = 'approved'`, `approved_field_path`, `approved_value`, `was_edited` = picked a different option, `summary_shown`).
6. Insert `config_changes` (`before_value` = current, `after_value` = approved). The database trigger re-checks it matches the approval.
7. Update `workflows.action_config` using `applyFieldChange`; `config_version += 1`; `last_modified_by = 'debugger'`.
8. Mark the proposal `decided`; write `proposal_decided` and `change_applied` events.
Any failure rolls back everything. **Restore** is a similar single transaction (see T14).

## F. Working values and gates (proposed; confirm with the human when the task starts)
- Timeouts: real app call 15 s (`APP_CALL_TIMEOUT_MS`), AI call 25 s (`AI_CALL_TIMEOUT_MS`), stale running 90 s (`STALE_RUNNING_MS`). Polling every 1.5 s.
- Rate limits per user per hour: runs 30, retries 30, diagnoses 30 (`RATE_LIMITS`).
- AI evaluation gates: zero off-list selections; zero fixes on unsupported cases; at least 90% correct category and fix overall.
- Metric definitions (saved as SQL in T15): approvals with a change (always 100% by constraint); unapproved changes = workflows with `last_modified_by = 'debugger'` and no matching `config_changes`; time from `failure_opened` event to `approvals.decided_at`; recovery rate = runs with a debugger change whose latest attempt succeeded; retries per resolved run = `step_attempts` count; restore success from `config_changes` status and restore events.

## G. Open items that affect tasks (see `docs/DECISIONS.md` for what is locked)
- **Pending human decisions:** Google plan beyond Testing mode (production unverified, verification, or managed connection service); ~~whether Gmail and Drive join the MVP~~ (decided 2026-09-24: **yes**, `send_email` and `create_file`, see decision 002); whether T15 moves to James.
- Exact Google and Slack **scopes** (T9, T25, T26): bring the list for approval first.
- **Data retention** period for runs, trigger data, raw errors, events (proposal: test period plus 30 days).
- Vendor terms: AI provider data retention, Vercel plan use, Supabase free-tier limits.
- Whether Google's client-supplied event id is enough for duplicate protection (T11).
- App errors that echo user values: always mask before storing or sending (T11, T12, T22).
- Ownership of the diagnosis orchestration endpoint between T13 and T22/T23 (recommended: James wires it; Dikshyant supplies `explainWithAi`).
