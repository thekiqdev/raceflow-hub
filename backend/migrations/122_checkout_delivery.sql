CREATE TABLE checkout_delivery_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES checkout_orders(id),
  registration_id uuid REFERENCES registrations(id),
  kind text NOT NULL CHECK (kind IN ('buyer_confirmation','athlete_confirmation','refund','bonus')),
  dedupe_key text NOT NULL UNIQUE,
  recipient text,
  payload jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sending','done','unknown','cancelled')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX checkout_delivery_pending ON checkout_delivery_jobs(next_attempt_at) WHERE status='pending';
CREATE TABLE checkout_identity_links (
  registration_id uuid PRIMARY KEY REFERENCES registrations(id),
  runner_id uuid NOT NULL REFERENCES users(id),
  linked_at timestamptz NOT NULL DEFAULT now(),
  verification_source text NOT NULL
);
ALTER TABLE leader_commissions ALTER COLUMN referred_user_id DROP NOT NULL;
ALTER TABLE leader_commissions ADD COLUMN checkout_effect_id uuid UNIQUE REFERENCES checkout_payment_effects(id);
ALTER TABLE registrations ADD COLUMN checkout_kit_collected_at timestamptz;
ALTER TABLE registrations ADD COLUMN checkout_kit_collected_by uuid REFERENCES users(id);
ALTER TABLE registrations ADD COLUMN checkout_kit_returned_at timestamptz;
ALTER TABLE registrations ADD COLUMN checkout_kit_returned_by uuid REFERENCES users(id);

-- Reembolso não devolve fisicamente um kit já entregue. Proteção adicional à migração 118.
CREATE FUNCTION check_checkout_delivered_stock() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reg registrations%ROWTYPE; variant record; used_count integer; reg_id uuid;
BEGIN
  IF TG_TABLE_NAME='registrations' THEN reg_id:=NEW.id; ELSE reg_id:=NEW.registration_id; END IF;
  SELECT * INTO reg FROM registrations WHERE id=reg_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('registration-inventory:'||reg.event_id::text,0));
  FOR variant IN SELECT DISTINCT v.id,v.available_quantity FROM registration_product_selections s
    JOIN product_variants v ON v.id=s.variant_id WHERE s.registration_id=reg.id AND v.available_quantity IS NOT NULL ORDER BY v.id
  LOOP
    SELECT COUNT(DISTINCT r.id) INTO used_count FROM registration_product_selections s JOIN registrations r ON r.id=s.registration_id
      WHERE s.variant_id=variant.id AND (r.status IN ('pending','confirmed','refund_requested')
        OR (r.status='transferred' AND r.transferred_to_registration_id IS NULL)
        OR (r.checkout_kit_collected_at IS NOT NULL AND r.checkout_kit_returned_at IS NULL));
    IF used_count>variant.available_quantity THEN RAISE EXCEPTION 'Estoque desta variante esgotado.' USING ERRCODE='CT001'; END IF;
  END LOOP;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER checkout_delivered_stock_guard AFTER INSERT OR UPDATE ON registrations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_checkout_delivered_stock();
CREATE CONSTRAINT TRIGGER checkout_delivered_selection_stock_guard AFTER INSERT OR UPDATE ON registration_product_selections
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION check_checkout_delivered_stock();

-- Uma identidade editada deixa de carregar a comprovação da identidade anterior.
CREATE FUNCTION invalidate_checkout_identity_proof() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF regexp_replace(COALESCE(NEW.cpf,''),'[^0-9]','','g') IS DISTINCT FROM regexp_replace(COALESCE(OLD.cpf,''),'[^0-9]','','g')
    OR NEW.birth_date IS DISTINCT FROM OLD.birth_date THEN
    NEW.cpf_validated_at := NULL;
    NEW.cpf_lookup_source := NULL;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER invalidate_checkout_identity_proof BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION invalidate_checkout_identity_proof();
