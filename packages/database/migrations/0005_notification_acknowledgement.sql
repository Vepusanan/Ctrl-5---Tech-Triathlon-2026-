ALTER TYPE "public"."notification_type" ADD VALUE 'plan_changed';--> statement-breakpoint
ALTER TYPE "public"."notification_type" ADD VALUE 'delivery_issue';--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "acknowledged_at" timestamp with time zone;