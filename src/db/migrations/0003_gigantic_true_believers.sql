CREATE TYPE "public"."extraction_tier" AS ENUM('cache', 'deterministic', 'ocr', 'vlm_cheap', 'vlm_premium', 'human');--> statement-breakpoint
CREATE TYPE "public"."inbound_message_kind" AS ENUM('media', 'text');--> statement-breakpoint
CREATE TYPE "public"."receipt_source" AS ENUM('whatsapp', 'upload', 'email', 'api');--> statement-breakpoint
CREATE TYPE "public"."receipt_status" AS ENUM('received', 'processing', 'extracted', 'matched', 'applied', 'review', 'rejected', 'failed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "inbound_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"provider_message_id" text NOT NULL,
	"kind" "inbound_message_kind" NOT NULL,
	"body" text,
	"receipt_id" uuid,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receipt_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"tier" "extraction_tier" NOT NULL,
	"provider" text,
	"model" text,
	"prompt_version" text,
	"data" jsonb NOT NULL,
	"field_confidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"overall_confidence" numeric NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"cost_micros" integer,
	"latency_ms" integer,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"source" "receipt_source" NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"content_hash" text NOT NULL,
	"perceptual_hash" text,
	"status" "receipt_status" DEFAULT 'received' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "whatsapp_channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"provider" text DEFAULT 'twilio' NOT NULL,
	"phone_number_id" text NOT NULL,
	"display_number" text NOT NULL,
	"credentials_ref" text,
	"status" text DEFAULT 'active' NOT NULL,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_channel_id_whatsapp_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."whatsapp_channels"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "inbound_messages" ADD CONSTRAINT "inbound_messages_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "receipt_extractions" ADD CONSTRAINT "receipt_extractions_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "receipt_extractions" ADD CONSTRAINT "receipt_extractions_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "receipts" ADD CONSTRAINT "receipts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "whatsapp_channels" ADD CONSTRAINT "whatsapp_channels_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "inbound_messages_tenant_provider_message_id_unique" ON "inbound_messages" USING btree ("tenant_id","provider_message_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "receipts_tenant_content_hash_unique" ON "receipts" USING btree ("tenant_id","content_hash");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "whatsapp_channels_phone_number_id_unique" ON "whatsapp_channels" USING btree ("phone_number_id");