-- ============================================
-- Migration 052: Create contact_messages table
-- Cria a tabela para armazenar mensagens de contato dos eventos
-- ============================================

CREATE TABLE IF NOT EXISTS contact_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('event', 'platform')),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  organizer_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'viewed', 'replied', 'closed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_contact_messages_type ON contact_messages(type);
CREATE INDEX IF NOT EXISTS idx_contact_messages_status ON contact_messages(status);
CREATE INDEX IF NOT EXISTS idx_contact_messages_event_id ON contact_messages(event_id);
CREATE INDEX IF NOT EXISTS idx_contact_messages_organizer_id ON contact_messages(organizer_id);
CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contact_messages_email ON contact_messages(email);

-- Comentários
COMMENT ON TABLE contact_messages IS 'Mensagens de contato enviadas pelos usuários através dos eventos';
COMMENT ON COLUMN contact_messages.type IS 'Tipo de contato: event (dúvidas sobre evento) ou platform (dúvidas sobre plataforma)';
COMMENT ON COLUMN contact_messages.status IS 'Status da mensagem: new (nova), viewed (visualizada), replied (respondida), closed (fechada)';

