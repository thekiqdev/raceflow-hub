-- ============================================
-- Migration 005: Add User Status
-- Adiciona coluna status na tabela profiles
-- ============================================

-- Adicionar coluna status em profiles
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' 
CHECK (status IN ('active', 'pending', 'blocked'));

-- Criar índice para melhor performance em consultas por status
CREATE INDEX IF NOT EXISTS idx_profiles_status ON profiles(status);

-- Comentário para documentação
COMMENT ON COLUMN profiles.status IS 'Status do usuário: active (ativo), pending (pendente), blocked (bloqueado)';




