-- ============================================
-- Migration 057: Create password_reset_tokens table
-- Cria a tabela para armazenar tokens de recuperação de senha
-- ============================================

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  used_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_user_id ON password_reset_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token ON password_reset_tokens(token);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_expires_at ON password_reset_tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_used_at ON password_reset_tokens(used_at);

-- Comentários
COMMENT ON TABLE password_reset_tokens IS 'Tabela para armazenar tokens de recuperação de senha';
COMMENT ON COLUMN password_reset_tokens.token IS 'Token único para recuperação de senha';
COMMENT ON COLUMN password_reset_tokens.expires_at IS 'Data e hora de expiração do token (30 minutos após criação)';
COMMENT ON COLUMN password_reset_tokens.used_at IS 'Data e hora em que o token foi utilizado (NULL se não foi usado)';

