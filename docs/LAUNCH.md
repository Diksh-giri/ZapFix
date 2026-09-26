# Production setup and launch checklist (T31, T32)

Written for Dikshyant and James, who are not technical. Each step says what to click and why.
Anything marked **CHECK** is a fact nobody has verified yet: read the vendor's current page and write the answer next to it.

Do the steps in order. Do not invite a tester until section 3 is fully ticked.

## 1. Production setup (T31)

### 1.1 A separate production Supabase project
Never reuse zapfix-dev or zapfix-scratch for real testers.
- [ ] Create a new Supabase project (for example `zapfix-prod`). Save its database password in a password manager, not in a file in the repo.
- [ ] Authentication, Sign In / Providers, Email: turn **off** "Allow new users to sign up". Nobody can create their own account.
- [ ] Apply the database structure: with `DATABASE_URL` pointing at the production **Session pooler** connection string, run `npm run db:migrate`. This creates the 12 tables and the safety rules (approvals cannot be edited, a change needs an approval, each user sees only their own rows). Then run `npm run db:check`; it should list 12 tables.
- [ ] **Never** run `tests/db/safety.sql` or the integration tests against production. They empty the users table.

### 1.2 Testers and their accounts
Sign-in is email and password, and only invited people can get in. For each tester:
- [ ] Authentication, Users, **Add user**, **Create new user**: their email and a password, with **Auto Confirm User** ticked.
- [ ] SQL editor, with their email in lowercase:
  ```sql
  insert into public.invites (email, status) values ('tester@example.com', 'invited')
  on conflict (email) do update set status = 'invited';
  ```
- [ ] Send them the password through a private channel, and ask them to keep it private.
- Removing a tester: set their invite to `revoked`. Known gap: a tester who is already signed in stays signed in until their session ends. To end it now, delete their user in Authentication, Users.

### 1.3 Vercel
- [ ] Create the Vercel project from the GitHub repo and note the production web address.
- [ ] Add these as **Environment Variables** (Production only). None may start with `NEXT_PUBLIC_` except the first two, because that prefix makes a value visible to every browser.

| Name | What it is |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public by design (the project address and the public key) |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret. Bypasses row-level security. Server only |
| `DATABASE_URL` | Secret. Production Session pooler string |
| `TOKEN_ENCRYPTION_KEY`, `TOKEN_KEY_VERSION` | Secret. Encrypts the Google and Slack tokens. Make a **new** key for production; never reuse the dev one |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth app |
| `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` | Slack app |
| `ANTHROPIC_API_KEY`, `AI_MODEL` | The AI provider key and the model name |
| `APP_CALL_TIMEOUT_MS`, `AI_CALL_TIMEOUT_MS`, `STALE_RUNNING_MS` | Time limits (15000, 25000 and 90000 are the working values) |

- [ ] Never paste any of these into a chat, a document, a commit or a screenshot.

### 1.4 Google (stays in Testing mode, Decision 032)
- [ ] In the Google Cloud project, OAuth consent screen: leave the publishing status on **Testing**.
- [ ] **Add every tester's Google account as a test user.** Anyone not listed sees "access blocked".
- [ ] Authorized redirect URI: `https://<production address>/api/connections/google/callback`
- [ ] Scopes must be exactly the approved list: `openid`, `email`, Calendar `calendar.events.owned`, Sheets `spreadsheets`, Gmail `gmail.send`, Drive `drive.file`. Do not add any others (Gmail read, full Drive and similar need Google's security review).
- [ ] Reminder for testers: in Testing mode Google connections **expire after 7 days**. They reconnect before each session.

### 1.5 Slack
- [ ] Slack app with only the bot scopes `chat:write` and `chat:write.public`.
- [ ] Redirect URL (must be HTTPS): `https://<production address>/api/connections/slack/callback`
- [ ] Install it only in a **test workspace** with a test channel.

### 1.6 The encryption key and rotating it
Tokens are encrypted with one key at a time (`TOKEN_ENCRYPTION_KEY`, numbered by `TOKEN_KEY_VERSION`). Automatic rotation is **not built**. Proposed plan, to agree together:
- To replace the key, set a new key and increase `TOKEN_KEY_VERSION`, then ask testers to reconnect. Google connections expire every 7 days anyway, and reconnecting stores a fresh token under the new key.
- Keep the old key value in the password manager until every tester has reconnected.
- If a key is ever exposed: replace it right away and disconnect all connections (Connections screen, or delete the rows in `connections`).

### 1.7 Plans and terms (CHECK each)
- [ ] **CHECK** Anthropic (AI provider): how long is prompt data kept, and is it used for training? The AI only ever sees field names and value shapes, but read the terms and write down the answer.
- [ ] **CHECK** Vercel plan: do the free (Hobby) terms allow this use? Free plans are usually for non-commercial use.
- [ ] **CHECK** Supabase free tier: pausing after inactivity, database size and email limits. (Sign-in no longer sends email, so the email limit that blocked magic links no longer applies.)

## 2. Before the first tester (T32)

- [ ] **All eleven safety tests pass.** See `docs/SAFETY_TESTS.md`. CI must be green on the release, including the real-database tests.
- [ ] **A live run for each app**, using your own test accounts: connect, build a workflow, run it, make it fail on purpose, read the explanation, approve the fix, retry, then restore. Do it once for Calendar, Slack, Sheets, Gmail and Drive.
- [ ] **Real error samples are saved** for each app (sanitized) under `tests/fixtures/`, and the evaluation set (`npm run eval`) covers them.
- [ ] **Measured AI cost** is written down: run `npx tsx scripts/ai-smoke.ts` and record the tokens per diagnosis.
- [ ] The section 1.7 answers are written down.

## 3. The tester briefing
Send this before anyone signs in. Say it plainly:
- [ ] **ZapFix runs real actions on real accounts.** Use a test calendar, a test Slack channel and a test spreadsheet. Never use someone else's account.
- [ ] Nothing changes in a workflow unless you press Confirm. Every change can be undone with Restore. Restore changes ZapFix settings only; it cannot un-send an email or un-post a message.
- [ ] The AI explanation is labelled "AI-generated" and may be wrong. The checked facts are shown separately.
- [ ] Reconnect Google before each session, because it expires after 7 days.
- [ ] How to reach you if something looks wrong.

## 4. Then invite testers
- [ ] Add each tester (section 1.2) and to Google's test users (section 1.4) and to the Slack test workspace.
- [ ] Watch the first session live.
- [ ] After each session, check the events and metrics queries in `server/audit/metrics.sql`.
