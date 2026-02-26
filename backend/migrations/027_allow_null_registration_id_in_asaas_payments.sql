-- ============================================
-- Migration 027: Allow NULL registration_id in asaas_payments
-- Permite que pagamentos de transferência não tenham registration_id
-- ============================================

-- Verificar se a constraint NOT NULL existe antes de remover
DO $$
BEGIN
    -- Verificar se a coluna tem constraint NOT NULL
    IF EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_schema = 'public' 
        AND table_name = 'asaas_payments' 
        AND column_name = 'registration_id'
        AND is_nullable = 'NO'
    ) THEN
        -- Alterar a coluna registration_id para permitir NULL
        ALTER TABLE public.asaas_payments 
          ALTER COLUMN registration_id DROP NOT NULL;
        
        RAISE NOTICE 'Constraint NOT NULL removida da coluna registration_id';
    ELSE
        RAISE NOTICE 'Coluna registration_id já permite NULL';
    END IF;
END $$;

-- Adicionar comentário explicando o uso de NULL
COMMENT ON COLUMN public.asaas_payments.registration_id IS 'ID da inscrição (FK para registrations). NULL para pagamentos de transferência.';

-- ============================================
-- Migration 027: Concluída
-- ============================================

