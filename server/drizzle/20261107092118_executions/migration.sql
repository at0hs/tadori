CREATE TABLE "approval_events" (
	"id" uuid PRIMARY KEY,
	"execution_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"comment" text,
	"actor_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approval_events_kind_check" CHECK (kind in ('requested', 'approved', 'rejected'))
);
--> statement-breakpoint
CREATE TABLE "execution_steps" (
	"execution_id" uuid,
	"step_id" uuid,
	"section" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"skip_reason" text,
	"updated_by" uuid,
	"updated_at" timestamp with time zone,
	CONSTRAINT "execution_steps_pkey" PRIMARY KEY("execution_id","step_id"),
	CONSTRAINT "execution_steps_section_check" CHECK (section in ('main', 'rollback')),
	CONSTRAINT "execution_steps_status_check" CHECK (status in ('pending', 'done', 'skipped', 'failed')),
	CONSTRAINT "execution_steps_skip_reason_check" CHECK (status <> 'skipped' or skip_reason is not null)
);
--> statement-breakpoint
CREATE TABLE "execution_variables" (
	"execution_id" uuid,
	"name" text,
	"value" text NOT NULL,
	CONSTRAINT "execution_variables_pkey" PRIMARY KEY("execution_id","name")
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" uuid PRIMARY KEY,
	"procedure_id" uuid NOT NULL,
	"version_id" uuid NOT NULL,
	"executor_id" uuid NOT NULL,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"cancelled_by" uuid,
	"cancel_reason" text,
	"variables_locked_at" timestamp with time zone,
	"approval_status" text,
	"approval_decided_by" uuid,
	"approval_decided_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "executions_status_check" CHECK (status in ('running', 'completed', 'abnormal', 'cancelled')),
	CONSTRAINT "executions_ended_check" CHECK ((status = 'running') = (ended_at is null)),
	CONSTRAINT "executions_cancelled_check" CHECK ((status = 'cancelled') = (cancelled_by is not null)),
	CONSTRAINT "executions_approval_status_check" CHECK (approval_status is null or approval_status in ('pending', 'approved', 'rejected')),
	CONSTRAINT "executions_approval_ended_check" CHECK (approval_status is null or status in ('completed', 'abnormal'))
);
--> statement-breakpoint
CREATE TABLE "step_comments" (
	"id" uuid PRIMARY KEY,
	"execution_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_evidences" (
	"id" uuid PRIMARY KEY,
	"execution_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "step_status_events" (
	"id" uuid PRIMARY KEY,
	"execution_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"from_status" text NOT NULL,
	"to_status" text NOT NULL,
	"skip_reason" text,
	"changed_by" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "step_status_events_status_check" CHECK (from_status in ('pending', 'done', 'skipped', 'failed') and to_status in ('pending', 'done', 'skipped', 'failed'))
);
--> statement-breakpoint
CREATE INDEX "approval_events_execution_id_index" ON "approval_events" ("execution_id");--> statement-breakpoint
CREATE INDEX "executions_executor_id_status_index" ON "executions" ("executor_id","status");--> statement-breakpoint
CREATE INDEX "executions_procedure_id_index" ON "executions" ("procedure_id");--> statement-breakpoint
CREATE INDEX "step_comments_execution_id_index" ON "step_comments" ("execution_id");--> statement-breakpoint
CREATE INDEX "step_evidences_execution_id_index" ON "step_evidences" ("execution_id");--> statement-breakpoint
CREATE INDEX "step_status_events_execution_id_index" ON "step_status_events" ("execution_id");--> statement-breakpoint
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id");--> statement-breakpoint
ALTER TABLE "approval_events" ADD CONSTRAINT "approval_events_actor_id_user_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id");--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "execution_variables" ADD CONSTRAINT "execution_variables_execution_id_executions_id_fkey" FOREIGN KEY ("execution_id") REFERENCES "executions"("id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_procedure_id_procedures_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_version_id_procedure_versions_id_fkey" FOREIGN KEY ("version_id") REFERENCES "procedure_versions"("id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_executor_id_user_id_fkey" FOREIGN KEY ("executor_id") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_cancelled_by_user_id_fkey" FOREIGN KEY ("cancelled_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_approval_decided_by_user_id_fkey" FOREIGN KEY ("approval_decided_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "step_comments" ADD CONSTRAINT "step_comments_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "step_comments" ADD CONSTRAINT "step_comments_step_fk" FOREIGN KEY ("execution_id","step_id") REFERENCES "execution_steps"("execution_id","step_id");--> statement-breakpoint
ALTER TABLE "step_evidences" ADD CONSTRAINT "step_evidences_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "step_evidences" ADD CONSTRAINT "step_evidences_step_fk" FOREIGN KEY ("execution_id","step_id") REFERENCES "execution_steps"("execution_id","step_id");--> statement-breakpoint
ALTER TABLE "step_status_events" ADD CONSTRAINT "step_status_events_changed_by_user_id_fkey" FOREIGN KEY ("changed_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "step_status_events" ADD CONSTRAINT "step_status_events_step_fk" FOREIGN KEY ("execution_id","step_id") REFERENCES "execution_steps"("execution_id","step_id");