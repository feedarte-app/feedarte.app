CREATE TABLE "project_transfers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"from_user_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"token_hash" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"email_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"accepted_by" uuid,
	CONSTRAINT "project_transfers_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "project_transfers" ADD CONSTRAINT "project_transfers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_transfers" ADD CONSTRAINT "project_transfers_from_user_id_users_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_transfers" ADD CONSTRAINT "project_transfers_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_transfers_project_idx" ON "project_transfers" USING btree ("project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "project_transfers_one_pending_uq" ON "project_transfers" USING btree ("project_id") WHERE status = 'pending';