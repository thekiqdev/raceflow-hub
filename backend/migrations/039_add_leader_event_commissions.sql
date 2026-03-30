-- ============================================
-- Migration 039: Add leader_event_commissions table
-- Tabela para armazenar comissões específicas de líderes por evento
-- ============================================

-- Criar tabela leader_event_commissions
CREATE TABLE IF NOT EXISTS leader_event_commissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leader_id UUID NOT NULL REFERENCES group_leaders(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  commission_percentage DECIMAL(5,2) NOT NULL CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(leader_id, event_id)
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_leader_event_commissions_leader_id ON leader_event_commissions(leader_id);
CREATE INDEX IF NOT EXISTS idx_leader_event_commissions_event_id ON leader_event_commissions(event_id);
CREATE INDEX IF NOT EXISTS idx_leader_event_commissions_leader_event ON leader_event_commissions(leader_id, event_id);

-- Criar trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_leader_event_commissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_leader_event_commissions_updated_at
  BEFORE UPDATE ON leader_event_commissions
  FOR EACH ROW
  EXECUTE FUNCTION update_leader_event_commissions_updated_at();

-- Adicionar comentários
COMMENT ON TABLE leader_event_commissions IS 'Comissões específicas de líderes de grupo por evento';
COMMENT ON COLUMN leader_event_commissions.leader_id IS 'ID do líder de grupo';
COMMENT ON COLUMN leader_event_commissions.event_id IS 'ID do evento';
COMMENT ON COLUMN leader_event_commissions.commission_percentage IS 'Percentual de comissão (0-100)';
COMMENT ON COLUMN leader_event_commissions.created_at IS 'Data de criação';
COMMENT ON COLUMN leader_event_commissions.updated_at IS 'Data de última atualização';



