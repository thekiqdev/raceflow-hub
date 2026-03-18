-- ============================================
-- Migration 047: Add display_order to modalities
-- Adicionar campo display_order na tabela modalities para permitir ordenação customizada
-- ============================================

-- 1. Adicionar coluna display_order
ALTER TABLE public.modalities 
ADD COLUMN IF NOT EXISTS display_order INTEGER NULL;

-- 2. Inicializar display_order com base na ordem atual (name ASC)
-- Usar ROW_NUMBER() para gerar valores sequenciais por evento
UPDATE public.modalities m
SET display_order = sub.row_num
FROM (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY name ASC) as row_num
  FROM public.modalities
) sub
WHERE m.id = sub.id;

-- 3. Tornar a coluna NOT NULL após inicialização
ALTER TABLE public.modalities 
ALTER COLUMN display_order SET NOT NULL;

-- 4. Criar índice composto para melhor performance nas consultas ordenadas
CREATE INDEX IF NOT EXISTS idx_modalities_event_display_order 
ON public.modalities(event_id, display_order);

-- 5. Adicionar comentário
COMMENT ON COLUMN public.modalities.display_order IS 'Ordem de exibição da modalidade no evento. Valores menores aparecem primeiro.';


