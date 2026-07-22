


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE TYPE "public"."audit_action" AS ENUM (
    'INSERT',
    'UPDATE',
    'DELETE'
);


ALTER TYPE "public"."audit_action" OWNER TO "postgres";


CREATE TYPE "public"."certificate_status" AS ENUM (
    'valid',
    'warning',
    'expired',
    'archived'
);


ALTER TYPE "public"."certificate_status" OWNER TO "postgres";


CREATE TYPE "public"."expense_category" AS ENUM (
    'Salaries',
    'Maintenance',
    'Utilities',
    'Supplies',
    'Transport',
    'Other'
);


ALTER TYPE "public"."expense_category" OWNER TO "postgres";


CREATE TYPE "public"."fuel_type" AS ENUM (
    'SXP',
    'DXP'
);


ALTER TYPE "public"."fuel_type" OWNER TO "postgres";


CREATE TYPE "public"."import_status" AS ENUM (
    'success',
    'partial',
    'failed'
);


ALTER TYPE "public"."import_status" OWNER TO "postgres";


CREATE TYPE "public"."import_type" AS ENUM (
    'historical',
    'daily'
);


ALTER TYPE "public"."import_type" OWNER TO "postgres";


CREATE TYPE "public"."pump_id_enum" AS ENUM (
    'P1',
    'P2',
    'P3'
);


ALTER TYPE "public"."pump_id_enum" OWNER TO "postgres";


CREATE TYPE "public"."suggestion_status" AS ENUM (
    'pending',
    'approved',
    'rejected'
);


ALTER TYPE "public"."suggestion_status" OWNER TO "postgres";


CREATE TYPE "public"."tank_id_enum" AS ENUM (
    'TANK_A',
    'TANK_B'
);


ALTER TYPE "public"."tank_id_enum" OWNER TO "postgres";


CREATE TYPE "public"."user_role" AS ENUM (
    'admin',
    'manager',
    'viewer'
);


ALTER TYPE "public"."user_role" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."audit_log_trigger"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
DECLARE
  v_row        JSONB;
  v_changed_by UUID;
  v_record_id  UUID;
  v_header_actor TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := row_to_json(OLD)::JSONB;
  ELSE
    v_row := row_to_json(NEW)::JSONB;
  END IF;

  v_record_id := (v_row->>'id')::UUID;

  -- Primary source: the x-actor-id header on the current
  -- PostgREST request, sent by the Express backend.
  BEGIN
    v_header_actor := current_setting('request.headers', true)::JSON->>'x-actor-id';
  EXCEPTION WHEN OTHERS THEN
    v_header_actor := NULL;
  END;

  IF v_header_actor IS NOT NULL AND v_header_actor <> '' THEN
    v_changed_by := v_header_actor::UUID;
  ELSE
    -- Fallback: the row's own created_by (correct on INSERT,
    -- a reasonable best-effort on UPDATE/DELETE if the header
    -- is ever missing).
    v_changed_by := (v_row->>'created_by')::UUID;
  END IF;

  INSERT INTO audit_log (
    table_name, record_id, action,
    old_values, new_values, changed_by
  ) VALUES (
    TG_TABLE_NAME,
    v_record_id,
    TG_OP::audit_action,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE row_to_json(OLD)::JSONB END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE row_to_json(NEW)::JSONB END,
    v_changed_by
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;


ALTER FUNCTION "public"."audit_log_trigger"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."credit_sales" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "sale_date" "date" NOT NULL,
    "creditor_id" "uuid" NOT NULL,
    "sxp_litres" numeric(10,2) DEFAULT 0 NOT NULL,
    "dxp_litres" numeric(10,2) DEFAULT 0 NOT NULL,
    "sxp_amount_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "dxp_amount_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_amount_ghs" numeric(12,2) GENERATED ALWAYS AS (("sxp_amount_ghs" + "dxp_amount_ghs")) STORED,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."credit_sales" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."edit_credit_sale"("p_id" "uuid", "p_sale_date" "date", "p_sxp_litres" numeric, "p_dxp_litres" numeric, "p_sxp_amount_ghs" numeric, "p_dxp_amount_ghs" numeric, "p_actor_id" "uuid") RETURNS SETOF "public"."credit_sales"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_old credit_sales;
  v_new credit_sales;
BEGIN
  SELECT * INTO v_old FROM credit_sales WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit sale % not found or already deleted', p_id;
  END IF;

  -- Same most-recent guard + soft-delete + exact balance reversal as above.
  PERFORM reverse_credit_sale(p_id);

  -- creditor_id is intentionally not editable here — reassigning a
  -- sale to a different creditor is a delete-and-recreate, not an edit.
  SELECT * INTO v_new FROM record_credit_sale(
    p_sale_date, v_old.creditor_id, p_sxp_litres, p_dxp_litres,
    p_sxp_amount_ghs, p_dxp_amount_ghs, p_actor_id
  );

  RETURN NEXT v_new;
  RETURN;
END;
$$;


ALTER FUNCTION "public"."edit_credit_sale"("p_id" "uuid", "p_sale_date" "date", "p_sxp_litres" numeric, "p_dxp_litres" numeric, "p_sxp_amount_ghs" numeric, "p_dxp_amount_ghs" numeric, "p_actor_id" "uuid") OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creditor_payments" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "payment_date" "date" NOT NULL,
    "creditor_id" "uuid" NOT NULL,
    "amount_ghs" numeric(12,2) NOT NULL,
    "payment_method" "text",
    "reference" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone,
    "balance_before_ghs" numeric(12,2)
);


