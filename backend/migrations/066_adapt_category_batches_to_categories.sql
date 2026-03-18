-- ============================================
-- Migration 066: Adapt category_batches to work with new categories table
-- Adapta category_batches para trabalhar com a nova tabela categories
-- ao invés de event_categories (sistema antigo)
-- ============================================

-- 1. Adicionar novas colunas (name e valid_to)
ALTER TABLE public.category_batches
ADD COLUMN IF NOT EXISTS name TEXT;

ALTER TABLE public.category_batches
ADD COLUMN IF NOT EXISTS valid_to TIMESTAMP WITH TIME ZONE;

-- 2. Verificar se há foreign key antiga e remover
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Verificar se existe constraint de foreign key antiga
    SELECT tc.constraint_name INTO constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
    WHERE tc.table_name = 'category_batches'
    AND tc.constraint_type = 'FOREIGN KEY'
    AND kcu.column_name = 'category_id'
    AND EXISTS (
        SELECT 1 
        FROM information_schema.constraint_column_usage ccu
        WHERE ccu.constraint_name = tc.constraint_name
        AND ccu.table_name = 'event_categories'
    )
    LIMIT 1;
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.category_batches DROP CONSTRAINT IF EXISTS %I', constraint_name);
        RAISE NOTICE '✅ Removida foreign key antiga: %', constraint_name;
    ELSE
        RAISE NOTICE 'ℹ️ Nenhuma foreign key antiga encontrada para remover';
    END IF;
END $$;

-- 3. Adicionar nova foreign key para categories (se categories existir)
DO $$
BEGIN
    -- Verificar se tabela categories existe
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'categories'
    ) THEN
        -- Verificar se já existe foreign key para categories
        IF NOT EXISTS (
            SELECT 1 
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage kcu 
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'category_batches'
            AND tc.constraint_type = 'FOREIGN KEY'
            AND kcu.column_name = 'category_id'
            AND EXISTS (
                SELECT 1 
                FROM information_schema.constraint_column_usage ccu
                WHERE ccu.constraint_name = tc.constraint_name
                AND ccu.table_name = 'categories'
            )
        ) THEN
            -- Adicionar nova foreign key
            ALTER TABLE public.category_batches
            ADD CONSTRAINT fk_category_batches_category_id 
            FOREIGN KEY (category_id) 
            REFERENCES public.categories(id) 
            ON DELETE CASCADE;
            
            RAISE NOTICE '✅ Adicionada nova foreign key para categories';
        ELSE
            RAISE NOTICE 'ℹ️ Foreign key para categories já existe';
        END IF;
    ELSE
        RAISE WARNING '⚠️ Tabela categories não existe. Foreign key não será adicionada.';
    END IF;
END $$;

-- 4. Adicionar constraint para validar que valid_to >= valid_from (quando ambos estão definidos)
ALTER TABLE public.category_batches
DROP CONSTRAINT IF EXISTS chk_valid_dates;

ALTER TABLE public.category_batches
ADD CONSTRAINT chk_valid_dates 
CHECK (
    valid_from IS NULL OR 
    valid_to IS NULL OR 
    valid_to >= valid_from
);

-- 5. Adicionar índice para valid_to (se não existir)
CREATE INDEX IF NOT EXISTS idx_category_batches_valid_to 
ON public.category_batches(valid_to) 
WHERE valid_to IS NOT NULL;

-- 6. Adicionar índice composto para queries de lotes ativos
CREATE INDEX IF NOT EXISTS idx_category_batches_active 
ON public.category_batches(category_id, valid_from, valid_to) 
WHERE valid_from IS NOT NULL;

-- 7. Comentários para documentação
COMMENT ON COLUMN public.category_batches.category_id IS 
'ID da categoria (agora referencia categories.id ao invés de event_categories.id)';

COMMENT ON COLUMN public.category_batches.name IS 
'Nome do lote (opcional, ex: "1º Lote", "2º Lote", "Lote Promocional")';

COMMENT ON COLUMN public.category_batches.price IS 
'Preço do lote';

COMMENT ON COLUMN public.category_batches.valid_from IS 
'Data e hora de início do lote (NULL = sem data específica, válido desde sempre)';

COMMENT ON COLUMN public.category_batches.valid_to IS 
'Data e hora de término do lote (NULL = sem data de término, válido indefinidamente)';

COMMENT ON TABLE public.category_batches IS 
'Tabela de lotes de preço para categorias. Permite diferentes preços baseados em datas.';

-- 8. Log de migração
DO $$
DECLARE
    batches_count INTEGER;
    categories_count INTEGER;
    event_categories_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO batches_count FROM public.category_batches;
    SELECT COUNT(*) INTO categories_count FROM public.categories;
    SELECT COUNT(*) INTO event_categories_count FROM public.event_categories;
    
    RAISE NOTICE '✅ Migration 066 concluída:';
    RAISE NOTICE '   - Lotes existentes: %', batches_count;
    RAISE NOTICE '   - Categorias (nova estrutura): %', categories_count;
    RAISE NOTICE '   - Event Categories (estrutura antiga): %', event_categories_count;
    
    IF batches_count > 0 AND categories_count = 0 THEN
        RAISE WARNING '⚠️ Existem lotes mas nenhuma categoria na nova estrutura. Pode ser necessário migrar dados.';
    END IF;
END $$;
