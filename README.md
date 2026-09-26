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

## Getting started
```bash
npm install
cp .env.example .env.local     # fill in values as each task needs them
npm run dev                    # http://localhost:3000
```

### Supabase magic-link sign-in

ZapFix permits only emails listed in the `invites` table with status `invited` or `active`.

In Supabase Authentication settings:

1. Disable public user sign-ups. ZapFix creates the Supabase Auth user server-side only after the email passes the invite check.
2. Add `http://localhost:3000/auth/confirm` and the deployed `/auth/confirm` URL to the redirect allow list.
3. Set the magic-link email template link to:

   ```text
   {{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email
   ```

Add testers through the Supabase SQL editor; use lowercase email addresses:

```sql
insert into public.invites (email, status)
values ('tester@example.com', 'invited')
on conflict (email) do update set status = 'invited';
```

After Supabase verifies the link, ZapFix checks the invite again and changes its status to `active`.

| Command | What it does |
| --- | --- |
| `npm run check` | Type check + lint + unit tests. Run before every push |
| `npm test` | Unit tests (Vitest) |
| `npm run eval` | AI and rules evaluation set (evals/) |
| `npm run e2e` | End-to-end tests (Playwright) |
| `tests/db/run.sh` | Database safety tests against a scratch Postgres (needs `psql`) |
| `npm run db:generate` / `db:migrate` | Create and apply Drizzle migrations |

## What already works in this scaffold
- Next.js 16 + TypeScript + Tailwind app shell; every page and all 18 API endpoints exist as stubs that return the standard error body (`501 not_implemented`), each pointing at its task ID.
- **Real, tested safety logic:** retry guards, AI output validation, AI payload builder (names and shapes only), token encryption, change applier, approval-summary hash, config resolution, one worked diagnosis rule.
- **Database:** Drizzle schema for all 12 tables, a generated migration, and SQL for the integrity triggers and row-level security. **28 database safety checks pass** against real Postgres (`tests/db/`).
- A test-double adapter (`server/adapters/fake`) so the whole loop can be built before the real Google and Slack adapters exist. It is a test tool, not the product (Decision #001).

## What is NOT built yet
Sign-in and invite gate (T3), connections and the real adapters (T9, T11, T25, T26), run orchestration (T12), the other two diagnosis rules (T13), proposal and confirm transaction (T14), the AI client and prompt tuning (T22, T23), all real screens (T16 to T21). Search the code for `TODO(T` to find each one.

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
