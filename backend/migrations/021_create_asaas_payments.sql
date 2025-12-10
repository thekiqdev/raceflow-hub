-- ============================================
-- Migration 021: Create Asaas Payments Table
-- Cria tabela para armazenar pagamentos criados no Asaas
-- ============================================
-- 
-- Esta tabela armazena todas as cobranças criadas no Asaas vinculadas às inscrições,
-- incluindo informações de PIX (QR Code), boletos e cartões.
--
-- PRÉ-REQUISITO: Execute todas as migrações anteriores (001 a 020) antes deste script!
--
-- Uso:
--   psql -U postgres -d cronoteam -f 021_create_asaas_payments.sql
-- ============================================

-- ============================================
-- VERIFICAÇÃO DE PRÉ-REQUISITOS
-- ============================================
DO $$
BEGIN
    -- Verificar se a tabela registrations existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'registrations'
    ) THEN
        RAISE EXCEPTION 'Tabela registrations não existe. Execute a migration 001_initial_schema.sql primeiro!';
    END IF;
END $$;

-- ============================================
-- CREATE TABLE: asaas_payments
-- ============================================
CREATE TABLE IF NOT EXISTS public.asaas_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES public.registrations(id) ON DELETE CASCADE NOT NULL,
  asaas_payment_id TEXT NOT NULL UNIQUE,
  asaas_customer_id TEXT NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  net_value DECIMAL(10,2),
  billing_type TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date DATE NOT NULL,
  payment_date DATE,
  payment_link TEXT,
  invoice_url TEXT,
  bank_slip_url TEXT,
  external_reference TEXT,
  pix_qr_code_id TEXT,
  pix_qr_code TEXT,
  pix_transaction_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CREATE INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_asaas_payments_registration_id ON public.asaas_payments(registration_id);
CREATE INDEX IF NOT EXISTS idx_asaas_payments_asaas_id ON public.asaas_payments(asaas_payment_id);
CREATE INDEX IF NOT EXISTS idx_asaas_payments_status ON public.asaas_payments(status);
CREATE INDEX IF NOT EXISTS idx_asaas_payments_customer_id ON public.asaas_payments(asaas_customer_id);
CREATE INDEX IF NOT EXISTS idx_asaas_payments_due_date ON public.asaas_payments(due_date);

-- ============================================
-- CREATE TRIGGER: Update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_asaas_payments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_asaas_payments_updated_at
    BEFORE UPDATE ON public.asaas_payments
    FOR EACH ROW
    EXECUTE FUNCTION update_asaas_payments_updated_at();

-- ============================================
-- COMENTÁRIOS NAS COLUNAS
-- ============================================
COMMENT ON TABLE public.asaas_payments IS 'Armazena pagamentos criados no Asaas vinculados às inscrições';
COMMENT ON COLUMN public.asaas_payments.id IS 'ID único do registro';
COMMENT ON COLUMN public.asaas_payments.registration_id IS 'ID da inscrição (FK para registrations)';
COMMENT ON COLUMN public.asaas_payments.asaas_payment_id IS 'ID do pagamento no Asaas (único)';
COMMENT ON COLUMN public.asaas_payments.asaas_customer_id IS 'ID do cliente no Asaas';
COMMENT ON COLUMN public.asaas_payments.value IS 'Valor total da cobrança';
COMMENT ON COLUMN public.asaas_payments.net_value IS 'Valor líquido após taxas';
COMMENT ON COLUMN public.asaas_payments.billing_type IS 'Tipo de pagamento: PIX, BOLETO, CREDIT_CARD, DEBIT_CARD';
COMMENT ON COLUMN public.asaas_payments.status IS 'Status do pagamento: PENDING, CONFIRMED, RECEIVED, OVERDUE, etc.';
COMMENT ON COLUMN public.asaas_payments.due_date IS 'Data de vencimento';
COMMENT ON COLUMN public.asaas_payments.payment_date IS 'Data do pagamento (quando confirmado)';
COMMENT ON COLUMN public.asaas_payments.payment_link IS 'Link para pagamento';
COMMENT ON COLUMN public.asaas_payments.invoice_url IS 'URL da fatura';
COMMENT ON COLUMN public.asaas_payments.bank_slip_url IS 'URL do boleto (se aplicável)';
COMMENT ON COLUMN public.asaas_payments.external_reference IS 'Referência externa (confirmation_code da inscrição)';
COMMENT ON COLUMN public.asaas_payments.pix_qr_code_id IS 'ID do QR Code PIX no Asaas';
COMMENT ON COLUMN public.asaas_payments.pix_qr_code IS 'String do QR Code PIX (código copia e cola)';
COMMENT ON COLUMN public.asaas_payments.pix_transaction_id IS 'ID da transação PIX (quando pago)';

-- ============================================
-- Migration 021: Concluída
-- ============================================


