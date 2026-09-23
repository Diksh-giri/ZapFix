import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  customType,
  index,
  integer,
  jsonb,
  pgSchema,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Database model from TDD section 13 (Decision #025). Column types are proposals; refine in T5.
 * The safety rules that cannot be expressed here (triggers, row-level security, FK to auth.users)
 * live in db/policies/001_integrity.sql and MUST be applied: see README "Database".
 */

const ts = (name: string) => timestamp(name, { withTimezone: true }).notNull().defaultNow();
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const invites = pgTable(
  "invites",
  {
    email: text("email").primaryKey(),
    status: text("status").notNull().default("invited"),
    createdAt: ts("created_at"),
  },
  (t) => [check("invites_status_chk", sql`${t.status} in ('invited','active','revoked')`)],
);

export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(), // FK to auth.users in 001_integrity.sql
    provider: text("provider").notNull(),
    status: text("status").notNull().default("active"),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    accountLabel: text("account_label"),
    connectedAt: ts("connected_at"),
    lastErrorCode: text("last_error_code"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    uniqueIndex("connections_user_provider_uq").on(t.userId, t.provider),
    check("connections_provider_chk", sql`${t.provider} in ('google','slack')`),
    check("connections_status_chk", sql`${t.status} in ('active','needs_reconnect','revoked')`),
  ],
);

/** Encrypted tokens live in a separate schema the browser roles cannot read (Decision #020). */
export const privateSchema = pgSchema("private");
export const connectionSecrets = privateSchema.table("connection_secrets", {
  connectionId: uuid("connection_id")
    .primaryKey()
    .references(() => connections.id, { onDelete: "cascade" }),
  ciphertext: bytea("ciphertext").notNull(),
  keyVersion: integer("key_version").notNull().default(1),
  updatedAt: ts("updated_at"),
});

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    name: text("name").notNull(),
    app: text("app").notNull(),
    actionKey: text("action_key").notNull(),
    connectionId: uuid("connection_id").references(() => connections.id),
    triggerSchema: jsonb("trigger_schema").notNull(),
    actionConfig: jsonb("action_config").notNull(),
    configVersion: integer("config_version").notNull().default(1),
    lastModifiedBy: text("last_modified_by").notNull().default("user"),
    createdAt: ts("created_at"),
    updatedAt: ts("updated_at"),
  },
  (t) => [
    index("workflows_user_updated_idx").on(t.userId, t.updatedAt),
    check("workflows_modified_by_chk", sql`${t.lastModifiedBy} in ('user','debugger')`),
  ],
);

export const runs = pgTable(
  "runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
    userId: uuid("user_id").notNull(),
    triggerData: jsonb("trigger_data").notNull(),
    status: text("status").notNull().default("running"),
    /** Applied debugger changes followed by a failed retry. At 2, no new proposals (Decision #007). */
    repairCount: smallint("repair_count").notNull().default(0),
    startedAt: ts("started_at"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("runs_workflow_started_idx").on(t.workflowId, t.startedAt),
    check("runs_status_chk", sql`${t.status} in ('running','succeeded','failed','uncertain')`),
  ],
);

export const stepAttempts = pgTable(
  "step_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    runId: uuid("run_id").notNull().references(() => runs.id, { onDelete: "cascade" }),
    stepKey: text("step_key").notNull().default("action"),
    attemptNo: integer("attempt_no").notNull(),
    status: text("status").notNull(),
    configSnapshot: jsonb("config_snapshot").notNull(), // the config this attempt actually used
    requestSummary: jsonb("request_summary"),
    errorRaw: jsonb("error_raw"), // SANITIZED before storing
    errorStd: jsonb("error_std"),
    idempotencyKey: text("idempotency_key").notNull(),
    externalRef: text("external_ref"),
    startedAt: ts("started_at"),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("step_attempts_run_step_no_uq").on(t.runId, t.stepKey, t.attemptNo),
    // Safety rules enforced by the database (TDD section 13, design rules 3):
    uniqueIndex("step_attempts_one_running_uq").on(t.runId, t.stepKey).where(sql`${t.status} = 'running'`),
    uniqueIndex("step_attempts_one_success_uq").on(t.runId, t.stepKey).where(sql`${t.status} = 'succeeded'`),
    check("step_attempts_status_chk", sql`${t.status} in ('running','succeeded','failed','uncertain')`),
  ],
);

