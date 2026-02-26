-- ============================================
-- Migration 081: Add modality_id to registrations
-- Permite armazenar a modalidade escolhida na inscrição (uma por categoria).
-- ============================================

-- 1. Adicionar coluna modality_id (nullable para compatibilidade com inscrições existentes)
ALTER TABLE public.registrations
ADD COLUMN IF NOT EXISTS modality_id UUID NULL;

-- 2. Foreign key para modalities (a modalidade deve ser do mesmo evento da inscrição - validado na aplicação)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'registrations_modality_id_fkey'
    AND table_schema = 'public'
    AND table_name = 'registrations'
  ) THEN
    ALTER TABLE public.registrations
    ADD CONSTRAINT registrations_modality_id_fkey
    FOREIGN KEY (modality_id) REFERENCES public.modalities(id) ON DELETE SET NULL;
    RAISE NOTICE 'Constraint registrations_modality_id_fkey adicionada';
  END IF;
END $$;

-- 3. Índice para consultas por modalidade
CREATE INDEX IF NOT EXISTS idx_registrations_modality_id ON public.registrations(modality_id);

-- 4. Comentário
COMMENT ON COLUMN public.registrations.modality_id IS 'Modalidade escolhida na inscrição (deve pertencer ao evento e estar associada à categoria da inscrição)';
