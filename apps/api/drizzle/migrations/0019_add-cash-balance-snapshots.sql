CREATE TABLE "cash_balance_snapshots" (
  "id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  "org_id" integer NOT NULL REFERENCES "orgs"("id") ON DELETE CASCADE,
  "balance" numeric(14, 2) NOT NULL,
  "as_of_date" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_cash_balance_snapshots_org_as_of_desc" ON "cash_balance_snapshots" ("org_id", "as_of_date" DESC);
--> statement-breakpoint
ALTER TABLE "cash_balance_snapshots" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY "cash_balance_snapshots_tenant_isolation" ON "cash_balance_snapshots"
  FOR ALL
  USING (org_id = current_setting('app.current_org_id', true)::integer)
  WITH CHECK (org_id = current_setting('app.current_org_id', true)::integer);
--> statement-breakpoint
CREATE POLICY "cash_balance_snapshots_admin_bypass" ON "cash_balance_snapshots"
  FOR ALL
  USING (COALESCE(current_setting('app.is_admin', true)::boolean, false) = true);
