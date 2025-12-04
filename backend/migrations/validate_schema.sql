-- Script de validação do schema do banco de dados
-- Execute este script para verificar se todas as estruturas foram criadas corretamente

-- Verificar tabelas
SELECT 
    'Tabelas criadas: ' || COUNT(*)::text as status
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE';

-- Verificar enums
SELECT 
    'Enums criados: ' || COUNT(*)::text as status
FROM pg_type 
WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') 
AND typtype = 'e';

-- Verificar funções
SELECT 
    'Funções criadas: ' || COUNT(*)::text as status
FROM information_schema.routines 
WHERE routine_schema = 'public' 
AND routine_type = 'FUNCTION';

-- Verificar triggers
SELECT 
    'Triggers criados: ' || COUNT(*)::text as status
FROM information_schema.triggers 
WHERE trigger_schema = 'public';

-- Listar todas as tabelas
SELECT 
    'Tabela: ' || table_name as tabela
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Verificar relacionamentos (foreign keys)
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name 
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;





