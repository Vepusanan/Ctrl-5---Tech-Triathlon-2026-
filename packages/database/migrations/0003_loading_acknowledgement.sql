ALTER TABLE "loading_issues" ADD COLUMN "trip_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "loading_issues" ADD COLUMN "loader_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "loading_issues" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loading_records" ADD COLUMN "accepted_trip_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "loading_records" ADD COLUMN "verified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "loading_issues" ADD CONSTRAINT "loading_issues_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loading_issues" ADD CONSTRAINT "loading_issues_loader_id_users_id_fk" FOREIGN KEY ("loader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "loading_issues_trip_id" ON "loading_issues" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX "loading_issues_loader_id" ON "loading_issues" USING btree ("loader_id");--> statement-breakpoint
ALTER TABLE "loading_issues" ADD CONSTRAINT "loading_issues_acknowledgement" CHECK ((
        ("loading_issues"."acknowledged_by" is null and "loading_issues"."acknowledged_at" is null)
        or ("loading_issues"."acknowledged_by" is not null and "loading_issues"."acknowledged_at" is not null)
      ));--> statement-breakpoint
ALTER TABLE "loading_records" ADD CONSTRAINT "loading_records_accepted_version" CHECK ("loading_records"."accepted_trip_version" >= 0);