ALTER TABLE "public"."creditor_payments" OWNER TO "postgres";


COMMENT ON COLUMN "public"."creditor_payments"."balance_before_ghs" IS 'Creditor''s current_balance_ghs immediately before this payment was applied. Captured at write time so a reversal can restore the exact prior value even if this payment clamped the balance at zero. NULL on rows written before this migration — those cannot be safely auto-reversed.';



CREATE OR REPLACE FUNCTION "public"."edit_creditor_payment"("p_id" "uuid", "p_payment_date" "date", "p_amount_ghs" numeric, "p_payment_method" "text", "p_reference" "text", "p_actor_id" "uuid") RETURNS SETOF "public"."creditor_payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_old creditor_payments;
  v_new creditor_payments;
BEGIN
  SELECT * INTO v_old FROM creditor_payments WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found or already deleted', p_id;
  END IF;

  PERFORM reverse_creditor_payment(p_id);

  SELECT * INTO v_new FROM record_creditor_payment(
    p_payment_date, v_old.creditor_id, p_amount_ghs, p_payment_method, p_reference, p_actor_id
  );

  RETURN NEXT v_new;
  RETURN;
END;
$$;


ALTER FUNCTION "public"."edit_creditor_payment"("p_id" "uuid", "p_payment_date" "date", "p_amount_ghs" numeric, "p_payment_method" "text", "p_reference" "text", "p_actor_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_user_role"() RETURNS "public"."user_role"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
  SELECT role FROM users WHERE id = auth.uid();
$$;


ALTER FUNCTION "public"."get_user_role"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    'viewer'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_credit_sale"("p_sale_date" "date", "p_creditor_id" "uuid", "p_sxp_litres" numeric, "p_dxp_litres" numeric, "p_sxp_amount_ghs" numeric, "p_dxp_amount_ghs" numeric, "p_created_by" "uuid") RETURNS SETOF "public"."credit_sales"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_row credit_sales;
BEGIN
  INSERT INTO credit_sales (
    sale_date, creditor_id, sxp_litres, dxp_litres,
    sxp_amount_ghs, dxp_amount_ghs, created_by
  ) VALUES (
    p_sale_date, p_creditor_id, p_sxp_litres, p_dxp_litres,
    p_sxp_amount_ghs, p_dxp_amount_ghs, p_created_by
  )
  RETURNING * INTO v_row;

  UPDATE creditors
  SET current_balance_ghs = GREATEST(0, current_balance_ghs + (p_sxp_amount_ghs + p_dxp_amount_ghs))
  WHERE id = p_creditor_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creditor % not found', p_creditor_id;
  END IF;

  RETURN NEXT v_row;
  RETURN;
END;
$$;


ALTER FUNCTION "public"."record_credit_sale"("p_sale_date" "date", "p_creditor_id" "uuid", "p_sxp_litres" numeric, "p_dxp_litres" numeric, "p_sxp_amount_ghs" numeric, "p_dxp_amount_ghs" numeric, "p_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."record_creditor_payment"("p_payment_date" "date", "p_creditor_id" "uuid", "p_amount_ghs" numeric, "p_payment_method" "text", "p_reference" "text", "p_created_by" "uuid") RETURNS SETOF "public"."creditor_payments"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_row creditor_payments;
  v_balance_before NUMERIC;
BEGIN
  -- Explicit row lock, held for the rest of this transaction —
  -- same safety guarantee as the original implicit UPDATE lock,
  -- but lets us capture the exact pre-payment value to store.
  SELECT current_balance_ghs INTO v_balance_before
  FROM creditors WHERE id = p_creditor_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Creditor % not found', p_creditor_id;
  END IF;

  INSERT INTO creditor_payments (
    payment_date, creditor_id, amount_ghs, payment_method,
    reference, created_by, balance_before_ghs
  ) VALUES (
    p_payment_date, p_creditor_id, p_amount_ghs, p_payment_method,
    p_reference, p_created_by, v_balance_before
  )
  RETURNING * INTO v_row;

  UPDATE creditors
  SET current_balance_ghs = GREATEST(0, v_balance_before - p_amount_ghs)
  WHERE id = p_creditor_id;

  RETURN NEXT v_row;
  RETURN;
END;
$$;


ALTER FUNCTION "public"."record_creditor_payment"("p_payment_date" "date", "p_creditor_id" "uuid", "p_amount_ghs" numeric, "p_payment_method" "text", "p_reference" "text", "p_created_by" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_credit_sale"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_row credit_sales;
  v_latest_ts TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_row FROM credit_sales WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Credit sale % not found or already reversed', p_id;
  END IF;

  SELECT MAX(created_at) INTO v_latest_ts FROM (
    SELECT created_at FROM credit_sales WHERE creditor_id = v_row.creditor_id AND deleted_at IS NULL
    UNION ALL
    SELECT created_at FROM creditor_payments WHERE creditor_id = v_row.creditor_id AND deleted_at IS NULL
  ) t;

  IF v_row.created_at < v_latest_ts THEN
    RAISE EXCEPTION 'Only the most recent transaction for this creditor can be reversed — a newer transaction exists on this account';
  END IF;

  UPDATE credit_sales SET deleted_at = now() WHERE id = p_id;

  -- Safe unclamped subtraction — proven exact, see header note.
  -- GREATEST(0, ...) kept as a defensive floor only, never expected to trigger.
  UPDATE creditors
  SET current_balance_ghs = GREATEST(0, current_balance_ghs - (v_row.sxp_amount_ghs + v_row.dxp_amount_ghs))
  WHERE id = v_row.creditor_id;
END;
$$;


ALTER FUNCTION "public"."reverse_credit_sale"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."reverse_creditor_payment"("p_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_row creditor_payments;
  v_latest_ts TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_row FROM creditor_payments WHERE id = p_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment % not found or already reversed', p_id;
  END IF;

  IF v_row.balance_before_ghs IS NULL THEN
    RAISE EXCEPTION 'This payment predates balance-snapshot tracking and cannot be safely auto-reversed — record a correcting entry instead';
  END IF;

  SELECT MAX(created_at) INTO v_latest_ts FROM (
    SELECT created_at FROM credit_sales WHERE creditor_id = v_row.creditor_id AND deleted_at IS NULL
    UNION ALL
    SELECT created_at FROM creditor_payments WHERE creditor_id = v_row.creditor_id AND deleted_at IS NULL
  ) t;

  IF v_row.created_at < v_latest_ts THEN
    RAISE EXCEPTION 'Only the most recent transaction for this creditor can be reversed — a newer transaction exists on this account';
  END IF;

  UPDATE creditor_payments SET deleted_at = now() WHERE id = p_id;

  -- Exact restore of the captured pre-payment value — correct even
  -- if this payment clamped the balance at zero on the way in.
  UPDATE creditors
  SET current_balance_ghs = v_row.balance_before_ghs
  WHERE id = v_row.creditor_id;
END;
$$;


ALTER FUNCTION "public"."reverse_creditor_payment"("p_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."rls_auto_enable"() RETURNS "event_trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'pg_catalog'
    AS $$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$$;


ALTER FUNCTION "public"."rls_auto_enable"() OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."attendants" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deactivated_at" timestamp with time zone
);


ALTER TABLE "public"."attendants" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."audit_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "table_name" "text" NOT NULL,
    "record_id" "uuid",
    "action" "public"."audit_action" NOT NULL,
    "old_values" "jsonb",
    "new_values" "jsonb",
    "changed_by" "uuid",
    "changed_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "ip_address" "text"
);


ALTER TABLE "public"."audit_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."banking" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "entry_date" "date" NOT NULL,
    "nib_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "umb_momo_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "gocard_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "coupons_50_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "coupons_100_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_banked_ghs" numeric(12,2) GENERATED ALWAYS AS ((((("nib_ghs" + "umb_momo_ghs") + "gocard_ghs") + "coupons_50_ghs") + "coupons_100_ghs")) STORED,
    "variance_vs_sales" numeric(12,2) DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."banking" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."compliance_certificates" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "certificate_name" "text" NOT NULL,
    "issuing_authority" "text" NOT NULL,
    "reference_number" "text",
    "issue_date" "date" NOT NULL,
    "expiry_date" "date" NOT NULL,
    "status" "public"."certificate_status" DEFAULT 'valid'::"public"."certificate_status" NOT NULL,
    "alert_days_before" integer DEFAULT 30 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."compliance_certificates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."creditors" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "name" "text" NOT NULL,
    "contact_name" "text",
    "contact_phone" "text",
    "credit_limit_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "current_balance_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."creditors" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."expenses" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "expense_date" "date" NOT NULL,
    "category" "public"."expense_category" NOT NULL,
    "amount_ghs" numeric(12,2) NOT NULL,
    "description" "text" NOT NULL,
    "receipt_number" "text",
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "deleted_at" timestamp with time zone
);


ALTER TABLE "public"."expenses" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."fuel_prices" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "fuel_type" "public"."fuel_type" NOT NULL,
    "price_per_litre" numeric(10,4) NOT NULL,
    "effective_date" "date" NOT NULL,
    "npa_reference" "text",
    "updated_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."fuel_prices" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."generated_reports" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "report_month" "date" NOT NULL,
    "generated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "generated_by" "uuid",
    "is_auto" boolean DEFAULT false NOT NULL,
    "is_preliminary" boolean DEFAULT false NOT NULL,
    "snapshot_json" "jsonb",
    "pdf_url" "text",
    "notes" "text"
);


ALTER TABLE "public"."generated_reports" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."import_log" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "import_type" "public"."import_type" NOT NULL,
    "filename" "text" NOT NULL,
    "imported_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "imported_by" "uuid",
    "rows_imported" integer DEFAULT 0 NOT NULL,
    "rows_skipped" integer DEFAULT 0 NOT NULL,
    "warnings" "jsonb",
    "status" "public"."import_status" DEFAULT 'success'::"public"."import_status" NOT NULL
);


