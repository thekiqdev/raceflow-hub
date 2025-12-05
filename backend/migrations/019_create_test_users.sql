-- ============================================
-- Migration 019: Create Test Users
-- Cria usuários de teste para desenvolvimento e testes
-- ============================================
-- 
-- Este script cria 3 usuários de teste:
-- 1. Admin: admin@test.com / admin123
-- 2. Organizador: organizador@test.com / organizador123
-- 3. Corredor: runner@test.com / runner123
--
-- IMPORTANTE: 
-- - As senhas são hasheadas com bcrypt (10 rounds)
-- - Os usuários são criados com email_verified = true
-- - Os perfis são criados automaticamente
-- - As roles são atribuídas corretamente
--
-- Uso:
--   psql -U postgres -d cronoteam -f 019_create_test_users.sql
-- ============================================

-- ============================================
-- NOTA: Os hashes de senha foram gerados com bcrypt (10 rounds)
-- Gerados via: node scripts/generate-password-hashes.js
-- ============================================

-- ============================================
-- 1. ADMIN - admin@test.com / admin123
-- ============================================
DO $$
DECLARE
    admin_user_id UUID;
    admin_password_hash TEXT := '$2b$10$rQZ8vJ8vJ8vJ8vJ8vJ8vJ.8vJ8vJ8vJ8vJ8vJ8vJ8vJ8vJ8vJ8vJ'; -- admin123
BEGIN
    -- Verificar se o usuário já existe
    SELECT id INTO admin_user_id FROM users WHERE email = 'admin@test.com';
    
    IF admin_user_id IS NULL THEN
        -- Criar usuário
        INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'admin@test.com',
            '$2b$10$oX7jDDGytVqgdlyMefmE8.FMQrt8oX7JjGcG8wA2hsKd6FheHC7YG', -- admin123 (bcrypt hash)
            true,
            NOW(),
            NOW()
        )
        RETURNING id INTO admin_user_id;
        
        -- Criar perfil
        INSERT INTO profiles (id, full_name, cpf, phone, gender, birth_date, lgpd_consent, created_at, updated_at)
        VALUES (
            admin_user_id,
            'Administrador Teste',
            '00000000001',
            '11999999999',
            NULL,
            '1990-01-01',
            true,
            NOW(),
            NOW()
        );
        
        -- Remover role padrão (runner) se existir
        DELETE FROM user_roles WHERE user_id = admin_user_id;
        
        -- Adicionar role admin
        INSERT INTO user_roles (user_id, role, created_at)
        VALUES (admin_user_id, 'admin', NOW())
        ON CONFLICT (user_id, role) DO NOTHING;
        
        RAISE NOTICE '✅ Usuário admin criado: admin@test.com (ID: %)', admin_user_id;
    ELSE
        -- Atualizar role se usuário já existe
        DELETE FROM user_roles WHERE user_id = admin_user_id;
        INSERT INTO user_roles (user_id, role, created_at)
        VALUES (admin_user_id, 'admin', NOW())
        ON CONFLICT (user_id, role) DO NOTHING;
        
        RAISE NOTICE '⚠️  Usuário admin já existe. Role atualizada.';
    END IF;
END $$;

-- ============================================
-- 2. ORGANIZADOR - organizador@test.com / organizador123
-- ============================================
DO $$
DECLARE
    org_user_id UUID;
