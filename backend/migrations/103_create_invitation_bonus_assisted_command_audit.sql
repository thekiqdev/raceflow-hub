-- Etapa 4A: governança operacional de comandos assistidos do domínio de convites
-- Persistência de auditoria para comandos assistidos (reconcile_state / deliver_missing_assisted)

CREATE TABLE IF NOT EXISTS invitation_bonus_assisted_command_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  command_type TEXT NOT NULL,
  mode TEXT NOT NULL,
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  actor_email TEXT NOT NULL,
  reason TEXT NOT NULL,
  source TEXT NOT NULL,
  correlation_id TEXT NULL,
  leader_id UUID NULL REFERENCES group_leaders(id) ON DELETE SET NULL,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  commission_id UUID NULL REFERENCES leader_event_commissions(id) ON DELETE SET NULL,
  status TEXT NOT NULL CHECK (status IN ('started', 'succeeded', 'failed')),
  detail TEXT NULL,
  result JSONB NULL,
  finished_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_bonus_assisted_audit_event_created
  ON invitation_bonus_assisted_command_audit (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_bonus_assisted_audit_actor_created
  ON invitation_bonus_assisted_command_audit (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_bonus_assisted_audit_status_created
  ON invitation_bonus_assisted_command_audit (status, created_at DESC);

