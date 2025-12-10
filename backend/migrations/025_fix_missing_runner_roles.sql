-- ============================================
-- Migration 025: Fix Missing Runner Roles
-- Corrige usuários que não possuem o role 'runner' mas deveriam ter
-- ============================================

-- Adicionar role 'runner' para todos os usuários que têm perfil mas não têm nenhum role
INSERT INTO user_roles (user_id, role)
SELECT p.id, 'runner'::app_role
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 
  FROM user_roles ur 
  WHERE ur.user_id = p.id
)
ON CONFLICT (user_id, role) DO NOTHING;

-- Log dos usuários corrigidos
DO $$
DECLARE
  fixed_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO fixed_count
  FROM profiles p
  WHERE NOT EXISTS (
    SELECT 1 
    FROM user_roles ur 
    WHERE ur.user_id = p.id
  );
  
  IF fixed_count > 0 THEN
    RAISE NOTICE '✅ % usuário(s) corrigido(s) - role runner adicionado', fixed_count;
  ELSE
    RAISE NOTICE '✅ Todos os usuários já possuem pelo menos um role';
  END IF;
END $$;

-- Verificar se há usuários sem roles após a correção
SELECT 
  COUNT(*) as usuarios_sem_roles
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 
  FROM user_roles ur 
  WHERE ur.user_id = p.id
);

