-- Sprint 5: eventos de auditoria CPF (sem PII — apenas hash SHA-256).

CREATE TABLE IF NOT EXISTS cpf_lookup_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cpf_hash CHAR(64) NOT NULL,
  source VARCHAR(64) NOT NULL DEFAULT 'lookup-cpf',
  result_code VARCHAR(64) NOT NULL,
  provider VARCHAR(64),
  request_id UUID,
  metadata JSONB
);

CREATE INDEX IF NOT EXISTS idx_cpf_lookup_metrics_created_at ON cpf_lookup_metrics (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_cpf_lookup_metrics_result_code ON cpf_lookup_metrics (result_code);

COMMENT ON TABLE cpf_lookup_metrics IS 'Auditoria operacional de consultas CPF; cpf_hash = SHA-256(dígitos), nunca CPF em claro.';
COMMENT ON COLUMN cpf_lookup_metrics.cpf_hash IS 'SHA-256 dos 11 dígitos do CPF; sem armazenar PII.';
