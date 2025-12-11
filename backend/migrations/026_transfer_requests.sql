-- ============================================
-- Migration 026: Transfer Requests Table
-- Tabela para solicitações de transferência de inscrições
-- ============================================

-- Tabela de solicitações de transferência
CREATE TABLE IF NOT EXISTS transfer_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID NOT NULL REFERENCES registrations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  new_runner_cpf TEXT,
  new_runner_email TEXT,
  new_runner_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'completed', 'cancelled')),
  transfer_fee DECIMAL(10, 2) DEFAULT 0,
  payment_status TEXT DEFAULT 'pending' CHECK (payment_status IN ('pending', 'paid', 'refunded')),
  asaas_payment_id TEXT,
  reason TEXT,
  admin_notes TEXT,
  processed_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  processed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_transfer_requests_registration_id ON transfer_requests(registration_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_requested_by ON transfer_requests(requested_by);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_status ON transfer_requests(status);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_new_runner_id ON transfer_requests(new_runner_id);
CREATE INDEX IF NOT EXISTS idx_transfer_requests_created_at ON transfer_requests(created_at DESC);

-- Adicionar campo de taxa de transferência nas configurações do sistema
ALTER TABLE system_settings 
ADD COLUMN IF NOT EXISTS transfer_fee DECIMAL(10, 2) DEFAULT 0;

-- Comentários para documentação
COMMENT ON TABLE transfer_requests IS 'Solicitações de transferência de inscrições entre corredores';
COMMENT ON COLUMN transfer_requests.transfer_fee IS 'Taxa cobrada pela transferência';
COMMENT ON COLUMN transfer_requests.payment_status IS 'Status do pagamento da taxa de transferência';
COMMENT ON COLUMN system_settings.transfer_fee IS 'Taxa padrão para transferências de inscrições';


