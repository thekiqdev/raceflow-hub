-- Migration 111: Data limite para transferências públicas (corredor)
-- Nullable: eventos antigos ou sem limite mantêm comportamento atual.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS transfer_until DATE NULL;

COMMENT ON COLUMN public.events.transfer_until IS
  'Último dia (America/Sao_Paulo) em que o corredor pode solicitar transferência. NULL = sem limite de data. Administradores podem ignorar no fluxo administrativo.';
