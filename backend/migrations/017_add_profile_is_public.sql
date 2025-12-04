-- ============================================
-- Migration 017: Add Profile is_public
-- Adiciona coluna is_public na tabela profiles
-- ============================================

-- Adicionar coluna is_public em profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE;

-- Criar índice para melhor performance em consultas por is_public
CREATE INDEX IF NOT EXISTS idx_profiles_is_public ON public.profiles(is_public) WHERE is_public = TRUE;

-- Comentário para documentação
COMMENT ON COLUMN public.profiles.is_public IS 'Indica se o perfil pode ser encontrado por outros usuários para inscrições (TRUE = público, FALSE = privado)';

