CREATE TABLE "seed_meta" (
	"id" text PRIMARY KEY NOT NULL,
	"seed_version" text NOT NULL,
	"service_date" date NOT NULL,
	"source" text NOT NULL,
	"rng_seed" integer NOT NULL,
	"seeded_at" timestamp with time zone NOT NULL,
	CONSTRAINT "seed_meta_source" CHECK ("seed_meta"."source" in ('dataset', 'synthetic'))
);
