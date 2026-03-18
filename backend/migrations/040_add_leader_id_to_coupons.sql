-- ============================================
-- Migration 040: Add leader_id to coupons table
-- Adiciona campo leader_id na tabela coupons para vincular cupons a líderes de grupo
-- ============================================

-- Adicionar coluna leader_id (nullable para manter compatibilidade com cupons existentes)
ALTER TABLE coupons 
ADD COLUMN IF NOT EXISTS leader_id UUID REFERENCES group_leaders(id) ON DELETE CASCADE;

-- Criar índice para performance
CREATE INDEX IF NOT EXISTS idx_coupons_leader_id ON coupons(leader_id);

-- Adicionar comentário
COMMENT ON COLUMN coupons.leader_id IS 'ID do líder de grupo (opcional - cupons exclusivos do líder)';



