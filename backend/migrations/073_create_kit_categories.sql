-- ============================================
-- Migration 073: Create kit_categories table
-- Cria tabela de relacionamento many-to-many entre kits e categorias
-- Permite associar kits a categorias específicas
-- ============================================

-- Criar tabela kit_categories
CREATE TABLE IF NOT EXISTS public.kit_categories (
  kit_id UUID NOT NULL,
  category_id UUID NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (kit_id, category_id),
  CONSTRAINT fk_kit_categories_kit 
    FOREIGN KEY (kit_id) 
    REFERENCES public.event_kits(id) 
    ON DELETE CASCADE,
  CONSTRAINT fk_kit_categories_category 
    FOREIGN KEY (category_id) 
    REFERENCES public.categories(id) 
    ON DELETE CASCADE
);

-- Criar índices para melhorar performance das consultas
CREATE INDEX IF NOT EXISTS idx_kit_categories_kit_id 
  ON public.kit_categories(kit_id);

CREATE INDEX IF NOT EXISTS idx_kit_categories_category_id 
  ON public.kit_categories(category_id);

-- Comentários
COMMENT ON TABLE public.kit_categories IS 'Relacionamento many-to-many entre kits e categorias. Se um kit não tiver registros aqui, ele aparece em todas as categorias (compatibilidade retroativa)';
COMMENT ON COLUMN public.kit_categories.kit_id IS 'ID do kit (referencia event_kits.id)';
COMMENT ON COLUMN public.kit_categories.category_id IS 'ID da categoria (referencia categories.id)';
COMMENT ON COLUMN public.kit_categories.created_at IS 'Data de criação da associação';

-- Log migration completion
DO $$
DECLARE
  kits_count INTEGER;
  categories_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO kits_count FROM public.event_kits;
  SELECT COUNT(*) INTO categories_count FROM public.categories;
  
  RAISE NOTICE '✅ Migration 073 concluída:';
  RAISE NOTICE '   - Tabela kit_categories criada';
  RAISE NOTICE '   - Índices criados para otimização';
  RAISE NOTICE '   - Kits existentes: %', kits_count;
  RAISE NOTICE '   - Categorias existentes: %', categories_count;
  RAISE NOTICE '   - Kits sem associações aparecerão em todas as categorias (compatibilidade retroativa)';
END $$;
