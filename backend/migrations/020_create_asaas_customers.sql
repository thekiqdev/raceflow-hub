-- ============================================
-- Migration 020: Create Asaas Customers Table
-- Cria tabela para armazenar clientes criados no Asaas
-- ============================================
-- 
-- Esta tabela armazena a relação entre usuários do sistema e clientes no Asaas,
-- evitando criar clientes duplicados no gateway de pagamento.
--
-- PRÉ-REQUISITO: Execute todas as migrações anteriores (001 a 019) antes deste script!
--
-- Uso:
--   psql -U postgres -d cronoteam -f 020_create_asaas_customers.sql
-- ============================================

-- ============================================
-- VERIFICAÇÃO DE PRÉ-REQUISITOS
-- ============================================
DO $$
BEGIN
    -- Verificar se a tabela profiles existe
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'profiles'
    ) THEN
        RAISE EXCEPTION 'Tabela profiles não existe. Execute a migration 001_initial_schema.sql primeiro!';
    END IF;
END $$;

-- ============================================
-- CREATE TABLE: asaas_customers
-- ============================================
CREATE TABLE IF NOT EXISTS public.asaas_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  asaas_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- CREATE INDEXES
-- ============================================
CREATE INDEX IF NOT EXISTS idx_asaas_customers_user_id ON public.asaas_customers(user_id);
CREATE INDEX IF NOT EXISTS idx_asaas_customers_asaas_id ON public.asaas_customers(asaas_customer_id);

-- ============================================
-- CREATE TRIGGER: Update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_asaas_customers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_asaas_customers_updated_at
    BEFORE UPDATE ON public.asaas_customers
    FOR EACH ROW
    EXECUTE FUNCTION update_asaas_customers_updated_at();

-- ============================================
-- COMENTÁRIOS NAS COLUNAS
-- ============================================
COMMENT ON TABLE public.asaas_customers IS 'Armazena a relação entre usuários do sistema e clientes criados no Asaas';
COMMENT ON COLUMN public.asaas_customers.id IS 'ID único do registro';
COMMENT ON COLUMN public.asaas_customers.user_id IS 'ID do perfil do usuário (FK para profiles)';
COMMENT ON COLUMN public.asaas_customers.asaas_customer_id IS 'ID do cliente no Asaas (único)';
COMMENT ON COLUMN public.asaas_customers.created_at IS 'Data de criação do registro';
COMMENT ON COLUMN public.asaas_customers.updated_at IS 'Data da última atualização do registro';

-- ============================================
-- Migration 020: Concluída
-- ============================================


