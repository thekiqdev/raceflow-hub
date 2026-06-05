-- ============================================
-- Migration 114: Kit visibility flag (ocultação segura)
-- is_visible=false oculta o kit em fluxos públicos sem excluir dados históricos.
-- NÃO substitui deleted_at (soft delete por inscrições vinculadas).
-- ============================================

ALTER TABLE public.event_kits
ADD COLUMN IF NOT EXISTS is_visible BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_event_kits_event_visible_order
  ON public.event_kits (event_id, display_order)
  WHERE is_visible = TRUE;

COMMENT ON COLUMN public.event_kits.is_visible IS
  'Quando FALSE, o kit fica oculto na página pública e no fluxo de inscrição, mas permanece em relatórios, financeiro e histórico.';

DO $$
BEGIN
  RAISE NOTICE '✅ Migration 114: event_kits.is_visible adicionada (default TRUE)';
END $$;
