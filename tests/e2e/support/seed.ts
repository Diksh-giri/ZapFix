import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "@/db/schema";
import { connections, connectionSecrets, workflows } from "@/db/schema";
import { getDatabaseUrl } from "@/db/connection";
import { parseKey } from "@/server/connections/crypto";
import { sealStaticToken, sealTokens } from "@/server/connections/token-bundle";
import type { Provider } from "@/lib/types";
import type { ActionConfig, TriggerSchema } from "@/lib/schemas/workflow-config";

/**
 * Reads TOKEN_ENCRYPTION_KEY directly (not via server/connections/secrets.ts's getTokenKey,
 * which is "server-only" and refuses to load outside a Next.js server bundle -- this script runs
 * standalone under tsx instead, the same way scripts/*.ts already do).
 */
function getTokenKey(): { key: Buffer; version: number } {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error("TOKEN_ENCRYPTION_KEY is not set. Add it to .env.local.");
  return { key: parseKey(raw), version: Number(process.env.TOKEN_KEY_VERSION ?? "1") };
}

/**
 * Seeds one broken Calendar workflow and one broken Slack workflow, and their Google/Slack
 * connections, for the e2e test user (T29). Never goes through real OAuth: the connections'
 * tokens are fake values the fixture-mocked adapter (tests/e2e/support/fixture-fetch.ts) never
 * actually sends anywhere. The Google token's expiry is set far in the future so getAccessToken()
 * skips the refresh call entirely (which would otherwise hit Google's real token endpoint --
 * there is no fixture for that, by design, since no e2e scenario needs a token refresh).
 *
 * Google Sheets has no e2e workflow yet: unlike Calendar and Slack, there are no real recorded
 * Sheets fixtures beyond an auth-error one (tests/fixtures/google-sheets/), and AGENTS.md section
 * 9 is explicit that app behavior must never be guessed -- a live Sheets call needs to be recorded
 * first (see docs/TASK_BRIEFS.md's T29 status line).
 *
 * SAFETY: the unique constraint on connections is (userId, provider) -- one Google and one Slack
 * connection per user, period. Run this against the wrong user id and it does not create a
 * second, separate connection; it overwrites whatever real one is already there. So every write
 * here first checks the existing row's own account_label for the e2e marker this script itself
 * set, and refuses to touch anything else. This script must only ever be pointed at a dedicated
 * CI/e2e test user that has never connected a real Google or Slack account.
 *
 * Run standalone: npx tsx tests/e2e/support/seed.ts --user-id <uuid> --confirm
 * Playwright's global setup imports seedCalendarWorkflow()/seedSlackWorkflow() directly instead.
 */
export interface SeededCalendar {
  workflowId: string;
  connectionId: string;
}

const E2E_LABEL: Record<Provider, string> = {
  google: "zapfix-e2e-test-connection (google)",
  slack: "zapfix-e2e-test-connection (slack)",
};

const TRIGGER_SCHEMA: TriggerSchema = {
  fields: [
    { key: "title", label: "Title", type: "text" },
    { key: "email", label: "Email", type: "email" },
    { key: "contact_email", label: "Contact email", type: "email" },
  ],
};

const ACTION_CONFIG: ActionConfig = {
  title: { kind: "static", value: "ZapFix e2e test event" },
  start: { kind: "static", value: "2030-06-15T10:00:00Z" },
  end: { kind: "static", value: "2030-06-15T11:00:00Z" },
  attendee_email: { kind: "mapped", source: "email" },
};

const SLACK_TRIGGER_SCHEMA: TriggerSchema = {
  fields: [
    { key: "channel", label: "Channel", type: "text" },
    { key: "backup_channel", label: "Backup channel", type: "text" },
  ],
};

const SLACK_ACTION_CONFIG: ActionConfig = {
  text: { kind: "static", value: "ZapFix e2e test message" },
  channel: { kind: "mapped", source: "channel" },
};

function client() {
  return drizzle(postgres(getDatabaseUrl(), { prepare: false }), { schema });
}

/**
 * Inserts the e2e connection if none exists for this user+provider, or reuses the existing row
 * IF AND ONLY IF it was itself created by this script (accountLabel carries the e2e marker).
 * Throws rather than touching a connection this script did not create.
 */
