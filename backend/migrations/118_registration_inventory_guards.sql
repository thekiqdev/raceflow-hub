-- Proteção final, inclusive para fluxos que gravam diretamente no banco.
-- A verificação diferida observa o estado final da transação (inclusive transferência split).
-- Estoque continua derivado: nenhum contador é decrementado ao confirmar pagamento.
CREATE OR REPLACE FUNCTION public.check_registration_inventory()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  registration_uuid uuid;
  reg public.registrations%ROWTYPE;
  variant_row record;
  category_limit integer;
  modality_limit integer;
  used_count integer;
BEGIN
  IF TG_TABLE_NAME = 'registrations' THEN
    registration_uuid := NEW.id;
  ELSIF TG_TABLE_NAME = 'leader_invitations' THEN
    registration_uuid := NEW.bonus_registration_id;
  ELSE
    registration_uuid := NEW.registration_id;
  END IF;
  SELECT * INTO reg FROM public.registrations WHERE id = registration_uuid;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- Eventos diferentes não compartilham variante: variante -> produto -> kit -> evento.
  -- A trava entre COMMITs é seguida por novas consultas (READ COMMITTED).
  PERFORM pg_advisory_xact_lock(hashtextextended('registration-inventory:' || reg.event_id::text, 0));

  IF EXISTS (
    SELECT 1 FROM public.registration_product_selections s
    JOIN public.kit_products p ON p.id = s.product_id
    JOIN public.event_kits k ON k.id = p.kit_id
    LEFT JOIN public.product_variants v ON v.id = s.variant_id
    WHERE s.registration_id = reg.id
      AND (p.kit_id IS DISTINCT FROM reg.kit_id OR k.event_id <> reg.event_id
           OR (s.variant_id IS NOT NULL AND v.product_id IS DISTINCT FROM s.product_id))
  ) THEN
    RAISE EXCEPTION 'As escolhas de produto/variante não pertencem ao kit da inscrição.' USING ERRCODE = 'CT001';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.registration_product_selections
    WHERE registration_id = reg.id
    GROUP BY product_id HAVING COUNT(DISTINCT variant_id) > 1
  ) THEN
    RAISE EXCEPTION 'Um produto não pode ter duas variantes na mesma inscrição.' USING ERRCODE = 'CT001';
  END IF;

  IF reg.status NOT IN ('pending', 'confirmed', 'refund_requested', 'transferred')
     OR (reg.status = 'transferred' AND reg.transferred_to_registration_id IS NOT NULL)
  THEN RETURN NULL; END IF;

  FOR variant_row IN
    SELECT DISTINCT v.id, v.available_quantity
    FROM public.registration_product_selections s
    JOIN public.product_variants v ON v.id = s.variant_id
    WHERE s.registration_id = reg.id AND v.available_quantity IS NOT NULL
    ORDER BY v.id
  LOOP
    SELECT COUNT(DISTINCT r.id) INTO used_count
    FROM public.registration_product_selections s
    JOIN public.registrations r ON r.id = s.registration_id
    WHERE s.variant_id = variant_row.id
      AND (r.status IN ('pending', 'confirmed', 'refund_requested')
        OR (r.status = 'transferred' AND r.transferred_to_registration_id IS NULL));
    IF used_count > variant_row.available_quantity THEN
      RAISE EXCEPTION 'Estoque desta variante esgotado. Escolha outra opção.' USING ERRCODE = 'CT001';
    END IF;
  END LOOP;

  -- Apenas slots ainda não atribuídos podem repetir o titular (líder).
  IF reg.payment_method = 'free_bonus' AND NOT EXISTS (
    SELECT 1 FROM public.leader_invitations li WHERE li.bonus_registration_id = reg.id
      AND li.runner_id = reg.runner_id AND li.status IN ('sent', 'used')
  ) THEN RETURN NULL; END IF;
  IF EXISTS (
    SELECT 1 FROM public.registrations r
    WHERE r.id <> reg.id AND r.event_id = reg.event_id AND r.runner_id = reg.runner_id
      AND (COALESCE(r.payment_method::text, '') <> 'free_bonus' OR EXISTS (
        SELECT 1 FROM public.leader_invitations li WHERE li.bonus_registration_id = r.id
          AND li.runner_id = r.runner_id AND li.status IN ('sent', 'used')
      ))
      AND r.status <> 'cancelled'
      AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'Este corredor já possui uma inscrição ativa neste evento.' USING ERRCODE = 'CT001';
  END IF;

  -- Bônus não usa a cota paga, mesmo após atribuído ao corredor.
  IF reg.payment_method = 'free_bonus' THEN RETURN NULL; END IF;
  SELECT max_participants INTO category_limit FROM public.categories WHERE id = reg.category_id;
  IF category_limit > 0 THEN
    SELECT COUNT(*) INTO used_count FROM public.registrations r
    WHERE r.category_id = reg.category_id AND COALESCE(r.payment_method::text, '') <> 'free_bonus'
      AND (r.status IN ('pending','confirmed','refund_requested')
        OR (r.status = 'transferred' AND r.transferred_to_registration_id IS NULL));
    IF used_count > category_limit THEN RAISE EXCEPTION 'Categoria sem vagas disponíveis.' USING ERRCODE = 'CT001'; END IF;
  END IF;
  IF reg.modality_id IS NOT NULL THEN
    SELECT max_participants INTO modality_limit FROM public.modalities WHERE id = reg.modality_id;
    IF modality_limit > 0 THEN
      SELECT COUNT(*) INTO used_count FROM public.registrations r
      WHERE r.modality_id = reg.modality_id AND COALESCE(r.payment_method::text, '') <> 'free_bonus'
        AND (r.status IN ('pending','confirmed','refund_requested')
          OR (r.status = 'transferred' AND r.transferred_to_registration_id IS NULL));
      IF used_count > modality_limit THEN RAISE EXCEPTION 'Modalidade sem vagas disponíveis.' USING ERRCODE = 'CT001'; END IF;
    END IF;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS registration_inventory_guard ON public.registrations;
CREATE CONSTRAINT TRIGGER registration_inventory_guard
AFTER INSERT OR UPDATE ON public.registrations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.check_registration_inventory();

DROP TRIGGER IF EXISTS invitation_registration_inventory_guard ON public.leader_invitations;
CREATE CONSTRAINT TRIGGER invitation_registration_inventory_guard
AFTER INSERT OR UPDATE ON public.leader_invitations
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.check_registration_inventory();

DROP TRIGGER IF EXISTS registration_selection_inventory_guard ON public.registration_product_selections;
CREATE CONSTRAINT TRIGGER registration_selection_inventory_guard
AFTER INSERT OR UPDATE ON public.registration_product_selections
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW
EXECUTE FUNCTION public.check_registration_inventory();
