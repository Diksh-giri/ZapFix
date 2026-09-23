# Locked decisions

All 34 were proposed with options and approved by the product owner. To change one, both of you must agree
and the TDD must be updated in the same PR. Full reasoning: TDD sections 6 and 29.

| # | Topic | Decision |
| --- | --- | --- |
| 001 | Integrations | Fully real integrations (not simulated) |
| 002 | Apps | Google Calendar, Slack, Google Sheets. Gmail deferred |
| 003 | Templates | Small set, SHOULD HAVE, after the core flow; includes deliberately broken ones |
| 004 | Trigger | Built-in form / sample-data trigger |
| 005 | Editing proposals | Approve, reject, or pick from valid options. No free text |
| 006 | Multi-change repairs | One change per approval, in sequence |
| 007 | Failed repairs | Stop proposing after two applied-but-unsuccessful repairs |
| 008 | Accounts | Invite-only testers connect their own accounts, with guardrails |
| 009 | Diagnosis | Rules plus AI. Rules build valid fixes; AI explains and selects |
| 010 | Retry | Only the failed step, saved data, one attempt per click, uncertain outcomes need confirmation |
| 011 | Restore | Undo each debugger change, most recent first; warn before overwriting manual edits |
| 012 | MVP boundary | MUST / SHOULD / FUTURE lists in TDD section 5 |
| 013 | App structure | One full-stack TypeScript app, Next.js |
| 014 | Database | PostgreSQL, managed |
| 015 | Sign-in | Managed authentication service |
| 016 | Slow work | Inline with status records. No queue |
| 017 | AI provider | Anthropic API, mid-tier model, behind a thin wrapper |
| 018 | Data sent to AI | Field names and value shapes only. Never credentials |
| 019 | Hosting | Vercel + Supabase (database and sign-in) |
| 020 | Connections | We build the Connect flows; tokens encrypted, server-only |
| 021 | Metrics | Our own event records in PostgreSQL |
| 022 | Exclusions | No file storage, search, notifications, caching, queue, API gateway |
| 023 | Toolkit | TypeScript, Zod, Drizzle, Tailwind + shadcn/ui, Vitest + Playwright, Anthropic SDK |
| 024 | Modules | Eleven modules (TDD section 10) |
| 025 | Database model | Tables and integrity rules (TDD section 13) |
| 026 | API design | 17 rows / 18 endpoints (TDD section 14) |
| 027 | Approve and apply | One step: a single all-or-nothing confirm |
| 028 | Confidence | High / Medium / Low. Rules set the ceiling. No fix on Low |
| 029 | AI evaluation | Fixed test set (about 40 cases), automatic checks |
| 030 | Error states | TDD section 20 |
| 031 | AI unavailable | Manual fallback: evidence, fixed tips, retry diagnosis. No fix |
| 032 | Google 7-day limit | Stay in testing mode; plan reconnects around sessions |
| 033 | Security | TDD section 19 |
| 034 | Build order | Calendar end to end first, then Slack, then Sheets |
