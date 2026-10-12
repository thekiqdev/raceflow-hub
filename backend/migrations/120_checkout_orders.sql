CREATE TABLE public.checkout_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.users(id),
  event_id uuid NOT NULL REFERENCES public.events(id),
  request_key uuid NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed','reserved','awaiting_payment','confirmed','cancelled','expired')),
  version integer NOT NULL DEFAULT 1,
  reserved_from_version integer,
  total_cents bigint NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  review_expires_at timestamptz,
  reservation_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(buyer_id,request_key)
);
CREATE INDEX checkout_orders_expiry ON public.checkout_orders(reservation_expires_at) WHERE status='reserved';
ALTER TABLE public.registrations ADD COLUMN order_id uuid REFERENCES public.checkout_orders(id);
ALTER TABLE public.registrations ADD COLUMN participant_cpf varchar(11) CHECK (participant_cpf ~ '^[0-9]{11}$');
ALTER TABLE public.registrations ALTER COLUMN runner_id DROP NOT NULL;
ALTER TABLE public.registrations ADD CONSTRAINT registration_identity_required
  CHECK (runner_id IS NOT NULL OR (order_id IS NOT NULL AND participant_cpf IS NOT NULL));
CREATE INDEX registrations_order_id ON public.registrations(order_id);
CREATE INDEX registrations_participant_cpf_event ON public.registrations(event_id,participant_cpf);
CREATE TABLE public.checkout_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.checkout_orders(id) ON DELETE CASCADE,
  participant_id uuid NOT NULL REFERENCES public.checkout_participants(id),
  position integer NOT NULL,
  choices jsonb NOT NULL,
  snapshot jsonb,
  coupon_id uuid REFERENCES public.coupons(id),
  registration_id uuid UNIQUE REFERENCES public.registrations(id),
  UNIQUE(order_id,participant_id), UNIQUE(order_id,position)
);
COMMENT ON COLUMN public.checkout_order_items.snapshot IS 'Fotografia interna de identidade, escolhas e preço. Não serializar integralmente na API do comprador.';

-- Impede que operações antigas alterem apenas um item de uma compra conjunta.
CREATE FUNCTION public.guard_order_registration_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE oid uuid;
BEGIN
  IF TG_OP='INSERT' THEN oid:=NEW.order_id; ELSE oid:=OLD.order_id; END IF;
  IF oid IS NOT NULL AND current_setting('cronoteam.order_write',true) IS DISTINCT FROM oid::text THEN
    RAISE EXCEPTION 'Esta inscrição deve ser gerenciada pelo pedido.' USING ERRCODE='CT001';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND NEW.order_id IS DISTINCT FROM OLD.order_id THEN
    RAISE EXCEPTION 'O vínculo da inscrição ao pedido não pode ser alterado.' USING ERRCODE='CT001';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER order_registration_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.registrations
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_registration_write();

CREATE FUNCTION public.guard_order_selection_write() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE registration_uuid uuid; oid uuid;
BEGIN
  IF TG_OP='INSERT' THEN registration_uuid:=NEW.registration_id; ELSE registration_uuid:=OLD.registration_id; END IF;
  SELECT order_id INTO oid FROM public.registrations WHERE id=registration_uuid;
  IF oid IS NOT NULL AND current_setting('cronoteam.order_write',true) IS DISTINCT FROM oid::text THEN
    RAISE EXCEPTION 'As escolhas desta inscrição devem ser gerenciadas pelo pedido.' USING ERRCODE='CT001';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  IF TG_OP='UPDATE' AND NEW.registration_id IS DISTINCT FROM OLD.registration_id THEN
    SELECT order_id INTO oid FROM public.registrations WHERE id=NEW.registration_id;
    IF oid IS NOT NULL AND current_setting('cronoteam.order_write',true) IS DISTINCT FROM oid::text THEN
      RAISE EXCEPTION 'As escolhas desta inscrição devem ser gerenciadas pelo pedido.' USING ERRCODE='CT001';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER order_selection_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.registration_product_selections
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_selection_write();
CREATE TRIGGER order_custom_field_write_guard BEFORE INSERT OR UPDATE OR DELETE ON public.registration_custom_field_values
  FOR EACH ROW EXECUTE FUNCTION public.guard_order_selection_write();

-- A identidade do atleta não depende de existir conta. Inclui concorrência com checkout legado.
CREATE FUNCTION public.check_order_participant_identity() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE reg public.registrations%ROWTYPE; cpf_digits text;
BEGIN
  SELECT * INTO reg FROM public.registrations WHERE id=NEW.id;
  IF NOT FOUND OR reg.status='cancelled' OR (reg.status='transferred' AND reg.transferred_to_registration_id IS NOT NULL)
    THEN RETURN NULL; END IF;
  IF reg.payment_method='free_bonus' AND NOT EXISTS (SELECT 1 FROM public.leader_invitations li
    WHERE li.bonus_registration_id=reg.id AND li.runner_id=reg.runner_id AND li.status IN ('sent','used')) THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('registration-inventory:'||reg.event_id::text,0));
  SELECT COALESCE(reg.participant_cpf,regexp_replace(p.cpf,'[^0-9]','','g')) INTO cpf_digits
    FROM (SELECT 1) dummy LEFT JOIN public.profiles p ON p.id=reg.runner_id;
  IF cpf_digits IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.registrations r LEFT JOIN public.profiles p ON p.id=r.runner_id
    WHERE r.id<>reg.id AND r.event_id=reg.event_id AND (r.order_id IS NOT NULL OR reg.order_id IS NOT NULL)
      AND COALESCE(r.participant_cpf,regexp_replace(p.cpf,'[^0-9]','','g'))=cpf_digits
      AND r.status<>'cancelled' AND NOT (r.status='transferred' AND r.transferred_to_registration_id IS NOT NULL)
      AND (COALESCE(r.payment_method::text,'')<>'free_bonus' OR EXISTS (SELECT 1 FROM public.leader_invitations li
        WHERE li.bonus_registration_id=r.id AND li.runner_id=r.runner_id AND li.status IN ('sent','used')))) THEN
    RAISE EXCEPTION 'Este participante já possui inscrição neste evento.' USING ERRCODE='CT001';
  END IF;
  RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER order_participant_identity_guard AFTER INSERT OR UPDATE ON public.registrations
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.check_order_participant_identity();