ALTER TABLE "public"."import_log" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."price_update_suggestions" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "fuel_type" "public"."fuel_type" NOT NULL,
    "suggested_price_per_litre" numeric(10,4) NOT NULL,
    "npa_reference" "text",
    "fetched_by" "uuid",
    "fetched_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "status" "public"."suggestion_status" DEFAULT 'pending'::"public"."suggestion_status" NOT NULL,
    "reviewed_by" "uuid",
    "reviewed_at" timestamp with time zone
);


ALTER TABLE "public"."price_update_suggestions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."pump_meter_readings" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "reading_date" "date" NOT NULL,
    "pump_id" "public"."pump_id_enum" NOT NULL,
    "fuel_type" "public"."fuel_type" NOT NULL,
    "attendant_id" "uuid",
    "opening_meter" numeric(12,2) DEFAULT 0 NOT NULL,
    "closing_meter" numeric(12,2) DEFAULT 0 NOT NULL,
    "litres_sold" numeric(10,2) GENERATED ALWAYS AS (("closing_meter" - "opening_meter")) STORED,
    "amount_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "rtt_litres" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."pump_meter_readings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."sales_book" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "entry_date" "date" NOT NULL,
    "coupons_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "gocard_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "momo_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "merka_wood_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "genset_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "lubricant_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "total_sales_ghs" numeric(12,2) GENERATED ALWAYS AS (((((("coupons_ghs" + "gocard_ghs") + "momo_ghs") + "merka_wood_ghs") + "genset_ghs") + "lubricant_ghs")) STORED,
    "meter_amount_ghs" numeric(12,2) DEFAULT 0 NOT NULL,
    "variance_ghs" numeric(12,2) GENERATED ALWAYS AS ((((((("coupons_ghs" + "gocard_ghs") + "momo_ghs") + "merka_wood_ghs") + "genset_ghs") + "lubricant_ghs") - "meter_amount_ghs")) STORED,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."sales_book" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."shifts" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "shift_date" "date" NOT NULL,
    "pump_id" "public"."pump_id_enum" NOT NULL,
    "attendant_id" "uuid" NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."shifts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."station_setup" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "station_name" "text" DEFAULT 'T-Man Kuntunso GOIL Station'::"text" NOT NULL,
    "dealer_code" "text",
    "location" "text" DEFAULT 'Kuntunso, Western Region'::"text" NOT NULL,
    "system_start_date" "date",
    "pump_count" integer DEFAULT 3 NOT NULL,
    "tank_count" integer DEFAULT 2 NOT NULL,
    "dealer_margin_per_litre" numeric(10,4) DEFAULT 0.3000 NOT NULL,
    "setup_completed" boolean DEFAULT false NOT NULL,
    "setup_completed_at" timestamp with time zone,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."station_setup" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tank_stock" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "stock_date" "date" NOT NULL,
    "tank_id" "public"."tank_id_enum" NOT NULL,
    "fuel_type" "public"."fuel_type" NOT NULL,
    "opening_stock" numeric(10,2) DEFAULT 0 NOT NULL,
    "litres_sold" numeric(10,2) DEFAULT 0 NOT NULL,
    "delivery_litres" numeric(10,2) DEFAULT 0 NOT NULL,
    "closing_stock_dip" numeric(10,2) DEFAULT 0 NOT NULL,
    "actual_variance" numeric(10,2) GENERATED ALWAYS AS (("closing_stock_dip" - (("opening_stock" + "delivery_litres") - "litres_sold"))) STORED,
    "expected_variance" numeric(10,2) DEFAULT 0 NOT NULL,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tank_stock" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."tanker_deliveries" (
    "id" "uuid" DEFAULT "extensions"."uuid_generate_v4"() NOT NULL,
    "delivery_date" "date" NOT NULL,
    "fuel_type" "public"."fuel_type" NOT NULL,
    "tank_id" "public"."tank_id_enum" NOT NULL,
    "bol_number" "text" NOT NULL,
    "truck_registration" "text" NOT NULL,
    "driver_name" "text",
    "expected_litres" numeric(10,2) DEFAULT 0 NOT NULL,
    "actual_litres" numeric(10,2) DEFAULT 0 NOT NULL,
    "shortage_litres" numeric(10,2) GENERATED ALWAYS AS (("expected_litres" - "actual_litres")) STORED,
    "created_by" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."tanker_deliveries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "name" "text" NOT NULL,
    "role" "public"."user_role" DEFAULT 'viewer'::"public"."user_role" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_login" timestamp with time zone
);


