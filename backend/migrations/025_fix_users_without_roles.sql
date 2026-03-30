-- ============================================
-- Migration 025: Fix users without roles
-- Garante que todos os usuários tenham pelo menos o role 'runner'
-- ============================================

-- Encontrar usuários sem roles
SELECT 
    u.id,
    u.email,
    p.full_name,
    COUNT(ur.role) as role_count
FROM users u
LEFT JOIN profiles p ON p.id = u.id
LEFT JOIN user_roles ur ON ur.user_id = u.id
GROUP BY u.id, u.email, p.full_name
HAVING COUNT(ur.role) = 0;

-- Adicionar role 'runner' para usuários que não têm nenhum role
INSERT INTO user_roles (user_id, role)
SELECT 
    u.id,
    'runner'::app_role
FROM users u
WHERE NOT EXISTS (
    SELECT 1 
    FROM user_roles ur 
    WHERE ur.user_id = u.id
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Verificar resultado
SELECT 
    u.id,
    u.email,
    p.full_name,
    array_agg(ur.role) as roles
FROM users u
LEFT JOIN profiles p ON p.id = u.id
LEFT JOIN user_roles ur ON ur.user_id = u.id
GROUP BY u.id, u.email, p.full_name
ORDER BY u.created_at DESC
LIMIT 10;

