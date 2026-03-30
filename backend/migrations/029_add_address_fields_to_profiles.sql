-- ============================================
-- Migration 029: Add address fields and preferred_name to profiles
-- Adiciona campos de endereço e nome preferido à tabela profiles
-- ============================================

-- Adicionar campo de nome preferido/apelido
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS preferred_name VARCHAR(100) NULL;

-- Adicionar campos de endereço
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS postal_code VARCHAR(10) NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS street VARCHAR(255) NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS address_number VARCHAR(20) NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS address_complement VARCHAR(100) NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS neighborhood VARCHAR(100) NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS city VARCHAR(100) NULL;

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS state VARCHAR(2) NULL;

-- Adicionar comentários para documentação
COMMENT ON COLUMN public.profiles.preferred_name IS 'Nome preferido ou apelido do usuário';
COMMENT ON COLUMN public.profiles.postal_code IS 'CEP do endereço (formato: 00000-000)';
COMMENT ON COLUMN public.profiles.street IS 'Logradouro do endereço';
COMMENT ON COLUMN public.profiles.address_number IS 'Número do endereço';
COMMENT ON COLUMN public.profiles.address_complement IS 'Complemento do endereço (apto, bloco, etc)';
COMMENT ON COLUMN public.profiles.neighborhood IS 'Bairro do endereço';
COMMENT ON COLUMN public.profiles.city IS 'Cidade do endereço';
COMMENT ON COLUMN public.profiles.state IS 'Estado (UF) do endereço (2 caracteres)';

-- ============================================
-- Migration 029: Concluída
-- ============================================

