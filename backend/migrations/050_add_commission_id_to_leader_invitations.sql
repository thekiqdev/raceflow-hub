-- ============================================
-- Migration 050: Add commission_id to leader_invitations
-- Adiciona campo commission_id para associar convites a comissões específicas
-- ============================================

-- Adicionar coluna commission_id
ALTER TABLE leader_invitations
ADD COLUMN IF NOT EXISTS commission_id UUID NULL REFERENCES leader_event_commissions(id) ON DELETE SET NULL;

-- Criar índice para melhorar performance nas consultas
CREATE INDEX IF NOT EXISTS idx_leader_invitations_commission_id ON leader_invitations(commission_id);

-- Comentário
COMMENT ON COLUMN leader_invitations.commission_id IS 'ID da comissão de evento que gerou este convite (permite rastrear qual comissão específica gerou o convite)';


