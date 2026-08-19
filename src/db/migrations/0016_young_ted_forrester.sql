CREATE TYPE "public"."fraud_check_result" AS ENUM('pass', 'warn', 'fail');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fraud_checks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"receipt_id" uuid NOT NULL,
	"check_code" text NOT NULL,
	"result" "fraud_check_result" NOT NULL,
	"weight" numeric NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "reconciliation_proposals" ADD COLUMN "risk_score" numeric;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fraud_checks" ADD CONSTRAINT "fraud_checks_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fraud_checks" ADD CONSTRAINT "fraud_checks_receipt_id_receipts_id_fk" FOREIGN KEY ("receipt_id") REFERENCES "public"."receipts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
