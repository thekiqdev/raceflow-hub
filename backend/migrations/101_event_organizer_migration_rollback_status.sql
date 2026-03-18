-- ============================================
-- Migration 101: Event organizer migration — permitir status 'rollback' no log (Etapa 10)
-- ============================================

-- Só altera se a tabela existir (criada pela migração 100).
-- Incluir 'rollback' no status para registrar execuções de rollback pós-commit.
DO $$
DECLARE
  conname text;
  tbl_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'event_organizer_migration_log'
  ) INTO tbl_exists;

  IF NOT tbl_exists THEN
    RETURN;
  END IF;

  -- Remove constraint de status (nome pode variar)
  SELECT c.conname INTO conname
  FROM pg_constraint c
  JOIN pg_class t ON t.oid = c.conrelid
  WHERE t.relname = 'event_organizer_migration_log' AND c.contype = 'c'
    AND pg_get_constraintdef(c.oid) LIKE '%status%';
  IF conname IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.event_organizer_migration_log DROP CONSTRAINT %I', conname);
  END IF;

  ALTER TABLE public.event_organizer_migration_log
    ADD CONSTRAINT event_organizer_migration_log_status_check
    CHECK (status IN ('success', 'error', 'inconsistent', 'skipped', 'rollback'));

  COMMENT ON COLUMN public.event_organizer_migration_log.status IS 'success | error | inconsistent (validação pós-commit falhou) | skipped (idempotente) | rollback (reversão pós-commit)';
END $$;
