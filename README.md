# ZapFix
An AI-powered co-pilot for Zapier workflows that turns cryptic failure messages into plain-language explanations and applies user-approved fixes automatically, so non-technical users can resolve broken automations without needing to understand the technical layer underneath.

> Nothing is ever changed without the user's explicit approval, and every change can be undone.

## The idea in one line
Failure → diagnosis → proposed change → human approval → retry (and restore if it did not work).

## Documents (read these first)
| Document | What it is |
| --- | --- |
| [docs/TDD.md](docs/TDD.md) | The Technical Design Document: architecture, database, API, AI, security, task list (T1 to T32) |
| [docs/DECISIONS.md](docs/DECISIONS.md) | The 34 locked decisions. Changing one needs both of you to agree |
| [docs/TEAM_SPLIT.md](docs/TEAM_SPLIT.md) | Who owns what, and the contracts between the two lanes |
| [docs/WORKING_AGREEMENT.md](docs/WORKING_AGREEMENT.md) | How we work: branches, reviews, safety rules |
| [docs/USABILITY_TEST_KIT.md](docs/USABILITY_TEST_KIT.md) | T30 moderator guide, participant tasks, safety briefing and study workflow |
| [docs/USABILITY_PARTICIPANT_SURVEY.md](docs/USABILITY_PARTICIPANT_SURVEY.md) | Reusable post-task participant survey |
| [docs/USABILITY_SESSION_SCORECARD.md](docs/USABILITY_SESSION_SCORECARD.md) | Per-session scorecard and aggregate worksheet for the eight PRD targets |

## Getting started
```bash
npm install
cp .env.example .env.local     # fill in values as each task needs them
npm run dev                    # http://localhost:3000
```

Each Git worktree needs its own untracked `.env.local`. Git does not copy ignored secret files into a new worktree. If a review preview opens with `status=not_configured`, confirm that the worktree running Next.js has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`; do not commit or print their values.

### Sign-in (email and password, invite-only)

ZapFix permits only emails listed in the `invites` table with status `invited` or `active`. Nobody signs up on the site: the project owner creates each tester's account.

In Supabase:

1. Authentication, Sign In / Providers, Email: turn **off** "Allow new users to sign up".
2. Add a tester: Authentication, Users, **Add user**, **Create new user**. Enter their email and a password, and tick **Auto Confirm User** (no email is sent).
3. Add the same email to the invite list in the SQL editor. Use lowercase:

```sql
insert into public.invites (email, status)
values ('tester@example.com', 'invited')
on conflict (email) do update set status = 'invited';
```

At sign-in ZapFix checks the password with Supabase first, then the invite. A wrong password gives the same message whether or not the email is invited. A valid password with a missing or `revoked` invite is signed out again, and the first successful sign-in changes `invited` to `active`.

| Command | What it does |
| --- | --- |
| `npm run check` | Type check + lint + unit tests. Run before every push |
| `npm test` | Unit tests (Vitest) |
| `npm run eval` | AI and rules evaluation set (evals/) |
| `npm run e2e` | End-to-end tests (Playwright) |
| `tests/db/run.sh` | Database safety tests against a scratch Postgres (needs `psql`) |
| `npm run db:workflow-smoke -- --confirm --user-id <uuid> --connection-id <uuid>` | Non-destructive T10 persistence smoke test using an existing test user and Google connection |
| `npm run db:generate` / `db:migrate` | Create and apply Drizzle migrations |

The Playwright suite requires a dedicated invited Supabase user that has never connected a real
Google or Slack account. Set `E2E_TEST_EMAIL`, `E2E_TEST_PASSWORD`, and `CONFIRM_E2E=yes` in
`.env.local`. Setup deletes only that user's `e2e:%` workflows, seeds fake encrypted tokens, and
starts the app with recorded external-app and AI fixtures; it never calls Google, Slack, or
Anthropic.

## Current project state

The foundation and most of the Calendar recovery path are implemented:

- Invite-only Supabase authentication with email and password.
- Google and Slack connection management with encrypted server-side tokens.
- Workflow creation, editing, validation, version-conflict handling, and test runs.
- Real adapters for Google Calendar, Google Sheets, Gmail, Google Drive, and Slack, with recorded fixtures for the verified behaviors documented in the task briefs.
- Run orchestration, retry guards, attempt history, deterministic diagnosis rules, proposal persistence, approval enforcement, configuration restore, rate limits, and audit events.
- Connections, workflow editor, run detail, result and restore, and manual-mode interfaces.
- A responsive Zapier-inspired application shell, useful dashboard, shared page and form surfaces, labeled notices and statuses, consistent loading/empty/error/success states, and an explicit Build → Run → Diagnose → Approve → Retry or restore journey.
- Keyboard-accessible mobile navigation, skip navigation, visible focus treatment, and guarded restore dialogs with contained focus, Escape dismissal, and focus restoration.
- Drizzle schema for all 12 tables, integrity triggers, row-level security, and 28 database safety checks.
- A test-only fake adapter for deterministic development and CI. It is never registered as a product integration.

The current local baseline on `main` is 63 passing Vitest files and 749 passing tests. Three real-database suites are skipped unless the required scratch-database safeguards are enabled.

## Remaining milestone work

The Calendar milestone is not complete until the user can finish the entire guarded recovery journey. The main remaining work is:

- **T19 live verification:** the diagnosis, proposal, approval, decision, and result handoff interfaces are implemented; verify approve, alternate-option, reject, exit, retry, and restore against a real failed Calendar run.
- **T22 and T23:** real-model smoke verification and prompt tuning against the evaluation set. These tasks are owned by Dikshyant.
- **T24:** expand the rules and AI evaluation set and wire its quality gates into CI.
- **T28:** finish the remaining integration coverage for the eleven safety tests.
- **T29:** fixture-based end-to-end coverage plus a live Calendar smoke checklist.
- **T30 validation:** the usability kit and measurement materials are complete, but no participant sessions have been run and no usability target has been validated.
- **T31 and T32:** production setup, vendor checks, live smoke runs, and launch verification.

Task ownership, dependencies, acceptance criteria, and the most current per-task status live in [`docs/TASK_BRIEFS.md`](docs/TASK_BRIEFS.md). Search for `TODO(T` to find remaining implementation markers, but use the task brief—not TODO count alone—to decide whether a task is complete.

## Structure
```
app/            Next.js pages and API route handlers (thin: validate, authorize, call a service)
components/     UI building blocks (DiffView, ConfidenceBadge, EvidenceList, ...)
server/         All backend logic, one folder per module (see docs/TDD.md section 10)
db/             Drizzle schema, migrations, and SQL policies (RLS + integrity triggers)
lib/            Shared types, Zod schemas, error codes (single definition of every API and AI shape)
evals/          The AI and rules evaluation set and runner
tests/          unit/, integration/, db/, e2e/, fixtures/ (recorded real app errors)
docs/           TDD, decisions, team split, working agreement
```

## License
MIT
