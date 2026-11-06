ALTER TABLE "projects" ADD COLUMN "instagram" text;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "link_clicks" (
	"feed_id" uuid NOT NULL,
	"external_id" text NOT NULL,
	"day" date NOT NULL,
	"n" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "link_clicks_pk" PRIMARY KEY("feed_id","external_id","day")
);--> statement-breakpoint
ALTER TABLE "link_clicks" ADD CONSTRAINT "link_clicks_feed_id_feeds_id_fk" FOREIGN KEY ("feed_id") REFERENCES "public"."feeds"("id") ON DELETE cascade ON UPDATE no action;
