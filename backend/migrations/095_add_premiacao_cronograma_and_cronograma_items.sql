-- ============================================
-- Migration 095: Premiação, Cronograma e itens de cronograma (timeline)
-- Adiciona colunas premiação e cronograma em events; cria tabela cronograma_items
-- Plano: PLANO_EVENTO_ABAS_PREMIACAO_CRONOGRAMA.md – Etapa 1
-- ============================================

-- 1. Colunas premiação e cronograma em events (HTML TipTap, opcional)
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS premiacao TEXT NULL;

ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS cronograma TEXT NULL;

COMMENT ON COLUMN public.events.premiacao IS 'Conteúdo HTML (TipTap) com informações de premiação do evento. Opcional.';
COMMENT ON COLUMN public.events.cronograma IS 'Conteúdo HTML (TipTap) com texto livre de cronograma. Opcional. Complementar aos itens em cronograma_items.';

-- 2. Tabela cronograma_items (timeline por evento)
CREATE TABLE IF NOT EXISTS public.cronograma_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
    time VARCHAR(5) NOT NULL,
    title VARCHAR(120) NOT NULL,
    description TEXT NULL,
    display_order INTEGER NOT NULL,
    CONSTRAINT uq_cronograma_items_event_display_order UNIQUE (event_id, display_order)
);

COMMENT ON TABLE public.cronograma_items IS 'Itens de cronograma do evento (timeline: horário, título, descrição). Ordenados por display_order.';
COMMENT ON COLUMN public.cronograma_items.time IS 'Horário no formato HH:mm (ex.: 06:00, 07:30, 08:10).';
COMMENT ON COLUMN public.cronograma_items.title IS 'Título do item (ex.: Aquecimento, Largada 5km). Máx. 120 caracteres.';
COMMENT ON COLUMN public.cronograma_items.description IS 'Descrição opcional do item.';
COMMENT ON COLUMN public.cronograma_items.display_order IS 'Ordem de exibição no mesmo evento (1, 2, 3…). Único por event_id.';

-- 3. Índices: listagem ordenada e filtro por evento
CREATE INDEX IF NOT EXISTS idx_cronograma_items_event_display_order
ON public.cronograma_items(event_id, display_order);

CREATE INDEX IF NOT EXISTS idx_cronograma_items_event_id
ON public.cronograma_items(event_id);

-- Log
DO $$
DECLARE
  events_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO events_count FROM public.events;
  RAISE NOTICE '✅ Migration 095 concluída:';
  RAISE NOTICE '   - Colunas premiacao e cronograma adicionadas à tabela events (NULL para eventos existentes)';
  RAISE NOTICE '   - Tabela cronograma_items criada (UNIQUE event_id, display_order; índices event_id e event_id+display_order)';
  RAISE NOTICE '   - Total de eventos: %', events_count;
END $$;
