-- ============================================
-- Migration 006: Financial Management Tables
-- Tabelas para gestão de saques, reembolsos e configurações financeiras
-- ============================================

-- Tabela de solicitações de saque
CREATE TABLE IF NOT EXISTS withdraw_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  fee DECIMAL(10,2) NOT NULL CHECK (fee >= 0),
  net_amount DECIMAL(10,2) NOT NULL CHECK (net_amount > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('PIX', 'TED', 'BANK_TRANSFER')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_withdraw_requests_organizer_id ON withdraw_requests(organizer_id);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_status ON withdraw_requests(status);
CREATE INDEX IF NOT EXISTS idx_withdraw_requests_requested_at ON withdraw_requests(requested_at);

-- Tabela de solicitações de reembolso
CREATE TABLE IF NOT EXISTS refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE NOT NULL,
  athlete_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'em_analise' CHECK (status IN ('em_analise', 'aprovado', 'rejeitado')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_registration_id ON refund_requests(registration_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_athlete_id ON refund_requests(athlete_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_event_id ON refund_requests(event_id);
CREATE INDEX IF NOT EXISTS idx_refund_requests_status ON refund_requests(status);
CREATE INDEX IF NOT EXISTS idx_refund_requests_requested_at ON refund_requests(requested_at);

-- Tabela de configurações financeiras
CREATE TABLE IF NOT EXISTS financial_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_percentage DECIMAL(5,2) DEFAULT 5.00 CHECK (commission_percentage >= 0 AND commission_percentage <= 100),
  min_withdraw_amount DECIMAL(10,2) DEFAULT 100.00 CHECK (min_withdraw_amount >= 0),
  payment_gateway TEXT DEFAULT 'mercadopago',
  gateway_public_key TEXT,
  gateway_private_key TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- Inserir configuração padrão se não existir
INSERT INTO financial_settings (id, commission_percentage, min_withdraw_amount, payment_gateway)
SELECT gen_random_uuid(), 5.00, 100.00, 'mercadopago'
WHERE NOT EXISTS (SELECT 1 FROM financial_settings);

-- Comentários para documentação
COMMENT ON TABLE withdraw_requests IS 'Solicitações de saque dos organizadores';
COMMENT ON TABLE refund_requests IS 'Solicitações de reembolso dos atletas';
COMMENT ON TABLE financial_settings IS 'Configurações financeiras da plataforma';




