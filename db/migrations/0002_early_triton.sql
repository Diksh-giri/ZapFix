ALTER TABLE "workflows" DROP CONSTRAINT "workflows_connection_id_connections_id_fk";
--> statement-breakpoint
ALTER TABLE "workflows" ADD CONSTRAINT "workflows_connection_id_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."connections"("id") ON DELETE set null ON UPDATE no action;