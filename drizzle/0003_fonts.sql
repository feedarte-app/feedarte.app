CREATE TABLE "fonts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"family" text NOT NULL,
	"css_family" text NOT NULL,
	"subfamily" text DEFAULT 'Regular' NOT NULL,
	"weight" integer DEFAULT 400 NOT NULL,
	"weight_max" integer,
	"italic" boolean DEFAULT false NOT NULL,
	"key" text NOT NULL,
	"size" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "fonts" ADD CONSTRAINT "fonts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fonts_project_idx" ON "fonts" USING btree ("project_id");