-- ============================================
-- Migration 107 — Fase 1 (plano auth CPF Brasil v2)
-- Metadados aditivos para origem/timestamp da validação de CPF.
-- Compatível com produção: colunas NULL para linhas existentes; sem alteração de comportamento da aplicação.
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf_validated_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS cpf_lookup_source TEXT NULL;

COMMENT ON COLUMN public.profiles.cpf_validated_at IS
  'Momento em que o CPF foi validado via fonte externa (ex.: API CPF Brasil). NULL = legado ou ainda não validado pela integração.';

COMMENT ON COLUMN public.profiles.cpf_lookup_source IS
  'Origem da validação do CPF (ex.: cpf_brasil_api). NULL = legado ou cadastro anterior à integração.';
