-- Etapa 6: trilha de resoluções operacionais para comandos assistidos (ex.: marcar órfão como failed)

CREATE TABLE IF NOT EXISTS invitation_bonus_assisted_audit_resolution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_audit_id UUID NOT NULL REFERENCES invitation_bonus_assisted_command_audit(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('mark_stuck_as_failed')),
  performed_by_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  performed_by_email TEXT NOT NULL,
  reason TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_inv_bonus_assisted_resolution_original_created
  ON invitation_bonus_assisted_audit_resolution (original_audit_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_inv_bonus_assisted_resolution_performer_created
  ON invitation_bonus_assisted_audit_resolution (performed_by_user_id, created_at DESC);
