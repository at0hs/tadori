CREATE TABLE "procedure_drafts" (
	"procedure_id" uuid PRIMARY KEY,
	"base_version_no" integer,
	"content" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "procedure_versions" (
	"id" uuid PRIMARY KEY,
	"procedure_id" uuid NOT NULL,
	"version_no" integer NOT NULL,
	"content" jsonb NOT NULL,
	"change_reason" text NOT NULL,
	"published_by" uuid NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procedure_versions_procedure_id_version_no_unique" UNIQUE("procedure_id","version_no")
);
--> statement-breakpoint
CREATE TABLE "procedures" (
	"id" uuid PRIMARY KEY,
	"status" text DEFAULT 'active' NOT NULL,
	"latest_version_no" integer,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_by" uuid,
	"archived_at" timestamp with time zone,
	CONSTRAINT "procedures_status_check" CHECK (status in ('active', 'archived')),
	CONSTRAINT "procedures_archived_check" CHECK ((status = 'archived') = (archived_by is not null and archived_at is not null)),
	CONSTRAINT "procedures_archived_published_check" CHECK (status <> 'archived' or latest_version_no is not null)
);
--> statement-breakpoint
ALTER TABLE "procedure_drafts" ADD CONSTRAINT "procedure_drafts_procedure_id_procedures_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "procedure_drafts" ADD CONSTRAINT "procedure_drafts_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "procedure_drafts" ADD CONSTRAINT "procedure_drafts_updated_by_user_id_fkey" FOREIGN KEY ("updated_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "procedure_versions" ADD CONSTRAINT "procedure_versions_procedure_id_procedures_id_fkey" FOREIGN KEY ("procedure_id") REFERENCES "procedures"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "procedure_versions" ADD CONSTRAINT "procedure_versions_published_by_user_id_fkey" FOREIGN KEY ("published_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_created_by_user_id_fkey" FOREIGN KEY ("created_by") REFERENCES "user"("id");--> statement-breakpoint
ALTER TABLE "procedures" ADD CONSTRAINT "procedures_archived_by_user_id_fkey" FOREIGN KEY ("archived_by") REFERENCES "user"("id");