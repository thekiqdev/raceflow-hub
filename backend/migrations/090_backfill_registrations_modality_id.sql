-- ============================================
-- Migration 090: Backfill modality_id em inscrições existentes
-- Inscrições criadas antes da coluna modality_id ficaram com NULL.
-- Define modality_id = primeira modalidade da categoria (para exibição e estatísticas).
-- ============================================

UPDATE public.registrations r
SET modality_id = (
  SELECT cm.modality_id
  FROM public.category_modalities cm
  WHERE cm.category_id = r.category_id
  ORDER BY cm.modality_id
  LIMIT 1
)
WHERE r.modality_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.category_modalities cm2
    WHERE cm2.category_id = r.category_id
  );