ALTER TABLE "public"."users" OWNER TO "postgres";


ALTER TABLE ONLY "public"."attendants"
    ADD CONSTRAINT "attendants_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."banking"
    ADD CONSTRAINT "banking_entry_date_key" UNIQUE ("entry_date");



ALTER TABLE ONLY "public"."banking"
    ADD CONSTRAINT "banking_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."compliance_certificates"
    ADD CONSTRAINT "compliance_certificates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."credit_sales"
    ADD CONSTRAINT "credit_sales_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creditor_payments"
    ADD CONSTRAINT "creditor_payments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."creditors"
    ADD CONSTRAINT "creditors_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."fuel_prices"
    ADD CONSTRAINT "fuel_prices_fuel_type_effective_date_key" UNIQUE ("fuel_type", "effective_date");



ALTER TABLE ONLY "public"."fuel_prices"
    ADD CONSTRAINT "fuel_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."import_log"
    ADD CONSTRAINT "import_log_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."price_update_suggestions"
    ADD CONSTRAINT "price_update_suggestions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pump_meter_readings"
    ADD CONSTRAINT "pump_meter_readings_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."pump_meter_readings"
    ADD CONSTRAINT "pump_meter_readings_reading_date_pump_id_fuel_type_key" UNIQUE ("reading_date", "pump_id", "fuel_type");



