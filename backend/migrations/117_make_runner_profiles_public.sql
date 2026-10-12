-- Migration 117: Tornar públicos os perfis existentes com papel de corredor.
-- Inclui usuários com outros papéis que também possuam 'runner'.
-- Novos corredores recebem is_public = TRUE nos serviços de criação.
-- O default global de profiles permanece inalterado para outros tipos de perfil.
-- A migração é pontual: não impede uma alteração posterior de visibilidade.
-- IS DISTINCT FROM inclui FALSE e NULL, sem reescrever quem já é público.
UPDATE public.profiles AS p
SET is_public = TRUE,
    updated_at = NOW()
WHERE p.is_public IS DISTINCT FROM TRUE
  AND EXISTS (
    SELECT 1
    FROM public.user_roles AS ur
    WHERE ur.user_id = p.id
      AND ur.role = 'runner'
  );