BEGIN
    -- Verificar se o usuário já existe
    SELECT id INTO org_user_id FROM users WHERE email = 'organizador@test.com';
    
    IF org_user_id IS NULL THEN
        -- Criar usuário
        INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'organizador@test.com',
            '$2b$10$7hz/eNBsydJV7FPDkExsCOdTFTkbv6oOTrinfRLyUIqoNlhjd/fBq', -- organizador123 (bcrypt hash)
            true,
            NOW(),
            NOW()
        )
        RETURNING id INTO org_user_id;
        
        -- Criar perfil
        INSERT INTO profiles (id, full_name, cpf, phone, gender, birth_date, lgpd_consent, created_at, updated_at)
        VALUES (
            org_user_id,
            'Organizador Teste',
            '00000000002',
            '11999999998',
            NULL,
            '1990-01-02',
            true,
            NOW(),
            NOW()
        );
        
        -- Remover role padrão (runner) se existir
        DELETE FROM user_roles WHERE user_id = org_user_id;
        
        -- Adicionar role organizer
        INSERT INTO user_roles (user_id, role, created_at)
        VALUES (org_user_id, 'organizer', NOW())
        ON CONFLICT (user_id, role) DO NOTHING;
        
        RAISE NOTICE '✅ Usuário organizador criado: organizador@test.com (ID: %)', org_user_id;
    ELSE
        -- Atualizar role se usuário já existe
        DELETE FROM user_roles WHERE user_id = org_user_id;
        INSERT INTO user_roles (user_id, role, created_at)
        VALUES (org_user_id, 'organizer', NOW())
        ON CONFLICT (user_id, role) DO NOTHING;
        
        RAISE NOTICE '⚠️  Usuário organizador já existe. Role atualizada.';
    END IF;
END $$;

-- ============================================
-- 3. CORREDOR - runner@test.com / runner123
-- ============================================
DO $$
DECLARE
    runner_user_id UUID;
BEGIN
    -- Verificar se o usuário já existe
    SELECT id INTO runner_user_id FROM users WHERE email = 'runner@test.com';
    
    IF runner_user_id IS NULL THEN
        -- Criar usuário
        INSERT INTO users (id, email, password_hash, email_verified, created_at, updated_at)
        VALUES (
            gen_random_uuid(),
            'runner@test.com',
            '$2b$10$2/0NuS97ikZ3Kyb3OdbPWOEWP2R1rYA6CeQfyGnGt8nCzOq8LlxUK', -- runner123 (bcrypt hash)
            true,
            NOW(),
            NOW()
        )
        RETURNING id INTO runner_user_id;
        
        -- Criar perfil
        INSERT INTO profiles (id, full_name, cpf, phone, gender, birth_date, lgpd_consent, created_at, updated_at)
        VALUES (
            runner_user_id,
            'Corredor Teste',
            '00000000003',
            '11999999997',
            NULL,
            '1990-01-03',
            true,
            NOW(),
            NOW()
        );
        
        -- Remover role padrão (runner) se existir
        DELETE FROM user_roles WHERE user_id = runner_user_id;
        
        -- Adicionar role runner
        INSERT INTO user_roles (user_id, role, created_at)
        VALUES (runner_user_id, 'runner', NOW())
        ON CONFLICT (user_id, role) DO NOTHING;
        
        RAISE NOTICE '✅ Usuário corredor criado: runner@test.com (ID: %)', runner_user_id;
    ELSE
        -- Atualizar role se usuário já existe
        DELETE FROM user_roles WHERE user_id = runner_user_id;
        INSERT INTO user_roles (user_id, role, created_at)
        VALUES (runner_user_id, 'runner', NOW())
        ON CONFLICT (user_id, role) DO NOTHING;
        
        RAISE NOTICE '⚠️  Usuário corredor já existe. Role atualizada.';
    END IF;
END $$;

-- ============================================
-- Resumo dos Usuários Criados
-- ============================================
SELECT 
    u.email,
    p.full_name,
    p.cpf,
    ur.role,
    u.email_verified,
    u.created_at
FROM users u
JOIN profiles p ON u.id = p.id
LEFT JOIN user_roles ur ON u.id = ur.user_id
WHERE u.email IN ('admin@test.com', 'organizador@test.com', 'runner@test.com')
ORDER BY u.email;

-- ============================================
-- Fim do Script
-- ============================================
-- 
-- Usuários criados:
-- 
-- 👤 ADMIN:
--    Email: admin@test.com
--    Senha: admin123
--    Role: admin
-- 
-- 👤 ORGANIZADOR:
--    Email: organizador@test.com
--    Senha: organizador123
--    Role: organizer
-- 
-- 👤 CORREDOR:
--    Email: runner@test.com
--    Senha: runner123
--    Role: runner
-- 
-- ⚠️ IMPORTANTE: 
-- - Altere essas senhas em produção!
-- - Os hashes de senha acima são placeholders
-- - Use o script Node.js (create-test-users.ts) para gerar hashes corretos
-- ============================================

