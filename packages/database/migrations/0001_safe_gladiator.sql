-- PostgreSQL 16 has no built-in uuidv7(). Operational ids default to this time-ordered generator.
CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid
LANGUAGE plpgsql
VOLATILE
AS $$
DECLARE
  unix_ts_ms bytea;
  uuid_bytes bytea;
BEGIN
  unix_ts_ms = substring(int8send((floor(extract(epoch FROM clock_timestamp()) * 1000))::bigint) FROM 3);
  uuid_bytes = uuid_send(gen_random_uuid());
  uuid_bytes = overlay(uuid_bytes PLACING unix_ts_ms FROM 1 FOR 6);
  uuid_bytes = set_byte(uuid_bytes, 6, (get_byte(uuid_bytes, 6) & 15) | 112);
  uuid_bytes = set_byte(uuid_bytes, 8, (get_byte(uuid_bytes, 8) & 63) | 128);
  RETURN encode(uuid_bytes, 'hex')::uuid;
END
$$;
--> statement-breakpoint
CREATE TYPE "public"."brand" AS ENUM('Fresh', 'Style', 'Tech');--> statement-breakpoint
CREATE TYPE "public"."deferral_type" AS ENUM('unavoidable', 'prioritized');--> statement-breakpoint
CREATE TYPE "public"."dock_type" AS ENUM('rear_dock', 'street', 'mall_bay');--> statement-breakpoint
CREATE TYPE "public"."entity_type" AS ENUM('order', 'trip', 'stop', 'loading_issue', 'issue', 'sync_conflict');--> statement-breakpoint
CREATE TYPE "public"."issue_status" AS ENUM('open', 'resolved');--> statement-breakpoint
CREATE TYPE "public"."issue_type" AS ENUM('missing', 'damaged', 'incorrect');--> statement-breakpoint
CREATE TYPE "public"."loading_issue_type" AS ENUM('missing', 'damaged', 'short');--> statement-breakpoint
CREATE TYPE "public"."loading_status" AS ENUM('not_started', 'in_progress', 'exception', 'ready', 'departed');--> statement-breakpoint
CREATE TYPE "public"."notification_priority" AS ENUM('info', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."notification_type" AS ENUM('order_confirmed', 'order_deferred', 'plan_published', 'loading_shortfall', 'delivery_failed', 'delivered', 'receipt_discrepancy', 'sync_conflict');--> statement-breakpoint
CREATE TYPE "public"."order_status" AS ENUM('draft', 'submitted', 'confirmed', 'allocated', 'deferred', 'loading', 'dispatched', 'delivered', 'failed', 'receipt_confirmed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."parking_constraint" AS ENUM('normal', 'van_only', 'mall_dock');--> statement-breakpoint
CREATE TYPE "public"."planning_run_status" AS ENUM('open', 'published');--> statement-breakpoint
CREATE TYPE "public"."reason_code" AS ENUM('MIXED_BRAND_DISTRICT', 'REEFER_REQUIRED', 'VAN_REQUIRED', 'WRONG_DEPOT', 'VEHICLE_UNAVAILABLE', 'WEIGHT_CAP', 'VOLUME_CAP', 'TRIP_LIMIT', 'FRESH_TIME_BUDGET', 'DAY_TIME_BUDGET', 'WINDOW_MISSED', 'FUEL_QUOTA');--> statement-breakpoint
CREATE TYPE "public"."road_class" AS ENUM('urban', 'suburban', 'highway', 'hill');--> statement-breakpoint
CREATE TYPE "public"."role" AS ENUM('dispatcher', 'loader', 'driver', 'store_manager');--> statement-breakpoint
CREATE TYPE "public"."stop_event_type" AS ENUM('arrived', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."stop_status" AS ENUM('pending', 'arrived', 'delivered', 'failed');--> statement-breakpoint
CREATE TYPE "public"."temperature_requirement" AS ENUM('ambient', 'chilled');--> statement-breakpoint
CREATE TYPE "public"."trip_status" AS ENUM('planned', 'published', 'loading', 'ready', 'departed', 'completed', 'blocked');--> statement-breakpoint
CREATE TYPE "public"."vehicle_availability_status" AS ENUM('available', 'in_workshop');--> statement-breakpoint
CREATE TYPE "public"."vehicle_temperature" AS ENUM('ambient', 'reefer');--> statement-breakpoint
CREATE TYPE "public"."vehicle_type" AS ENUM('truck', 'van');--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"actor_id" uuid NOT NULL,
	"role" "role" NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_action_present" CHECK ("audit_log"."action" <> ''),
	CONSTRAINT "audit_log_entity_present" CHECK ("audit_log"."entity_type" <> '' and "audit_log"."entity_id" <> '')
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"recipient_id" uuid NOT NULL,
	"type" "notification_type" NOT NULL,
	"priority" "notification_priority" NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"read_at" timestamp with time zone,
	CONSTRAINT "notifications_entity_id_present" CHECK ("notifications"."entity_id" <> '')
);
--> statement-breakpoint
CREATE TABLE "sync_conflicts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"event_id" uuid NOT NULL,
	"reason" text NOT NULL,
	"resolved_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sync_conflicts_event_id" UNIQUE("event_id"),
	CONSTRAINT "sync_conflicts_reason_present" CHECK ("sync_conflicts"."reason" <> '')
);
--> statement-breakpoint
CREATE TABLE "pods" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"stop_id" uuid NOT NULL,
	"recipient_name" text NOT NULL,
	"signature" "bytea" NOT NULL,
	"photo" "bytea",
	"client_time" timestamp with time zone NOT NULL,
	CONSTRAINT "pods_stop_id" UNIQUE("stop_id"),
	CONSTRAINT "pods_recipient_name_length" CHECK (char_length("pods"."recipient_name") between 1 and 120)
);
--> statement-breakpoint
CREATE TABLE "stop_events" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"client_event_id" uuid NOT NULL,
	"stop_id" uuid NOT NULL,
	"type" "stop_event_type" NOT NULL,
	"payload" jsonb NOT NULL,
	"client_time" timestamp with time zone NOT NULL,
	"server_time" timestamp with time zone NOT NULL,
	"trip_version" integer NOT NULL,
	CONSTRAINT "stop_events_client_event_id" UNIQUE("client_event_id"),
	CONSTRAINT "stop_events_trip_version_nonnegative" CHECK ("stop_events"."trip_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "role" NOT NULL,
	"outlet_id" text,
	"depot_id" text,
	"vehicle_id" text,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_role_scope" CHECK ((
        (
          "users"."role" = 'dispatcher'
          and "users"."outlet_id" is null
          and "users"."vehicle_id" is null
        )
        or (
          "users"."role" = 'loader'
          and "users"."depot_id" is not null
          and "users"."outlet_id" is null
          and "users"."vehicle_id" is null
        )
        or (
          "users"."role" = 'driver'
          and "users"."vehicle_id" is not null
          and "users"."outlet_id" is null
          and "users"."depot_id" is null
        )
        or (
          "users"."role" = 'store_manager'
          and "users"."outlet_id" is not null
          and "users"."depot_id" is null
          and "users"."vehicle_id" is null
        )
      ))
);
--> statement-breakpoint
CREATE TABLE "loading_issues" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" "loading_issue_type" NOT NULL,
	"qty" integer NOT NULL,
	"note" text,
	"acknowledged_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loading_issues_qty_positive" CHECK ("loading_issues"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "loading_records" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trip_id" uuid NOT NULL,
	"status" "loading_status" DEFAULT 'not_started' NOT NULL,
	"loader_id" uuid NOT NULL,
	CONSTRAINT "loading_records_trip_id" UNIQUE("trip_id")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"outlet_id" text NOT NULL,
	"brand" "brand" NOT NULL,
	"temp" "temperature_requirement" NOT NULL,
	"requested_date" date NOT NULL,
	"units" integer NOT NULL,
	"weight_kg" numeric(12, 3) NOT NULL,
	"volume_m3" numeric(12, 3) NOT NULL,
	"status" "order_status" DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"locked_at" timestamp with time zone,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "orders_size_positive" CHECK ("orders"."units" > 0 and "orders"."weight_kg" > 0 and "orders"."volume_m3" > 0),
	CONSTRAINT "orders_version_nonnegative" CHECK ("orders"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "deferrals" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"order_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"reason_code" "reason_code" NOT NULL,
	"type" "deferral_type" NOT NULL,
	"note" text,
	"actor_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fuel_ledger" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"vehicle_id" text NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" smallint NOT NULL,
	"trip_id" uuid NOT NULL,
	"litres" numeric(12, 3) NOT NULL,
	CONSTRAINT "fuel_ledger_trip_id" UNIQUE("trip_id"),
	CONSTRAINT "fuel_ledger_iso_week" CHECK ("fuel_ledger"."iso_week" between 1 and 53),
	CONSTRAINT "fuel_ledger_litres_nonnegative" CHECK ("fuel_ledger"."litres" >= 0)
);
--> statement-breakpoint
CREATE TABLE "planning_runs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"depot_id" text NOT NULL,
	"service_date" date NOT NULL,
	"status" "planning_run_status" DEFAULT 'open' NOT NULL,
	"published_at" timestamp with time zone,
	"published_by" uuid,
	"plan_version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "planning_runs_depot_service_date" UNIQUE("depot_id","service_date"),
	CONSTRAINT "planning_runs_plan_version_nonnegative" CHECK ("planning_runs"."plan_version" >= 0),
	CONSTRAINT "planning_runs_publish_fields" CHECK ((
        ("planning_runs"."status" = 'open' and "planning_runs"."published_at" is null and "planning_runs"."published_by" is null)
        or (
          "planning_runs"."status" = 'published'
          and "planning_runs"."published_at" is not null
          and "planning_runs"."published_by" is not null
        )
      ))
);
--> statement-breakpoint
CREATE TABLE "trip_stops" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"trip_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"planned_arrival" timestamp with time zone NOT NULL,
	"status" "stop_status" DEFAULT 'pending' NOT NULL,
	"late" boolean DEFAULT false NOT NULL,
	CONSTRAINT "trip_stops_order_id" UNIQUE("order_id"),
	CONSTRAINT "trip_stops_trip_seq" UNIQUE("trip_id","seq"),
	CONSTRAINT "trip_stops_seq_positive" CHECK ("trip_stops"."seq" > 0)
);
--> statement-breakpoint
CREATE TABLE "trips" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"run_id" uuid NOT NULL,
	"vehicle_id" text NOT NULL,
	"trip_no" smallint NOT NULL,
	"brand" "brand" NOT NULL,
	"district" text NOT NULL,
	"status" "trip_status" DEFAULT 'planned' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	"planned_minutes" numeric(12, 3) NOT NULL,
	"planned_km" numeric(12, 3) NOT NULL,
	CONSTRAINT "trips_run_vehicle_trip_no" UNIQUE("run_id","vehicle_id","trip_no"),
	CONSTRAINT "trips_trip_no" CHECK ("trips"."trip_no" in (1, 2)),
	CONSTRAINT "trips_plan_nonnegative" CHECK ("trips"."planned_minutes" >= 0 and "trips"."planned_km" >= 0 and "trips"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "calendar_days" (
	"date" date PRIMARY KEY NOT NULL,
	"dow" smallint NOT NULL,
	"iso_year" integer NOT NULL,
	"iso_week" smallint NOT NULL,
	"is_payday" boolean NOT NULL,
	"festival" text,
	"festival_ramp" numeric(4, 3) NOT NULL,
	"is_holiday" boolean NOT NULL,
	"monsoon" boolean NOT NULL,
	"is_operating" boolean NOT NULL,
	CONSTRAINT "calendar_days_dow" CHECK ("calendar_days"."dow" between 0 and 6),
	CONSTRAINT "calendar_days_iso_week" CHECK ("calendar_days"."iso_week" between 1 and 53),
	CONSTRAINT "calendar_days_festival_ramp" CHECK ("calendar_days"."festival_ramp" >= 0 and "calendar_days"."festival_ramp" <= 1)
);
--> statement-breakpoint
CREATE TABLE "depots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "district_travel" (
	"district" text PRIMARY KEY NOT NULL,
	"depot_id" text NOT NULL,
	"road_class" "road_class" NOT NULL,
	"depot_to_district_km" numeric(12, 3) NOT NULL,
	"depot_to_district_min" numeric(12, 3) NOT NULL,
	"inter_stop_km" numeric(12, 3) NOT NULL,
	"inter_stop_min" numeric(12, 3) NOT NULL,
	CONSTRAINT "district_travel_nonnegative" CHECK ("district_travel"."depot_to_district_km" >= 0 and "district_travel"."depot_to_district_min" >= 0 and "district_travel"."inter_stop_km" >= 0 and "district_travel"."inter_stop_min" >= 0)
);
--> statement-breakpoint
CREATE TABLE "outlets" (
	"id" text PRIMARY KEY NOT NULL,
	"brand" "brand" NOT NULL,
	"district" text NOT NULL,
	"depot_id" text NOT NULL,
	"dock_type" "dock_type" NOT NULL,
	"parking_constraint" "parking_constraint" NOT NULL,
	"mall_window_open" time,
	"mall_window_close" time,
	"window_open" time NOT NULL,
	"window_close" time NOT NULL,
	CONSTRAINT "outlets_id_shape" CHECK ("outlets"."id" ~ '^OUT[0-9]{3}$'),
	CONSTRAINT "outlets_window_order" CHECK ("outlets"."window_open" < "outlets"."window_close"),
	CONSTRAINT "outlets_mall_window_pair" CHECK ((
        ("outlets"."mall_window_open" is null and "outlets"."mall_window_close" is null)
        or (
          "outlets"."mall_window_open" is not null
          and "outlets"."mall_window_close" is not null
          and "outlets"."mall_window_open" < "outlets"."mall_window_close"
        )
      ))
);
--> statement-breakpoint
CREATE TABLE "service_allowances" (
	"brand" "brand" NOT NULL,
	"dock_type" "dock_type" NOT NULL,
	"minutes" integer NOT NULL,
	CONSTRAINT "service_allowances_brand_dock_type_pk" PRIMARY KEY("brand","dock_type"),
	CONSTRAINT "service_allowances_minutes_nonnegative" CHECK ("service_allowances"."minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "vehicle_availability" (
	"vehicle_id" text NOT NULL,
	"date" date NOT NULL,
	"status" "vehicle_availability_status" NOT NULL,
	CONSTRAINT "vehicle_availability_vehicle_id_date_pk" PRIMARY KEY("vehicle_id","date")
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "vehicle_type" NOT NULL,
	"temp" "vehicle_temperature" NOT NULL,
	"weight_cap_kg" numeric(12, 3) NOT NULL,
	"volume_cap_m3" numeric(12, 3) NOT NULL,
	"fuel_type" text NOT NULL,
	"km_per_l" numeric(12, 3) NOT NULL,
	"weekly_fuel_quota_l" numeric(12, 3) NOT NULL,
	"depot_id" text NOT NULL,
	CONSTRAINT "vehicles_id_shape" CHECK ("vehicles"."id" ~ '^VEH[0-9]{3}$'),
	CONSTRAINT "vehicles_caps_positive" CHECK ("vehicles"."weight_cap_kg" > 0 and "vehicles"."volume_cap_m3" > 0 and "vehicles"."km_per_l" > 0 and "vehicles"."weekly_fuel_quota_l" >= 0)
);
--> statement-breakpoint
CREATE TABLE "issues" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"order_id" uuid NOT NULL,
	"type" "issue_type" NOT NULL,
	"note" text,
	"status" "issue_status" DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"stop_id" uuid NOT NULL,
	"confirmed_by" uuid NOT NULL,
	"confirmed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "receipts_stop_id" UNIQUE("stop_id")
);
--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_event_id_stop_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."stop_events"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_conflicts" ADD CONSTRAINT "sync_conflicts_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pods" ADD CONSTRAINT "pods_stop_id_trip_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stop_events" ADD CONSTRAINT "stop_events_stop_id_trip_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loading_issues" ADD CONSTRAINT "loading_issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loading_issues" ADD CONSTRAINT "loading_issues_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loading_records" ADD CONSTRAINT "loading_records_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loading_records" ADD CONSTRAINT "loading_records_loader_id_users_id_fk" FOREIGN KEY ("loader_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_outlet_id_outlets_id_fk" FOREIGN KEY ("outlet_id") REFERENCES "public"."outlets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deferrals" ADD CONSTRAINT "deferrals_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deferrals" ADD CONSTRAINT "deferrals_run_id_planning_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."planning_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deferrals" ADD CONSTRAINT "deferrals_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_ledger" ADD CONSTRAINT "fuel_ledger_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_ledger" ADD CONSTRAINT "fuel_ledger_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_runs" ADD CONSTRAINT "planning_runs_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "planning_runs" ADD CONSTRAINT "planning_runs_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_stops" ADD CONSTRAINT "trip_stops_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_run_id_planning_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."planning_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trips" ADD CONSTRAINT "trips_district_district_travel_district_fk" FOREIGN KEY ("district") REFERENCES "public"."district_travel"("district") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "district_travel" ADD CONSTRAINT "district_travel_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_district_district_travel_district_fk" FOREIGN KEY ("district") REFERENCES "public"."district_travel"("district") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outlets" ADD CONSTRAINT "outlets_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicle_availability" ADD CONSTRAINT "vehicle_availability_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_depot_id_depots_id_fk" FOREIGN KEY ("depot_id") REFERENCES "public"."depots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "issues" ADD CONSTRAINT "issues_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_stop_id_trip_stops_id_fk" FOREIGN KEY ("stop_id") REFERENCES "public"."trip_stops"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_log_entity" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_actor_id" ON "audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "audit_log_created_at" ON "audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "notifications_recipient_created_at" ON "notifications" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE INDEX "sync_conflicts_resolved_by" ON "sync_conflicts" USING btree ("resolved_by");--> statement-breakpoint
CREATE INDEX "sync_conflicts_unresolved" ON "sync_conflicts" USING btree ("created_at") WHERE "sync_conflicts"."resolved_by" is null;--> statement-breakpoint
CREATE INDEX "stop_events_stop_id" ON "stop_events" USING btree ("stop_id");--> statement-breakpoint
CREATE INDEX "sessions_user_id" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_expires_at" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "users_outlet_id" ON "users" USING btree ("outlet_id");--> statement-breakpoint
CREATE INDEX "users_depot_id" ON "users" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "users_vehicle_id" ON "users" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "loading_issues_order_id" ON "loading_issues" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "loading_issues_acknowledged_by" ON "loading_issues" USING btree ("acknowledged_by");--> statement-breakpoint
CREATE INDEX "loading_records_loader_id" ON "loading_records" USING btree ("loader_id");--> statement-breakpoint
CREATE INDEX "orders_outlet_requested_date" ON "orders" USING btree ("outlet_id","requested_date");--> statement-breakpoint
CREATE INDEX "orders_status_requested_date" ON "orders" USING btree ("status","requested_date");--> statement-breakpoint
CREATE INDEX "deferrals_order_id" ON "deferrals" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "deferrals_run_id" ON "deferrals" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "deferrals_actor_id" ON "deferrals" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "fuel_ledger_vehicle_week" ON "fuel_ledger" USING btree ("vehicle_id","iso_year","iso_week");--> statement-breakpoint
CREATE INDEX "planning_runs_published_by" ON "planning_runs" USING btree ("published_by");--> statement-breakpoint
CREATE INDEX "trips_vehicle_id" ON "trips" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX "calendar_days_iso_week" ON "calendar_days" USING btree ("iso_year","iso_week");--> statement-breakpoint
CREATE INDEX "district_travel_depot_id" ON "district_travel" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "outlets_depot_id" ON "outlets" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "outlets_district" ON "outlets" USING btree ("district");--> statement-breakpoint
CREATE INDEX "vehicle_availability_date" ON "vehicle_availability" USING btree ("date");--> statement-breakpoint
CREATE INDEX "vehicles_depot_id" ON "vehicles" USING btree ("depot_id");--> statement-breakpoint
CREATE INDEX "issues_order_id" ON "issues" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "receipts_confirmed_by" ON "receipts" USING btree ("confirmed_by");--> statement-breakpoint
-- SYSTEM_DESIGN §9.4 / §11.3: the audit log is append-only.
CREATE OR REPLACE FUNCTION audit_log_reject_mutation() RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END
$$;
--> statement-breakpoint
CREATE TRIGGER audit_log_append_only
BEFORE UPDATE OR DELETE ON audit_log
FOR EACH ROW
EXECUTE FUNCTION audit_log_reject_mutation();