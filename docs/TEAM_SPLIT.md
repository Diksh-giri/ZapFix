# Team split (DRAFT: agree on this together, then edit)

Two lanes. Each lane has a clear set of tasks and its own folders, so you rarely edit the same files.
The lanes meet at four **contracts** that are already written in the scaffold, so neither of you waits for the other.

**Person A / Person B:** fill in names here once decided. Swap the lanes if that fits your strengths better.
The split is by *kind of work*, not by importance: both lanes are needed for Milestone 1.

## Lane A: Safety core (data, connections, running and applying changes)
Best for whoever is stronger at backend, databases and security-minded code.

| Task | What | Where it lives |
| --- | --- | --- |
| T5-T7 | Database: run the migration on Supabase, apply `db/policies/001_integrity.sql`, keep `tests/db/` green | `db/`, `tests/db/` |
| T9 | Connections: Google OAuth, encrypted tokens, renewal, disconnect | `server/connections/` |
| T11 | Google Calendar adapter and **recorded real error fixtures** | `server/adapters/google-calendar/`, `tests/fixtures/` |
| T12 | Run Engine: attempts, write-ahead status, retry guard | `server/runs/` |
| T14 | Proposal and approval, the one-transaction confirm, restore | `server/proposals/`, `server/changes/` |
| T15 | Events, metric queries, rate limits | `server/audit/` |
| Later | T25 Slack adapter, T26 Sheets adapter, T28 full safety suite | |

## Lane B: Experience and intelligence (workflows, diagnosis, AI, screens)
Best for whoever is stronger at frontend, product thinking and working with the AI.

| Task | What | Where it lives |
| --- | --- | --- |
| T3 | Sign-in screen and invite gate | `app/(auth)`, `server/access/` |
| T10 | Workflow service: create, edit, validate mappings and transforms | `server/workflows/`, `app/api/workflows` |
| T13 | Diagnosis rules for the three categories | `server/diagnosis/rules/` |
| T16-T21 | All screens: connections, editor, run detail, debugger panel, confirm dialog, restore, manual mode | `app/`, `components/` |
| T22-T24 | AI client, prompt, output validation tuning, the evaluation set | `server/diagnosis/ai/`, `evals/` |
| Later | T27 templates and SHOULD-HAVE screens, T29 end-to-end tests, T30 usability kit | |

## Do together (pair, or one person with the other's sign-off)
- **T2 Accounts and setup:** one of you creates the Supabase, Vercel, Google Cloud and Slack projects; both have access. Use the checklist in TDD section 24.
- **T31-T32 Launch:** production setup, vendor terms check, tester briefing.
- **Any PR touching safety-critical code** (see the working agreement).

## The four contracts between the lanes (already in the scaffold)
| Contract | Written in | Lane A produces | Lane B consumes |
| --- | --- | --- | --- |
| Standard error format | `lib/schemas/standard-error.ts` | Adapters return it | Rules read it |
| API request and response shapes | `lib/schemas/api.ts`, TDD section 14 | Handlers for runs, confirm, restore | Screens call them |
| Adapter interface and the **fake adapter** | `server/adapters/types.ts`, `server/adapters/fake/` | Real adapters | Lane B builds and tests rules and screens against the fake before Calendar works |
| Recorded real errors | `tests/fixtures/`, `evals/cases/` | Saves each new real error response (sanitized) | Turns each into a rule case and an eval case |

## Suggested order to reach Milestone 1 (full loop on Calendar)
1. Both: T2 accounts, then confirm `npm run check` and `tests/db/run.sh` pass on both laptops.
2. A: T5/T6 on real Supabase, then T9 (Google connect). B: T3 (sign-in), T10 (workflow service), T17 (editor) using the fake adapter.
3. A: T11 (Calendar) + fixtures, then T12 (run engine). B: T13 (rules) against the fixtures, T18 (run detail).
4. A: T14 (confirm, restore). B: T22-T23 (AI), T19-T21 (debugger screens).
5. Both: T24 eval set, an end-to-end run on Calendar, first usability session.

## Checkpoints
- **End of step 2:** a signed-in, invited tester can connect Google and save a workflow.
- **End of step 3:** a broken Calendar workflow fails with a real error, and the debugger shows a rules-based diagnosis.
- **Milestone 1:** the full loop works on Calendar, including approve, retry and restore.
