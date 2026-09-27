import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { z } from "zod";
import * as schema from "@/db/schema";
import { diagnoses, proposals, runs, stepAttempts, workflows } from "@/db/schema";
import { getDatabaseUrl } from "@/db/connection";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import { createDrizzleWorkflowStore } from "@/server/workflows/drizzle-store";

const ArgsSchema = z.object({
  confirm: z.literal(true),
  userId: z.string().uuid(),
  connectionId: z.string().uuid(),
});

function readArgs() {
  const args = process.argv.slice(2);
  const value = (name: string) => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  return ArgsSchema.safeParse({
    confirm: args.includes("--confirm") || undefined,
    userId: value("--user-id"),
    connectionId: value("--connection-id"),
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const actionConfig: ActionConfig = {
  title: { kind: "mapped", source: "title" },
  start: { kind: "static", value: "2026-03-15T10:00:00Z" },
  end: { kind: "static", value: "2026-03-15T11:00:00Z" },
  attendee_email: { kind: "static", value: "workflow-smoke@example.com" },
};

async function main() {
  const parsed = readArgs();
  if (!parsed.success) {
    console.error("Refusing to run without --confirm and explicit test user and connection UUIDs.");
    console.error("Usage: npm run db:workflow-smoke -- --confirm --user-id <uuid> --connection-id <uuid>");
    process.exitCode = 1;
    return;
  }

  const { userId, connectionId } = parsed.data;
  const client = postgres(getDatabaseUrl(), { prepare: false, max: 1, connect_timeout: 10 });
  const db = drizzle(client, { schema });
  const store = createDrizzleWorkflowStore(db);
  let workflowId: string | undefined;

  try {
    const connection = await store.getConnection(connectionId, userId);
    assert(connection?.provider === "google", "The supplied connection is not this test user's Google connection.");

    const created = await store.create({
      userId,
      name: `T10 workflow smoke ${randomUUID()}`,
      app: "google_calendar",
      actionKey: "create_event",
      connectionId,
      triggerSchema: { fields: [{ key: "title", label: "Title", type: "text" }] },
      actionConfig,
    });
    workflowId = created.id;
    assert(created.configVersion === 1, "Create did not start at config version 1.");
    assert(created.lastModifiedBy === "user", "Create did not record the user as the modifier.");

    const listed = await store.list(userId);
    assert(listed.some((workflow) => workflow.id === created.id), "The owner could not list the created workflow.");
    assert((await store.get(created.id, userId))?.id === created.id, "The owner could not read the created workflow.");
    assert(await store.get(created.id, randomUUID()) === undefined, "Another user could read the workflow.");

    const updated = await store.update({
      id: created.id,
      userId,
      name: "T10 workflow smoke updated",
      expectedConfigVersion: 1,
    });
    assert(typeof updated !== "string" && updated.configVersion === 2, "The first update did not create version 2.");
    assert(updated.lastModifiedBy === "user", "The update did not record the user as the modifier.");

    const stale = await store.update({
      id: created.id,
      userId,
      name: "This stale update must not apply",
      expectedConfigVersion: 1,
    });
    assert(stale === "version_conflict", "A stale update was not rejected as a version conflict.");

    const [run] = await db.insert(runs).values({
      workflowId: created.id,
      userId,
      triggerData: { title: "Smoke test" },
      status: "failed",
    }).returning({ id: runs.id });
    assert(run, "Could not create the temporary run.");

    const [attempt] = await db.insert(stepAttempts).values({
      runId: run.id,
      attemptNo: 1,
      status: "failed",
      configSnapshot: actionConfig,
      idempotencyKey: `${run.id}:action:1`,
    }).returning({ id: stepAttempts.id });
    assert(attempt, "Could not create the temporary attempt.");

    const [diagnosis] = await db.insert(diagnoses).values({
      attemptId: attempt.id,
      category: "invalid_format",
      supported: true,
      ruleEvidence: [],
      candidates: [],
      confidenceCeiling: "medium",
      aiStatus: "unavailable",
    }).returning({ id: diagnoses.id });
    assert(diagnosis, "Could not create the temporary diagnosis.");

    const proposalRows = await db.insert(proposals).values([
      {
        diagnosisId: diagnosis.id,
        workflowId: created.id,
        kind: "config_change",
        fieldPath: "actionConfig.start",
        currentValue: actionConfig.start,
        proposedValue: actionConfig.start,
        validOptions: [],
        expectedEffect: "Smoke-test pending proposal",
        baseConfigVersion: 2,
        status: "pending",
      },
      {
        diagnosisId: diagnosis.id,
        workflowId: created.id,
        kind: "config_change",
        fieldPath: "actionConfig.end",
        currentValue: actionConfig.end,
        proposedValue: actionConfig.end,
        validOptions: [],
        expectedEffect: "Smoke-test decided proposal",
        baseConfigVersion: 2,
        status: "decided",
      },
    ]).returning({ id: proposals.id, status: proposals.status });
    const pending = proposalRows.find((proposal) => proposal.status === "pending");
    const decided = proposalRows.find((proposal) => proposal.status === "decided");
    assert(pending && decided, "Could not create both temporary proposals.");

    const secondUpdate = await store.update({
      id: created.id,
      userId,
      name: "T10 workflow smoke final",
      expectedConfigVersion: 2,
    });
    assert(typeof secondUpdate !== "string" && secondUpdate.configVersion === 3, "The second update did not create version 3.");

    const statuses = await db
      .select({ id: proposals.id, status: proposals.status })
      .from(proposals)
      .where(inArray(proposals.id, [pending.id, decided.id]));
    assert(statuses.find((proposal) => proposal.id === pending.id)?.status === "expired", "The pending proposal was not expired.");
    assert(statuses.find((proposal) => proposal.id === decided.id)?.status === "decided", "The decided proposal was changed.");

    console.log("PASS  create starts at version 1");
    console.log("PASS  list and read are owner-scoped");
    console.log("PASS  updates increment the version");
    console.log("PASS  stale updates return version_conflict");
    console.log("PASS  pending proposals expire while decided proposals stay unchanged");
  } finally {
    if (workflowId) {
      await db.delete(workflows).where(and(eq(workflows.id, workflowId), eq(workflows.userId, userId)));
    }
    await client.end({ timeout: 5 });
  }
}

void main().catch((error: unknown) => {
  console.error(`FAIL  ${error instanceof Error ? error.message : "Unknown database error."}`);
  process.exitCode = 1;
});