export const diagnoses = pgTable(
  "diagnoses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id").notNull().references(() => stepAttempts.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    supported: boolean("supported").notNull(),
    ruleEvidence: jsonb("rule_evidence").notNull(),
    candidates: jsonb("candidates").notNull(),
    confidenceCeiling: text("confidence_ceiling").notNull(),
    aiStatus: text("ai_status").notNull(),
    aiOutput: jsonb("ai_output"),
    confidence: text("confidence"),
    model: text("model"),
    createdAt: ts("created_at"),
  },
  (t) => [
    check(
      "diagnoses_category_chk",
      sql`${t.category} in ('missing_required_field','invalid_format','expired_connection','unsupported')`,
    ),
    check("diagnoses_ai_status_chk", sql`${t.aiStatus} in ('ok','unavailable','invalid')`),
    check(
      "diagnoses_confidence_within_ceiling_chk",
      sql`${t.confidence} is null or (case ${t.confidence} when 'high' then 3 when 'medium' then 2 else 1 end) <= (case ${t.confidenceCeiling} when 'high' then 3 when 'medium' then 2 else 1 end)`,
    ),
  ],
);

export const proposals = pgTable(
  "proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    diagnosisId: uuid("diagnosis_id").notNull().references(() => diagnoses.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    fieldPath: text("field_path"),
    currentValue: jsonb("current_value"),
    proposedValue: jsonb("proposed_value"),
    validOptions: jsonb("valid_options").notNull(),
    expectedEffect: text("expected_effect").notNull(),
    baseConfigVersion: integer("base_config_version").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: ts("created_at"),
  },
  (t) => [
    check("proposals_kind_chk", sql`${t.kind} in ('config_change','reconnect_guidance')`),
    check("proposals_status_chk", sql`${t.status} in ('pending','decided','superseded','expired')`),
  ],
);

/** Append-only (trigger in 001_integrity.sql). One decision per proposal. */
export const approvals = pgTable(
  "approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id").notNull().unique().references(() => proposals.id),
    userId: uuid("user_id").notNull(),
    decision: text("decision").notNull(),
    approvedFieldPath: text("approved_field_path"),
    approvedValue: jsonb("approved_value"),
    wasEdited: boolean("was_edited").notNull().default(false),
    summaryShown: jsonb("summary_shown").notNull(),
    decidedAt: ts("decided_at"),
  },
  (t) => [
    check("approvals_decision_chk", sql`${t.decision} in ('approved','rejected','exited')`),
    check(
      "approvals_approved_has_value_chk",
      sql`${t.decision} <> 'approved' or (${t.approvedFieldPath} is not null and ${t.approvedValue} is not null)`,
    ),
  ],
);

/** approval_id NOT NULL + UNIQUE: no change without an approval (TDD section 13, design rule 1). */
export const configChanges = pgTable(
  "config_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id, { onDelete: "cascade" }),
    approvalId: uuid("approval_id").notNull().unique().references(() => approvals.id),
    fieldPath: text("field_path").notNull(),
    beforeValue: jsonb("before_value").notNull(),
    afterValue: jsonb("after_value").notNull(),
    status: text("status").notNull().default("applied"),
    appliedAt: ts("applied_at"),
    restoredAt: timestamp("restored_at", { withTimezone: true }),
  },
  (t) => [
    index("config_changes_workflow_applied_idx").on(t.workflowId, t.appliedAt),
    check("config_changes_status_chk", sql`${t.status} in ('applied','restored')`),
  ],
);

export const events = pgTable(
  "events",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    userId: uuid("user_id").notNull(),
    runId: uuid("run_id"),
    type: text("type").notNull(),
    payload: jsonb("payload"),
    createdAt: ts("created_at"),
  },
  (t) => [
    index("events_type_created_idx").on(t.type, t.createdAt),
    index("events_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    userId: uuid("user_id").notNull(),
    bucket: text("bucket").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.bucket, t.windowStart] })],
);
