-- ============================================
-- Migration 082: Add registration edit fee to system_settings
-- Taxa de atualização cobrada ao editar inscrição (valor fixo em R$)
-- ============================================

ALTER TABLE public.system_settings
ADD COLUMN IF NOT EXISTS registration_edit_fee DECIMAL(10, 2) DEFAULT 0;

COMMENT ON COLUMN public.system_settings.registration_edit_fee IS 'Taxa fixa (R$) cobrada quando o admin edita uma inscrição e o valor é alterado. Configurável em Configurações > Taxas.';
