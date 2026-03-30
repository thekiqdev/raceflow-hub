-- ============================================
-- Migration 055: Add additional_fields to quotes
-- Adiciona o campo additional_fields na tabela quotes para armazenar campos dinâmicos do formulário
-- ============================================

ALTER TABLE quotes
ADD COLUMN IF NOT EXISTS additional_fields JSONB DEFAULT '{}'::jsonb;

-- Criar índice GIN para busca eficiente em campos JSONB
CREATE INDEX IF NOT EXISTS idx_quotes_additional_fields ON quotes USING GIN (additional_fields);

-- Comentário
COMMENT ON COLUMN quotes.additional_fields IS 'Campos adicionais dinâmicos do formulário de orçamento em formato JSON';