ALTER TABLE ONLY "public"."sales_book"
    ADD CONSTRAINT "sales_book_entry_date_key" UNIQUE ("entry_date");



ALTER TABLE ONLY "public"."sales_book"
    ADD CONSTRAINT "sales_book_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_shift_date_pump_id_key" UNIQUE ("shift_date", "pump_id");



ALTER TABLE ONLY "public"."station_setup"
    ADD CONSTRAINT "station_setup_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tank_stock"
    ADD CONSTRAINT "tank_stock_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."tank_stock"
    ADD CONSTRAINT "tank_stock_stock_date_tank_id_key" UNIQUE ("stock_date", "tank_id");



ALTER TABLE ONLY "public"."tanker_deliveries"
    ADD CONSTRAINT "tanker_deliveries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_pkey" PRIMARY KEY ("id");



CREATE UNIQUE INDEX "station_setup_singleton" ON "public"."station_setup" USING "btree" ((true));



CREATE OR REPLACE TRIGGER "audit_attendants" AFTER INSERT OR DELETE OR UPDATE ON "public"."attendants" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_banking" AFTER INSERT OR DELETE OR UPDATE ON "public"."banking" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_compliance_certificates" AFTER INSERT OR DELETE OR UPDATE ON "public"."compliance_certificates" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_credit_sales" AFTER INSERT OR DELETE OR UPDATE ON "public"."credit_sales" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_creditor_payments" AFTER INSERT OR DELETE OR UPDATE ON "public"."creditor_payments" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_creditors" AFTER INSERT OR DELETE OR UPDATE ON "public"."creditors" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_expenses" AFTER INSERT OR DELETE OR UPDATE ON "public"."expenses" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_fuel_prices" AFTER INSERT OR DELETE OR UPDATE ON "public"."fuel_prices" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_price_update_suggestions" AFTER INSERT OR DELETE OR UPDATE ON "public"."price_update_suggestions" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_pump_meter_readings" AFTER INSERT OR DELETE OR UPDATE ON "public"."pump_meter_readings" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_sales_book" AFTER INSERT OR DELETE OR UPDATE ON "public"."sales_book" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_shifts" AFTER INSERT OR DELETE OR UPDATE ON "public"."shifts" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_station_setup" AFTER INSERT OR DELETE OR UPDATE ON "public"."station_setup" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_tank_stock" AFTER INSERT OR DELETE OR UPDATE ON "public"."tank_stock" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_tanker_deliveries" AFTER INSERT OR DELETE OR UPDATE ON "public"."tanker_deliveries" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



CREATE OR REPLACE TRIGGER "audit_users" AFTER INSERT OR DELETE OR UPDATE ON "public"."users" FOR EACH ROW EXECUTE FUNCTION "public"."audit_log_trigger"();



ALTER TABLE ONLY "public"."audit_log"
    ADD CONSTRAINT "audit_log_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."banking"
    ADD CONSTRAINT "banking_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."compliance_certificates"
    ADD CONSTRAINT "compliance_certificates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."credit_sales"
    ADD CONSTRAINT "credit_sales_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."credit_sales"
    ADD CONSTRAINT "credit_sales_creditor_id_fkey" FOREIGN KEY ("creditor_id") REFERENCES "public"."creditors"("id");



ALTER TABLE ONLY "public"."creditor_payments"
    ADD CONSTRAINT "creditor_payments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."creditor_payments"
    ADD CONSTRAINT "creditor_payments_creditor_id_fkey" FOREIGN KEY ("creditor_id") REFERENCES "public"."creditors"("id");



