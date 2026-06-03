-- Migration 113: Protect event kits used by registrations from destructive delete
-- Adds soft-delete support to event_kits and prevents registrations.kit_id from cascading.

ALTER TABLE public.event_kits
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL;

CREATE INDEX IF NOT EXISTS idx_event_kits_event_active_order
  ON public.event_kits(event_id, display_order)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.event_kits.deleted_at IS
  'Soft delete timestamp. Used kits must be archived instead of physically deleted to preserve registration history.';

DO $$
DECLARE
  fk_name TEXT;
BEGIN
  SELECT tc.constraint_name
    INTO fk_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
     AND tc.constraint_schema = kcu.constraint_schema
   WHERE tc.table_schema = 'public'
     AND tc.table_name = 'registrations'
     AND tc.constraint_type = 'FOREIGN KEY'
     AND kcu.column_name = 'kit_id'
   LIMIT 1;

  IF fk_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.registrations DROP CONSTRAINT %I', fk_name);
  END IF;

  ALTER TABLE public.registrations
    ADD CONSTRAINT registrations_kit_id_fkey
    FOREIGN KEY (kit_id)
    REFERENCES public.event_kits(id)
    ON DELETE RESTRICT;
END $$;
