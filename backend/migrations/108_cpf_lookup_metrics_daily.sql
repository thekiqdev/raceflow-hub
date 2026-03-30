-- Fase 6: agregação diária de sucesso/falha em POST /auth/lookup-cpf (monitoramento).

CREATE TABLE IF NOT EXISTS cpf_lookup_metrics_daily (
  day DATE NOT NULL PRIMARY KEY,
  success_count BIGINT NOT NULL DEFAULT 0,
  failure_count BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cpf_lookup_metrics_daily_day_desc ON cpf_lookup_metrics_daily (day DESC);

COMMENT ON TABLE cpf_lookup_metrics_daily IS 'Contadores diários de consultas CPF (cadastro); uso em dashboard admin.';
