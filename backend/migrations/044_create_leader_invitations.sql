-- ============================================
-- Migration 044: Create leader invitations system
-- Sistema para líderes enviarem convites de inscrição grátis para runners
-- ============================================

-- Criar tabela para armazenar convites enviados
CREATE TABLE IF NOT EXISTS leader_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leader_id UUID NOT NULL REFERENCES group_leaders(id) ON DELETE CASCADE,
    bonus_registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    runner_id UUID NULL REFERENCES users(id) ON DELETE SET NULL, -- Runner que receberá o convite (pode ser NULL se ainda não foi enviado)
    runner_cpf VARCHAR(14) NULL, -- CPF do runner para quem o convite foi enviado
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'sent', 'used', 'expired')),
    sent_at TIMESTAMP NULL,
    used_at TIMESTAMP NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_leader_invitations_bonus_registration FOREIGN KEY (bonus_registration_id) 
        REFERENCES registrations(id) ON DELETE CASCADE,
    CONSTRAINT unique_bonus_registration UNIQUE (bonus_registration_id) -- Um convite por inscrição bônus
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_leader_invitations_leader_id ON leader_invitations(leader_id);
CREATE INDEX IF NOT EXISTS idx_leader_invitations_runner_id ON leader_invitations(runner_id);
CREATE INDEX IF NOT EXISTS idx_leader_invitations_status ON leader_invitations(status);
CREATE INDEX IF NOT EXISTS idx_leader_invitations_event_id ON leader_invitations(event_id);

-- Comentários
COMMENT ON TABLE leader_invitations IS 'Convites de inscrição grátis que líderes podem enviar para runners';
COMMENT ON COLUMN leader_invitations.bonus_registration_id IS 'ID da inscrição grátis ganha pelo líder (bonus_registration_id da leader_event_commissions)';
COMMENT ON COLUMN leader_invitations.status IS 'Status: available (disponível), sent (enviado), used (usado), expired (expirado)';
COMMENT ON COLUMN leader_invitations.runner_cpf IS 'CPF do runner para quem o convite foi enviado';

