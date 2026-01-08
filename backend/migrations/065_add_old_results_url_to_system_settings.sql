-- ============================================
-- Migration 065: Add old_results_url to system_settings
-- Adiciona campo para URL do site antigo de resultados
-- ============================================

ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS old_results_url TEXT;

COMMENT ON COLUMN system_settings.old_results_url IS 
'URL do site antigo para visualização de resultados. Exibido na página inicial após a seção "Nossos Números".';
