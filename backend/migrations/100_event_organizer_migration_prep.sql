-- ============================================
-- Migration 100: Event organizer migration — preparação de banco (Etapa 1)
-- Suporte a migração de organizador de evento: log, auditoria de convites, índices
-- Ref: PLANO_ALTERACAO_ORGANIZADOR_EVENTO.md, IMPLEMENTACAO_SEGURA_MIGRACAO_ORGANIZADOR.md
-- ============================================

-- ---------------------------------------------------------------------------
-- 1. Tabela de log de migração (event_organizer_migration_log)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_organizer_migration_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    organizer_from UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    organizer_to UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    total_cupons_exclusivos INT NOT NULL DEFAULT 0,
    total_cupons_compartilhados INT NOT NULL DEFAULT 0,
    total_lideres_criados INT NOT NULL DEFAULT 0,
    total_lideres_reutilizados INT NOT NULL DEFAULT 0,
    total_invitations_updated INT NOT NULL DEFAULT 0,
    conflitos_codigo_resolvidos INT NOT NULL DEFAULT 0,
    dry_run BOOLEAN NOT NULL DEFAULT false,
    status VARCHAR(20) NOT NULL CHECK (status IN ('success', 'error', 'inconsistent', 'skipped')),
    validation_errors TEXT NULL,
    executed_at TIMESTAMPTZ NULL,
    executor_id UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_log_event ON public.event_organizer_migration_log(event_id);
CREATE INDEX IF NOT EXISTS idx_migration_log_executed ON public.event_organizer_migration_log(executed_at);
CREATE INDEX IF NOT EXISTS idx_migration_log_status ON public.event_organizer_migration_log(status);

COMMENT ON TABLE public.event_organizer_migration_log IS 'Log de execuções de migração de organizador de evento (alteração de events.organizer_id)';
COMMENT ON COLUMN public.event_organizer_migration_log.status IS 'success | error | inconsistent (validação pós-commit falhou) | skipped (idempotente)';

-- ---------------------------------------------------------------------------
-- 2. Campos de auditoria em leader_invitations (rastreabilidade e idempotência)
-- ---------------------------------------------------------------------------
ALTER TABLE public.leader_invitations
    ADD COLUMN IF NOT EXISTS migrated_from_leader_id UUID NULL,
    ADD COLUMN IF NOT EXISTS migrated_at TIMESTAMPTZ NULL,
    ADD COLUMN IF NOT EXISTS migration_id UUID NULL;

COMMENT ON COLUMN public.leader_invitations.migrated_from_leader_id IS 'Leader_id anterior antes da reassociação na migração de organizador (auditoria)';
COMMENT ON COLUMN public.leader_invitations.migrated_at IS 'Data/hora da reassociação na migração de organizador';
COMMENT ON COLUMN public.leader_invitations.migration_id IS 'ID da execução de migração (event_organizer_migration_log.id); usado para idempotência (WHERE migration_id IS NULL) e rollback';

-- ---------------------------------------------------------------------------
-- 3. Unicidade de convites (evitar duplicidade pós-migração / reprocessamento)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_leader_invitation_unique
    ON public.leader_invitations (event_id, leader_id, status)
    WHERE status IN ('available', 'sent');

-- ---------------------------------------------------------------------------
-- 4. Índices de performance (se ainda não existirem)
-- ---------------------------------------------------------------------------
-- coupon_events.event_id e coupons já possuem índices em 033 e 031; criar apenas se não existir
CREATE INDEX IF NOT EXISTS idx_coupon_events_event_id ON public.coupon_events(event_id);
CREATE INDEX IF NOT EXISTS idx_coupons_organizer_id ON public.coupons(organizer_id);
CREATE INDEX IF NOT EXISTS idx_coupons_code ON public.coupons(code);

-- ---------------------------------------------------------------------------
-- 5. (Opcional) Tabela de snapshot pré-migração — rollback real e auditoria
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.event_organizer_migration_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    migration_id UUID NOT NULL,
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    organizer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    payload_json JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_migration_snapshot_migration_id ON public.event_organizer_migration_snapshot(migration_id);
CREATE INDEX IF NOT EXISTS idx_migration_snapshot_event_id ON public.event_organizer_migration_snapshot(event_id);

COMMENT ON TABLE public.event_organizer_migration_snapshot IS 'Snapshot do estado antes da migração de organizador (opcional; para rollback real e auditoria)';
