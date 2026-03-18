-- ============================================
-- Migration 038: Update registrations category foreign key
-- Atualiza a foreign key de category_id na tabela registrations
-- para referenciar a nova tabela categories em vez de event_categories
-- ============================================

-- 1. Verificar se há registros com category_id inválido e removê-los ou atualizá-los
-- (Registros órfãos serão removidos, pois não há como migrá-los sem dados da tabela antiga)
DO $$
DECLARE
    orphan_count INTEGER;
BEGIN
    -- Contar registros com category_id que não existe na nova tabela categories
    SELECT COUNT(*) INTO orphan_count
    FROM registrations r
    WHERE r.category_id IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM categories c WHERE c.id = r.category_id
    );
    
    IF orphan_count > 0 THEN
        RAISE NOTICE 'Encontrados % registros com category_id inválido. Removendo...', orphan_count;
        
        -- Remover registros órfãos (sem categoria válida)
        DELETE FROM registrations
        WHERE category_id IS NOT NULL
        AND NOT EXISTS (
            SELECT 1 FROM categories c WHERE c.id = registrations.category_id
        );
        
        RAISE NOTICE 'Removidos % registros órfãos', orphan_count;
    ELSE
        RAISE NOTICE 'Nenhum registro órfão encontrado';
    END IF;
END $$;

-- 2. Remover todas as constraints de foreign key antigas relacionadas a category_id
DO $$
DECLARE
    constraint_name_var TEXT;
BEGIN
    -- Encontrar e remover todas as constraints de foreign key para category_id
    FOR constraint_name_var IN
        SELECT tc.constraint_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        WHERE tc.table_schema = 'public'
        AND tc.table_name = 'registrations'
        AND kcu.column_name = 'category_id'
        AND tc.constraint_type = 'FOREIGN KEY'
    LOOP
        EXECUTE 'ALTER TABLE public.registrations DROP CONSTRAINT IF EXISTS ' || constraint_name_var;
        RAISE NOTICE 'Removida constraint: %', constraint_name_var;
    END LOOP;
END $$;

-- 3. Adicionar nova constraint referenciando categories
DO $$
BEGIN
    -- Verificar se a constraint já existe
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
            ON ccu.constraint_name = tc.constraint_name
        WHERE tc.table_schema = 'public'
        AND tc.table_name = 'registrations'
        AND kcu.column_name = 'category_id'
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'categories'
    ) THEN
        ALTER TABLE public.registrations
        ADD CONSTRAINT registrations_category_id_fkey 
        FOREIGN KEY (category_id) 
        REFERENCES public.categories(id) 
        ON DELETE CASCADE;
        
        RAISE NOTICE 'Constraint adicionada: registrations_category_id_fkey';
    ELSE
        RAISE NOTICE 'Constraint já existe, pulando...';
    END IF;
END $$;

-- 4. Adicionar comentário
COMMENT ON COLUMN public.registrations.category_id IS 'ID da categoria (referencia tabela categories)';