ALTER TABLE ONLY "public"."expenses"
    ADD CONSTRAINT "expenses_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."fuel_prices"
    ADD CONSTRAINT "fuel_prices_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."generated_reports"
    ADD CONSTRAINT "generated_reports_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."import_log"
    ADD CONSTRAINT "import_log_imported_by_fkey" FOREIGN KEY ("imported_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."price_update_suggestions"
    ADD CONSTRAINT "price_update_suggestions_fetched_by_fkey" FOREIGN KEY ("fetched_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."price_update_suggestions"
    ADD CONSTRAINT "price_update_suggestions_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."pump_meter_readings"
    ADD CONSTRAINT "pump_meter_readings_attendant_id_fkey" FOREIGN KEY ("attendant_id") REFERENCES "public"."attendants"("id");



ALTER TABLE ONLY "public"."pump_meter_readings"
    ADD CONSTRAINT "pump_meter_readings_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."sales_book"
    ADD CONSTRAINT "sales_book_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_attendant_id_fkey" FOREIGN KEY ("attendant_id") REFERENCES "public"."attendants"("id");



ALTER TABLE ONLY "public"."shifts"
    ADD CONSTRAINT "shifts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tank_stock"
    ADD CONSTRAINT "tank_stock_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."tanker_deliveries"
    ADD CONSTRAINT "tanker_deliveries_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id");



ALTER TABLE ONLY "public"."users"
    ADD CONSTRAINT "users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE "public"."attendants" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "attendants_delete_admin" ON "public"."attendants" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "attendants_insert" ON "public"."attendants" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "attendants_select" ON "public"."attendants" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role", 'viewer'::"public"."user_role"])));



CREATE POLICY "attendants_update" ON "public"."attendants" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



ALTER TABLE "public"."audit_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "audit_log_select_admin" ON "public"."audit_log" FOR SELECT USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



ALTER TABLE "public"."banking" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "banking_delete_admin" ON "public"."banking" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "banking_insert" ON "public"."banking" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "banking_select" ON "public"."banking" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "banking_update" ON "public"."banking" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



