-- ============================================
-- Migration 101: Event organizer migration — permitir status 'rollback' no log (Etapa 10)
-- ============================================

-- Incluir 'rollback' no status para registrar execuções de rollback pós-commit.
-- Nome da constraint pode variar (ex.: event_organizer_migration_log_status_check); remove qualquer check em status.
DO $$
DECLARE
  conname text;
BEGIN
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'event_organizer_migration_log' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.event_organizer_migration_log DROP CONSTRAINT %I', conname);
  END IF;
END $$;

ALTER TABLE public.event_organizer_migration_log
  ADD CONSTRAINT event_organizer_migration_log_status_check
  CHECK (status IN ('success', 'error', 'inconsistent', 'skipped', 'rollback'));

COMMENT ON COLUMN public.event_organizer_migration_log.status IS 'success | error | inconsistent (validação pós-commit falhou) | skipped (idempotente) | rollback (reversão pós-commit)';
