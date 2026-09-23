CREATE SCHEMA "private";
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"proposal_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"approved_field_path" text,
	"approved_value" jsonb,
	"was_edited" boolean DEFAULT false NOT NULL,
	"summary_shown" jsonb NOT NULL,
	"decided_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_proposal_id_unique" UNIQUE("proposal_id"),
	CONSTRAINT "approvals_decision_chk" CHECK ("approvals"."decision" in ('approved','rejected','exited')),
	CONSTRAINT "approvals_approved_has_value_chk" CHECK ("approvals"."decision" <> 'approved' or ("approvals"."approved_field_path" is not null and "approvals"."approved_value" is not null))
);
--> statement-breakpoint
CREATE TABLE "config_changes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"approval_id" uuid NOT NULL,
	"field_path" text NOT NULL,
	"before_value" jsonb NOT NULL,
	"after_value" jsonb NOT NULL,
	"status" text DEFAULT 'applied' NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"restored_at" timestamp with time zone,
	CONSTRAINT "config_changes_approval_id_unique" UNIQUE("approval_id"),
	CONSTRAINT "config_changes_status_chk" CHECK ("config_changes"."status" in ('applied','restored'))
);
--> statement-breakpoint
CREATE TABLE "private"."connection_secrets" (
	"connection_id" uuid PRIMARY KEY NOT NULL,
	"ciphertext" "bytea" NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"account_label" text,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error_code" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connections_provider_chk" CHECK ("connections"."provider" in ('google','slack')),
	CONSTRAINT "connections_status_chk" CHECK ("connections"."status" in ('active','needs_reconnect','revoked'))
);
--> statement-breakpoint
CREATE TABLE "diagnoses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"category" text NOT NULL,
	"supported" boolean NOT NULL,
	"rule_evidence" jsonb NOT NULL,
	"candidates" jsonb NOT NULL,
	"confidence_ceiling" text NOT NULL,
	"ai_status" text NOT NULL,
	"ai_output" jsonb,
	"confidence" text,
	"model" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "diagnoses_category_chk" CHECK ("diagnoses"."category" in ('missing_required_field','invalid_format','expired_connection','unsupported')),
	CONSTRAINT "diagnoses_ai_status_chk" CHECK ("diagnoses"."ai_status" in ('ok','unavailable','invalid')),
	CONSTRAINT "diagnoses_confidence_within_ceiling_chk" CHECK ("diagnoses"."confidence" is null or (case "diagnoses"."confidence" when 'high' then 3 when 'medium' then 2 else 1 end) <= (case "diagnoses"."confidence_ceiling" when 'high' then 3 when 'medium' then 2 else 1 end))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"user_id" uuid NOT NULL,
	"run_id" uuid,
	"type" text NOT NULL,
	"payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"email" text PRIMARY KEY NOT NULL,
	"status" text DEFAULT 'invited' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_status_chk" CHECK ("invites"."status" in ('invited','active','revoked'))
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"diagnosis_id" uuid NOT NULL,
	"workflow_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"field_path" text,
	"current_value" jsonb,
	"proposed_value" jsonb,
	"valid_options" jsonb NOT NULL,
	"expected_effect" text NOT NULL,
	"base_config_version" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "proposals_kind_chk" CHECK ("proposals"."kind" in ('config_change','reconnect_guidance')),
	CONSTRAINT "proposals_status_chk" CHECK ("proposals"."status" in ('pending','decided','superseded','expired'))
);
--> statement-breakpoint
CREATE TABLE "rate_limits" (
	"user_id" uuid NOT NULL,
	"bucket" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "rate_limits_user_id_bucket_window_start_pk" PRIMARY KEY("user_id","bucket","window_start")
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workflow_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"trigger_data" jsonb NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"repair_count" smallint DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "runs_status_chk" CHECK ("runs"."status" in ('running','succeeded','failed','uncertain'))
);
--> statement-breakpoint
CREATE TABLE "step_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_key" text DEFAULT 'action' NOT NULL,
	"attempt_no" integer NOT NULL,
	"status" text NOT NULL,
	"config_snapshot" jsonb NOT NULL,
	"request_summary" jsonb,
	"error_raw" jsonb,
	"error_std" jsonb,
	"idempotency_key" text NOT NULL,
	"external_ref" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	CONSTRAINT "step_attempts_status_chk" CHECK ("step_attempts"."status" in ('running','succeeded','failed','uncertain'))
);
--> statement-breakpoint
CREATE TABLE "workflows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"app" text NOT NULL,
	"action_key" text NOT NULL,
	"connection_id" uuid,
	"trigger_schema" jsonb NOT NULL,
	"action_config" jsonb NOT NULL,
	"config_version" integer DEFAULT 1 NOT NULL,
	"last_modified_by" text DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflows_modified_by_chk" CHECK ("workflows"."last_modified_by" in ('user','debugger'))
);
--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_changes" ADD CONSTRAINT "config_changes_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_changes" ADD CONSTRAINT "config_changes_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "private"."connection_secrets" ADD CONSTRAINT "connection_secrets_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "diagnoses" ADD CONSTRAINT "diagnoses_attempt_id_step_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."step_attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_diagnosis_id_diagnoses_id_fk" FOREIGN KEY ("diagnosis_id") REFERENCES "public"."diagnoses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_workflow_id_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "step_attempts" ADD CONSTRAINT "step_attempts_run_id_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "config_changes_workflow_applied_idx" ON "config_changes" USING btree ("workflow_id","applied_at");--> statement-breakpoint
CREATE UNIQUE INDEX "connections_user_provider_uq" ON "connections" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "events_type_created_idx" ON "events" USING btree ("type","created_at");--> statement-breakpoint
CREATE INDEX "events_user_created_idx" ON "events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_workflow_started_idx" ON "runs" USING btree ("workflow_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "step_attempts_run_step_no_uq" ON "step_attempts" USING btree ("run_id","step_key","attempt_no");--> statement-breakpoint
CREATE UNIQUE INDEX "step_attempts_one_running_uq" ON "step_attempts" USING btree ("run_id","step_key") WHERE "step_attempts"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "step_attempts_one_success_uq" ON "step_attempts" USING btree ("run_id","step_key") WHERE "step_attempts"."status" = 'succeeded';--> statement-breakpoint
CREATE INDEX "workflows_user_updated_idx" ON "workflows" USING btree ("user_id","updated_at");