ALTER TABLE "public"."compliance_certificates" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "compliance_delete_admin" ON "public"."compliance_certificates" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "compliance_insert" ON "public"."compliance_certificates" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "compliance_select" ON "public"."compliance_certificates" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "compliance_update_admin" ON "public"."compliance_certificates" FOR UPDATE USING (("public"."get_user_role"() = 'admin'::"public"."user_role")) WITH CHECK (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "compliance_update_manager" ON "public"."compliance_certificates" FOR UPDATE USING (("public"."get_user_role"() = 'manager'::"public"."user_role")) WITH CHECK ((("public"."get_user_role"() = 'manager'::"public"."user_role") AND ("status" <> 'archived'::"public"."certificate_status")));



ALTER TABLE "public"."credit_sales" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "credit_sales_delete_admin" ON "public"."credit_sales" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "credit_sales_insert" ON "public"."credit_sales" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "credit_sales_select" ON "public"."credit_sales" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "credit_sales_update" ON "public"."credit_sales" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



ALTER TABLE "public"."creditor_payments" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "creditor_payments_delete_admin" ON "public"."creditor_payments" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "creditor_payments_insert" ON "public"."creditor_payments" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "creditor_payments_select" ON "public"."creditor_payments" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "creditor_payments_update" ON "public"."creditor_payments" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



ALTER TABLE "public"."creditors" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "creditors_delete_admin" ON "public"."creditors" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "creditors_insert" ON "public"."creditors" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "creditors_select" ON "public"."creditors" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "creditors_update" ON "public"."creditors" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "deliveries_delete_admin" ON "public"."tanker_deliveries" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "deliveries_insert" ON "public"."tanker_deliveries" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "deliveries_select" ON "public"."tanker_deliveries" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "deliveries_update" ON "public"."tanker_deliveries" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



ALTER TABLE "public"."expenses" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expenses_delete_admin" ON "public"."expenses" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "expenses_insert" ON "public"."expenses" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "expenses_select" ON "public"."expenses" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "expenses_update" ON "public"."expenses" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



ALTER TABLE "public"."fuel_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "fuel_prices_insert" ON "public"."fuel_prices" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "fuel_prices_select" ON "public"."fuel_prices" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "fuel_prices_update_admin" ON "public"."fuel_prices" FOR UPDATE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



ALTER TABLE "public"."generated_reports" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."import_log" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "import_log_insert" ON "public"."import_log" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "import_log_select" ON "public"."import_log" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "meter_readings_delete_admin" ON "public"."pump_meter_readings" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "meter_readings_insert" ON "public"."pump_meter_readings" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "meter_readings_select" ON "public"."pump_meter_readings" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role", 'viewer'::"public"."user_role"])));



CREATE POLICY "meter_readings_update" ON "public"."pump_meter_readings" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



ALTER TABLE "public"."price_update_suggestions" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."pump_meter_readings" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "reports_insert" ON "public"."generated_reports" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "reports_select" ON "public"."generated_reports" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "reports_update_admin" ON "public"."generated_reports" FOR UPDATE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



ALTER TABLE "public"."sales_book" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "sales_book_delete_admin" ON "public"."sales_book" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "sales_book_insert" ON "public"."sales_book" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "sales_book_select" ON "public"."sales_book" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "sales_book_update" ON "public"."sales_book" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



ALTER TABLE "public"."shifts" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "shifts_delete_admin" ON "public"."shifts" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "shifts_insert" ON "public"."shifts" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "shifts_select" ON "public"."shifts" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role", 'viewer'::"public"."user_role"])));



CREATE POLICY "shifts_update" ON "public"."shifts" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



ALTER TABLE "public"."station_setup" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "station_setup_delete_admin" ON "public"."station_setup" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "station_setup_insert_admin" ON "public"."station_setup" FOR INSERT WITH CHECK (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "station_setup_select" ON "public"."station_setup" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "station_setup_update" ON "public"."station_setup" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "suggestions_insert" ON "public"."price_update_suggestions" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "suggestions_select" ON "public"."price_update_suggestions" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "suggestions_update_admin" ON "public"."price_update_suggestions" FOR UPDATE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



ALTER TABLE "public"."tank_stock" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "tank_stock_delete_admin" ON "public"."tank_stock" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "tank_stock_insert" ON "public"."tank_stock" FOR INSERT WITH CHECK (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "tank_stock_select" ON "public"."tank_stock" FOR SELECT USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



CREATE POLICY "tank_stock_update" ON "public"."tank_stock" FOR UPDATE USING (("public"."get_user_role"() = ANY (ARRAY['admin'::"public"."user_role", 'manager'::"public"."user_role"])));



ALTER TABLE "public"."tanker_deliveries" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "users_delete_admin" ON "public"."users" FOR DELETE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "users_insert_admin" ON "public"."users" FOR INSERT WITH CHECK (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "users_insert_manager" ON "public"."users" FOR INSERT WITH CHECK ((("public"."get_user_role"() = 'manager'::"public"."user_role") AND ("role" <> 'admin'::"public"."user_role")));



CREATE POLICY "users_select_admin" ON "public"."users" FOR SELECT USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "users_select_own" ON "public"."users" FOR SELECT USING (("id" = "auth"."uid"()));



CREATE POLICY "users_update_admin" ON "public"."users" FOR UPDATE USING (("public"."get_user_role"() = 'admin'::"public"."user_role"));



CREATE POLICY "users_update_manager" ON "public"."users" FOR UPDATE USING ((("public"."get_user_role"() = 'manager'::"public"."user_role") AND ("role" <> 'admin'::"public"."user_role")));





ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";


GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";






















































































































































GRANT ALL ON FUNCTION "public"."audit_log_trigger"() TO "anon";
GRANT ALL ON FUNCTION "public"."audit_log_trigger"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."audit_log_trigger"() TO "service_role";



GRANT ALL ON TABLE "public"."credit_sales" TO "anon";
GRANT ALL ON TABLE "public"."credit_sales" TO "authenticated";
GRANT ALL ON TABLE "public"."credit_sales" TO "service_role";



GRANT ALL ON FUNCTION "public"."edit_credit_sale"("p_id" "uuid", "p_sale_date" "date", "p_sxp_litres" numeric, "p_dxp_litres" numeric, "p_sxp_amount_ghs" numeric, "p_dxp_amount_ghs" numeric, "p_actor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."edit_credit_sale"("p_id" "uuid", "p_sale_date" "date", "p_sxp_litres" numeric, "p_dxp_litres" numeric, "p_sxp_amount_ghs" numeric, "p_dxp_amount_ghs" numeric, "p_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."edit_credit_sale"("p_id" "uuid", "p_sale_date" "date", "p_sxp_litres" numeric, "p_dxp_litres" numeric, "p_sxp_amount_ghs" numeric, "p_dxp_amount_ghs" numeric, "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON TABLE "public"."creditor_payments" TO "anon";
GRANT ALL ON TABLE "public"."creditor_payments" TO "authenticated";
GRANT ALL ON TABLE "public"."creditor_payments" TO "service_role";



GRANT ALL ON FUNCTION "public"."edit_creditor_payment"("p_id" "uuid", "p_payment_date" "date", "p_amount_ghs" numeric, "p_payment_method" "text", "p_reference" "text", "p_actor_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."edit_creditor_payment"("p_id" "uuid", "p_payment_date" "date", "p_amount_ghs" numeric, "p_payment_method" "text", "p_reference" "text", "p_actor_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."edit_creditor_payment"("p_id" "uuid", "p_payment_date" "date", "p_amount_ghs" numeric, "p_payment_method" "text", "p_reference" "text", "p_actor_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_user_role"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_user_role"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."record_credit_sale"("p_sale_date" "date", "p_creditor_id" "uuid", "p_sxp_litres" numeric, "p_dxp_litres" numeric, "p_sxp_amount_ghs" numeric, "p_dxp_amount_ghs" numeric, "p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_credit_sale"("p_sale_date" "date", "p_creditor_id" "uuid", "p_sxp_litres" numeric, "p_dxp_litres" numeric, "p_sxp_amount_ghs" numeric, "p_dxp_amount_ghs" numeric, "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_credit_sale"("p_sale_date" "date", "p_creditor_id" "uuid", "p_sxp_litres" numeric, "p_dxp_litres" numeric, "p_sxp_amount_ghs" numeric, "p_dxp_amount_ghs" numeric, "p_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."record_creditor_payment"("p_payment_date" "date", "p_creditor_id" "uuid", "p_amount_ghs" numeric, "p_payment_method" "text", "p_reference" "text", "p_created_by" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."record_creditor_payment"("p_payment_date" "date", "p_creditor_id" "uuid", "p_amount_ghs" numeric, "p_payment_method" "text", "p_reference" "text", "p_created_by" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."record_creditor_payment"("p_payment_date" "date", "p_creditor_id" "uuid", "p_amount_ghs" numeric, "p_payment_method" "text", "p_reference" "text", "p_created_by" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reverse_credit_sale"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reverse_credit_sale"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reverse_credit_sale"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."reverse_creditor_payment"("p_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."reverse_creditor_payment"("p_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."reverse_creditor_payment"("p_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "anon";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."rls_auto_enable"() TO "service_role";


















GRANT ALL ON TABLE "public"."attendants" TO "anon";
GRANT ALL ON TABLE "public"."attendants" TO "authenticated";
GRANT ALL ON TABLE "public"."attendants" TO "service_role";



GRANT ALL ON TABLE "public"."audit_log" TO "anon";
GRANT ALL ON TABLE "public"."audit_log" TO "authenticated";
GRANT ALL ON TABLE "public"."audit_log" TO "service_role";



GRANT ALL ON TABLE "public"."banking" TO "anon";
GRANT ALL ON TABLE "public"."banking" TO "authenticated";
GRANT ALL ON TABLE "public"."banking" TO "service_role";



GRANT ALL ON TABLE "public"."compliance_certificates" TO "anon";
GRANT ALL ON TABLE "public"."compliance_certificates" TO "authenticated";
GRANT ALL ON TABLE "public"."compliance_certificates" TO "service_role";



GRANT ALL ON TABLE "public"."creditors" TO "anon";
GRANT ALL ON TABLE "public"."creditors" TO "authenticated";
GRANT ALL ON TABLE "public"."creditors" TO "service_role";



GRANT ALL ON TABLE "public"."expenses" TO "anon";
GRANT ALL ON TABLE "public"."expenses" TO "authenticated";
GRANT ALL ON TABLE "public"."expenses" TO "service_role";



GRANT ALL ON TABLE "public"."fuel_prices" TO "anon";
GRANT ALL ON TABLE "public"."fuel_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."fuel_prices" TO "service_role";



GRANT ALL ON TABLE "public"."generated_reports" TO "anon";
GRANT ALL ON TABLE "public"."generated_reports" TO "authenticated";
GRANT ALL ON TABLE "public"."generated_reports" TO "service_role";



GRANT ALL ON TABLE "public"."import_log" TO "anon";
GRANT ALL ON TABLE "public"."import_log" TO "authenticated";
GRANT ALL ON TABLE "public"."import_log" TO "service_role";



GRANT ALL ON TABLE "public"."price_update_suggestions" TO "anon";
GRANT ALL ON TABLE "public"."price_update_suggestions" TO "authenticated";
GRANT ALL ON TABLE "public"."price_update_suggestions" TO "service_role";



GRANT ALL ON TABLE "public"."pump_meter_readings" TO "anon";
GRANT ALL ON TABLE "public"."pump_meter_readings" TO "authenticated";
GRANT ALL ON TABLE "public"."pump_meter_readings" TO "service_role";



GRANT ALL ON TABLE "public"."sales_book" TO "anon";
GRANT ALL ON TABLE "public"."sales_book" TO "authenticated";
GRANT ALL ON TABLE "public"."sales_book" TO "service_role";



GRANT ALL ON TABLE "public"."shifts" TO "anon";
GRANT ALL ON TABLE "public"."shifts" TO "authenticated";
GRANT ALL ON TABLE "public"."shifts" TO "service_role";



GRANT ALL ON TABLE "public"."station_setup" TO "anon";
GRANT ALL ON TABLE "public"."station_setup" TO "authenticated";
GRANT ALL ON TABLE "public"."station_setup" TO "service_role";



GRANT ALL ON TABLE "public"."tank_stock" TO "anon";
GRANT ALL ON TABLE "public"."tank_stock" TO "authenticated";
GRANT ALL ON TABLE "public"."tank_stock" TO "service_role";



GRANT ALL ON TABLE "public"."tanker_deliveries" TO "anon";
GRANT ALL ON TABLE "public"."tanker_deliveries" TO "authenticated";
GRANT ALL ON TABLE "public"."tanker_deliveries" TO "service_role";



GRANT ALL ON TABLE "public"."users" TO "anon";
GRANT ALL ON TABLE "public"."users" TO "authenticated";
GRANT ALL ON TABLE "public"."users" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";



































