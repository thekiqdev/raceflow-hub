-- ============================================
-- Migration 012: Organizer Settings
-- Adiciona campos específicos para organizadores
-- ============================================

-- Adicionar campos de configuração do organizador na tabela profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS organization_name TEXT,
ADD COLUMN IF NOT EXISTS contact_email TEXT,
ADD COLUMN IF NOT EXISTS contact_phone TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS website_url TEXT;

-- Criar índice para melhor performance em consultas por organization_name
CREATE INDEX IF NOT EXISTS idx_profiles_organization_name ON profiles(organization_name) WHERE organization_name IS NOT NULL;

-- Comentários para documentação
COMMENT ON COLUMN profiles.logo_url IS 'URL da logo da organização do organizador';
COMMENT ON COLUMN profiles.organization_name IS 'Nome da organização do organizador';
COMMENT ON COLUMN profiles.contact_email IS 'E-mail de contato da organização';
COMMENT ON COLUMN profiles.contact_phone IS 'Telefone de contato da organização';
COMMENT ON COLUMN profiles.bio IS 'Biografia/descrição da organização';
COMMENT ON COLUMN profiles.website_url IS 'URL do site da organização';




