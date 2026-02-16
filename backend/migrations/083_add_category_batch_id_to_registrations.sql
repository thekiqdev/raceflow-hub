-- ============================================
-- Migration 083: Add category_batch_id to registrations
-- Lote escolhido na inscrição (para auditoria e recálculo de preço na edição)
-- ============================================

ALTER TABLE public.registrations
ADD COLUMN IF NOT EXISTS category_batch_id UUID NULL;

-- FK opcional: o lote deve pertencer à categoria da inscrição (pode ser validado na aplicação)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'registrations'
    AND constraint_name = 'registrations_category_batch_id_fkey'
  ) THEN
    ALTER TABLE public.registrations
    ADD CONSTRAINT registrations_category_batch_id_fkey
    FOREIGN KEY (category_batch_id) REFERENCES public.category_batches(id) ON DELETE SET NULL;
    RAISE NOTICE 'FK registrations_category_batch_id_fkey criada';
  END IF;
END $$;

COMMENT ON COLUMN public.registrations.category_batch_id IS 'Lote da categoria escolhido na inscrição (para auditoria e recálculo de valor na edição pelo admin).';
