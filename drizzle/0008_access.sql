ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "plan" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "access_until" timestamp with time zone;
