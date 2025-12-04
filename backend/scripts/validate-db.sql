-- Script de validação do banco de dados
-- Verifica se todas as tabelas, funções e triggers estão criados corretamente

-- Verificar tabelas principais
SELECT 
    'Tabelas principais' as tipo,
    COUNT(*) as quantidade
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('users', 'profiles', 'events', 'registrations', 'user_roles', 'event_categories', 'event_kits', 'home_page_settings');

-- Verificar se tabela users existe e tem colunas corretas
SELECT 
    'Colunas da tabela users' as tipo,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'users' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verificar se tabela profiles existe
SELECT 
    'Colunas da tabela profiles' as tipo,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verificar se tabela events existe
SELECT 
    'Colunas da tabela events' as tipo,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'events' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verificar se tabela registrations existe
SELECT 
    'Colunas da tabela registrations' as tipo,
    column_name,
    data_type
FROM information_schema.columns 
WHERE table_name = 'registrations' 
AND table_schema = 'public'
ORDER BY ordinal_position;

-- Verificar funções
SELECT 
    'Funções' as tipo,
    routine_name,
    routine_type
FROM information_schema.routines 
WHERE routine_schema = 'public'
AND routine_name IN ('has_role', 'update_updated_at_column', 'handle_new_user')
ORDER BY routine_name;

-- Verificar triggers
SELECT 
    'Triggers' as tipo,
    trigger_name,
    event_object_table,
    action_timing,
    event_manipulation
FROM information_schema.triggers 
WHERE trigger_schema = 'public'
ORDER BY event_object_table, trigger_name;

-- Verificar índices
SELECT 
    'Índices' as tipo,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE schemaname = 'public'
AND tablename IN ('users', 'profiles', 'events', 'registrations', 'user_roles')
ORDER BY tablename, indexname;

-- Verificar constraints
SELECT 
    'Constraints' as tipo,
    table_name,
    constraint_name,
    constraint_type
FROM information_schema.table_constraints 
WHERE table_schema = 'public'
AND table_name IN ('users', 'profiles', 'events', 'registrations', 'user_roles')
ORDER BY table_name, constraint_type;

-- Contar registros em cada tabela
SELECT 'users' as tabela, COUNT(*) as registros FROM users
UNION ALL
SELECT 'profiles', COUNT(*) FROM profiles
UNION ALL
SELECT 'events', COUNT(*) FROM events
UNION ALL
SELECT 'registrations', COUNT(*) FROM registrations
UNION ALL
SELECT 'user_roles', COUNT(*) FROM user_roles
UNION ALL
SELECT 'event_categories', COUNT(*) FROM event_categories
UNION ALL
SELECT 'event_kits', COUNT(*) FROM event_kits
UNION ALL
SELECT 'home_page_settings', COUNT(*) FROM home_page_settings;





