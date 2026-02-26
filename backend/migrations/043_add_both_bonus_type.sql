-- ============================================
-- Migration 043: Add 'both' bonus type to leader_event_commissions
-- Permite tipo 'both' que combina comissão e convites
-- ============================================

-- Atualizar constraint CHECK para incluir 'both'
ALTER TABLE leader_event_commissions
DROP CONSTRAINT IF EXISTS leader_event_commissions_bonus_type_check;

ALTER TABLE leader_event_commissions
ADD CONSTRAINT leader_event_commissions_bonus_type_check 
CHECK (bonus_type IN ('commission', 'invitation', 'both'));

-- Atualizar comentário
COMMENT ON COLUMN leader_event_commissions.bonus_type IS 'Tipo de bônus: commission (comissão), invitation (convite) ou both (ambos)';


