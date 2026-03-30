-- Etapa 5: rastreabilidade de coordenação distribuída (lock key persistido por execução assistida)

ALTER TABLE invitation_bonus_assisted_command_audit
  ADD COLUMN IF NOT EXISTS distributed_lock_key TEXT NULL;

CREATE INDEX IF NOT EXISTS idx_inv_bonus_assisted_audit_lock_key
  ON invitation_bonus_assisted_command_audit (distributed_lock_key)
  WHERE distributed_lock_key IS NOT NULL;
