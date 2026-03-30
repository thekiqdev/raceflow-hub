-- ============================================
-- Migration 049: Add display_order to event_kits
-- Adicionar campo display_order na tabela event_kits para permitir ordenação customizada
-- ============================================

-- 1. Adicionar coluna display_order
ALTER TABLE public.event_kits 
ADD COLUMN IF NOT EXISTS display_order INTEGER NULL;

-- 2. Inicializar display_order com base na ordem atual (price ASC, name ASC)
UPDATE public.event_kits ek
SET display_order = sub.row_num
FROM (
  SELECT 
    id,
    ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY price ASC, name ASC) as row_num
  FROM public.event_kits
) sub
WHERE ek.id = sub.id;

-- 3. Tornar a coluna NOT NULL após inicialização
ALTER TABLE public.event_kits 
ALTER COLUMN display_order SET NOT NULL;

-- 4. Criar índice composto
CREATE INDEX IF NOT EXISTS idx_event_kits_event_display_order 
ON public.event_kits(event_id, display_order);

-- 5. Adicionar comentário
COMMENT ON COLUMN public.event_kits.display_order IS 'Ordem de exibição do kit no evento. Valores menores aparecem primeiro.';


