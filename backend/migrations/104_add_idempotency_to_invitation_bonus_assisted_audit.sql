-- Etapa 4B: idempotência operacional para comandos assistidos

ALTER TABLE invitation_bonus_assisted_command_audit
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE INDEX IF NOT EXISTS idx_inv_bonus_assisted_audit_idempotency
  ON invitation_bonus_assisted_command_audit (
    command_type,
    mode,
    event_id,
    leader_id,
    commission_id,
    idempotency_key,
    created_at DESC
  );

