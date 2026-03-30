-- ============================================
-- Migration 051: Create quotes table
-- Cria a tabela para armazenar orçamentos de provas
-- ============================================

CREATE TABLE IF NOT EXISTS quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT NOT NULL,
  event_location TEXT NOT NULL,
  athletes_count TEXT NOT NULL,
  same_start_finish TEXT NOT NULL,
  electric_power TEXT NOT NULL,
  additional_points TEXT,
  chest_numbers TEXT NOT NULL,
  distances TEXT NOT NULL,
  timing_gate TEXT NOT NULL,
  cronoteam_registration TEXT NOT NULL,
  event_date TEXT NOT NULL,
  description TEXT NOT NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'viewed', 'contacted', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_quotes_status ON quotes(status);
CREATE INDEX IF NOT EXISTS idx_quotes_created_at ON quotes(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_quotes_email ON quotes(email);

-- Comentários
COMMENT ON TABLE quotes IS 'Tabela para armazenar orçamentos de provas solicitados pelos usuários';
COMMENT ON COLUMN quotes.status IS 'Status do orçamento: new (novo), viewed (visualizado), contacted (contatado), closed (fechado)';

