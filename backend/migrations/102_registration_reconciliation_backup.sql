-- ============================================
-- Migration 102: registration reconciliation backup
-- Append-only backup table for physical deletes executed by
-- invitation bonus reconciliation (Bloco B / free_bonus).
-- ============================================

CREATE TABLE IF NOT EXISTS public.registration_reconciliation_backup (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL,
  event_id UUID NOT NULL,
  original_registration JSONB NOT NULL,
  motivo_exclusao TEXT NOT NULL,
  audit_snapshot_hash TEXT NOT NULL,
  dry_run_hash TEXT NOT NULL,
  executed_by UUID NOT NULL REFERENCES public.users(id),
  executed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_registration_reconciliation_backup_event_id
  ON public.registration_reconciliation_backup(event_id);

CREATE INDEX IF NOT EXISTS idx_registration_reconciliation_backup_registration_id
  ON public.registration_reconciliation_backup(registration_id);

-- Append-only: no delete/update policies at DB level for safety.

