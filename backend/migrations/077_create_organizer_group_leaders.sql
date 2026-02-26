-- ============================================
-- Migration 077: Create organizer_group_leaders table
-- Cria tabela para relacionar organizadores com líderes de grupo
-- ============================================

-- Tabela para relacionar organizadores com líderes de grupo
CREATE TABLE IF NOT EXISTS organizer_group_leaders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  leader_id UUID NOT NULL REFERENCES group_leaders(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(organizer_id, leader_id)
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_organizer_group_leaders_organizer_id ON organizer_group_leaders(organizer_id);
CREATE INDEX IF NOT EXISTS idx_organizer_group_leaders_leader_id ON organizer_group_leaders(leader_id);

-- Comentários
COMMENT ON TABLE organizer_group_leaders IS 'Relacionamento entre organizadores e líderes de grupo. Permite que organizadores adicionem líderes à sua lista.';
COMMENT ON COLUMN organizer_group_leaders.organizer_id IS 'ID do organizador';
COMMENT ON COLUMN organizer_group_leaders.leader_id IS 'ID do líder de grupo';
COMMENT ON COLUMN organizer_group_leaders.created_at IS 'Data de criação do relacionamento';