async function ownedE2eConnectionId(
  db: ReturnType<typeof client>,
  userId: string,
  provider: Provider,
): Promise<string> {
  const [existingForProvider] = await db
    .select({ id: connections.id, accountLabel: connections.accountLabel })
    .from(connections)
    .where(and(eq(connections.userId, userId), eq(connections.provider, provider)));

  if (existingForProvider) {
    if (existingForProvider.accountLabel !== E2E_LABEL[provider]) {
      throw new Error(
        `Refusing to seed: user ${userId} already has a REAL ${provider} connection ` +
          `(account_label "${existingForProvider.accountLabel}"). This script only ever writes to a ` +
          "connection it created itself. Point it at a dedicated e2e test user instead.",
      );
    }
    return existingForProvider.id;
  }

  const [created] = await db
    .insert(connections)
    .values({ userId, provider, status: "active", scopes: [], accountLabel: E2E_LABEL[provider] })
    .returning({ id: connections.id });
  if (!created) throw new Error(`Could not create the e2e ${provider} connection.`);
  return created.id;
}

export async function seedCalendarWorkflow(userId: string): Promise<SeededCalendar> {
  const db = client();
  const { key, version } = getTokenKey();

  const connectionId = await ownedE2eConnectionId(db, userId, "google");

  const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const ciphertext = sealTokens(
    { accessToken: "e2e-fake-access-token", refreshToken: "e2e-fake-refresh-token", expiresAt: farFuture, scope: "calendar.events.owned" },
    key,
  );
  await db
    .insert(connectionSecrets)
    .values({ connectionId, ciphertext, keyVersion: version })
    .onConflictDoUpdate({ target: connectionSecrets.connectionId, set: { ciphertext, keyVersion: version } });

  const [workflow] = await db
    .insert(workflows)
    .values({
      userId,
      name: "e2e: broken Calendar event",
      app: "google_calendar",
      actionKey: "create_event",
      connectionId,
      triggerSchema: TRIGGER_SCHEMA,
      actionConfig: ACTION_CONFIG,
    })
    .returning({ id: workflows.id });
  if (!workflow) throw new Error("Could not create the e2e Calendar workflow.");

  return { workflowId: workflow.id, connectionId };
}

export async function seedSlackConnection(userId: string): Promise<{ connectionId: string }> {
  const db = client();
  const { key, version } = getTokenKey();

  const connectionId = await ownedE2eConnectionId(db, userId, "slack");

  const ciphertext = sealStaticToken({ accessToken: "e2e-fake-bot-token", scope: "chat:write" }, key);
  await db
    .insert(connectionSecrets)
    .values({ connectionId, ciphertext, keyVersion: version })
    .onConflictDoUpdate({ target: connectionSecrets.connectionId, set: { ciphertext, keyVersion: version } });

  return { connectionId };
}

/**
 * Seeds one broken Slack message workflow for the e2e test user: "Channel" is mapped from an
 * always-blank trigger field, with "Backup channel" as the one real alternative -- the same
 * missing-field-with-one-alternative shape as the Calendar workflow, matching the recorded AI
 * reply in evals/ai-recordings/slack-empty-channel-one-alternative.txt.
 */
export async function seedSlackWorkflow(userId: string): Promise<SeededCalendar> {
  const db = client();
  const { connectionId } = await seedSlackConnection(userId);

  const [workflow] = await db
    .insert(workflows)
    .values({
      userId,
      name: "e2e: broken Slack message",
      app: "slack",
      actionKey: "post_message",
      connectionId,
      triggerSchema: SLACK_TRIGGER_SCHEMA,
      actionConfig: SLACK_ACTION_CONFIG,
    })
    .returning({ id: workflows.id });
  if (!workflow) throw new Error("Could not create the e2e Slack workflow.");

  return { workflowId: workflow.id, connectionId };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const userId = args[args.indexOf("--user-id") + 1];
  if (!userId || !args.includes("--confirm")) {
    console.error("Refusing to run without --confirm and an explicit --user-id.");
    console.error("Usage: npx tsx tests/e2e/support/seed.ts --user-id <uuid> --confirm");
    console.error("This must be a dedicated e2e/CI test user that has never connected a real Google or Slack account.");
    process.exit(1);
  }
  seedCalendarWorkflow(userId)
    .then((calendar) => seedSlackWorkflow(userId).then((slack) => ({ calendar, slack })))
    .then((result) => {
      console.log("Seeded:", result);
      process.exit(0);
    })
    .catch((err) => {
      console.error(err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
