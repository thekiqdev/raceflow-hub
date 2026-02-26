-- ============================================
-- Migration 054: Add field_width to form_configurations
-- Adiciona campo para definir a largura do campo no formulário (100%, 50%, 33%)
-- ============================================

ALTER TABLE form_configurations
ADD COLUMN IF NOT EXISTS field_width TEXT DEFAULT '100%' CHECK (field_width IN ('100%', '50%', '33%'));

-- Comentário
COMMENT ON COLUMN form_configurations.field_width IS 'Largura do campo no formulário: 100% (linha completa), 50% (metade), 33% (um terço)';

