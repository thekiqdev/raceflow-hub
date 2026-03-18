-- ============================================
-- Migration 042: Add bonus system to leader_event_commissions
-- Permite múltiplas comissões por evento e adiciona sistema de bônus por convites
-- ============================================

-- Remover constraint UNIQUE que impede múltiplas comissões
ALTER TABLE leader_event_commissions 
DROP CONSTRAINT IF EXISTS leader_event_commissions_leader_id_event_id_key;

-- Adicionar campos para sistema de bônus
ALTER TABLE leader_event_commissions
ADD COLUMN IF NOT EXISTS bonus_type VARCHAR(20) NOT NULL DEFAULT 'commission' CHECK (bonus_type IN ('commission', 'invitation', 'both')),
ADD COLUMN IF NOT EXISTS required_purchases INTEGER NULL CHECK (required_purchases IS NULL OR required_purchases > 0),
ADD COLUMN IF NOT EXISTS bonus_registration_id UUID NULL REFERENCES registrations(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS bonus_earned_at TIMESTAMP NULL,
ADD COLUMN IF NOT EXISTS name VARCHAR(255) NULL; -- Nome descritivo para identificar a comissão/bônus

-- Criar índice para bonus_type
CREATE INDEX IF NOT EXISTS idx_leader_event_commissions_bonus_type ON leader_event_commissions(bonus_type);
CREATE INDEX IF NOT EXISTS idx_leader_event_commissions_leader_event_bonus ON leader_event_commissions(leader_id, event_id, bonus_type);

-- Adicionar comentários
COMMENT ON COLUMN leader_event_commissions.bonus_type IS 'Tipo de bônus: commission (comissão) ou invitation (convite)';
COMMENT ON COLUMN leader_event_commissions.required_purchases IS 'Número de compras necessárias para ganhar bônus (apenas para invitation)';
COMMENT ON COLUMN leader_event_commissions.bonus_registration_id IS 'ID da inscrição grátis concedida como bônus';
COMMENT ON COLUMN leader_event_commissions.bonus_earned_at IS 'Data em que o bônus foi concedido';
COMMENT ON COLUMN leader_event_commissions.name IS 'Nome descritivo para identificar esta comissão/bônus';

