-- ============================================
-- Migration 030: Create Group Leaders System
-- Cria sistema de líderes de grupo/afiliados
-- ============================================

-- Criar tabela group_leaders (Líderes de Grupo)
CREATE TABLE IF NOT EXISTS public.group_leaders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    referral_code VARCHAR(20) NOT NULL UNIQUE,
    is_active BOOLEAN NOT NULL DEFAULT true,
    commission_percentage DECIMAL(5,2) NULL, -- Percentual específico do líder (pode ser NULL para usar o global)
    total_earnings DECIMAL(10,2) NOT NULL DEFAULT 0,
    total_referrals INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_group_leaders_user FOREIGN KEY (user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE
);

-- Criar tabela user_referrals (Referências de Usuários)
CREATE TABLE IF NOT EXISTS public.user_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE,
    leader_id UUID NOT NULL,
    referral_code VARCHAR(20) NOT NULL,
    referral_type VARCHAR(10) NOT NULL DEFAULT 'code', -- 'link' ou 'code'
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_user_referrals_user FOREIGN KEY (user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_user_referrals_leader FOREIGN KEY (leader_id) 
        REFERENCES public.group_leaders(id) ON DELETE CASCADE,
    CONSTRAINT chk_referral_type CHECK (referral_type IN ('link', 'code'))
);

-- Criar tabela leader_commissions (Comissões dos Líderes)
CREATE TABLE IF NOT EXISTS public.leader_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    leader_id UUID NOT NULL,
    registration_id UUID NOT NULL,
    referred_user_id UUID NOT NULL,
    event_id UUID NOT NULL,
    commission_amount DECIMAL(10,2) NOT NULL,
    commission_percentage DECIMAL(5,2) NOT NULL,
    registration_amount DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'paid', 'cancelled'
    paid_at TIMESTAMP WITH TIME ZONE NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    
    CONSTRAINT fk_leader_commissions_leader FOREIGN KEY (leader_id) 
        REFERENCES public.group_leaders(id) ON DELETE CASCADE,
    CONSTRAINT fk_leader_commissions_registration FOREIGN KEY (registration_id) 
        REFERENCES public.registrations(id) ON DELETE CASCADE,
    CONSTRAINT fk_leader_commissions_user FOREIGN KEY (referred_user_id) 
        REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT fk_leader_commissions_event FOREIGN KEY (event_id) 
        REFERENCES public.events(id) ON DELETE CASCADE,
    CONSTRAINT chk_commission_status CHECK (status IN ('pending', 'paid', 'cancelled'))
);

-- Adicionar campo leader_commission_percentage em system_settings
ALTER TABLE public.system_settings 
ADD COLUMN IF NOT EXISTS leader_commission_percentage DECIMAL(5,2) NOT NULL DEFAULT 0;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_group_leaders_user_id ON public.group_leaders(user_id);
CREATE INDEX IF NOT EXISTS idx_group_leaders_referral_code ON public.group_leaders(referral_code);
CREATE INDEX IF NOT EXISTS idx_group_leaders_is_active ON public.group_leaders(is_active);

CREATE INDEX IF NOT EXISTS idx_user_referrals_user_id ON public.user_referrals(user_id);
CREATE INDEX IF NOT EXISTS idx_user_referrals_leader_id ON public.user_referrals(leader_id);
CREATE INDEX IF NOT EXISTS idx_user_referrals_referral_code ON public.user_referrals(referral_code);

CREATE INDEX IF NOT EXISTS idx_leader_commissions_leader_id ON public.leader_commissions(leader_id);
CREATE INDEX IF NOT EXISTS idx_leader_commissions_registration_id ON public.leader_commissions(registration_id);
CREATE INDEX IF NOT EXISTS idx_leader_commissions_referred_user_id ON public.leader_commissions(referred_user_id);
CREATE INDEX IF NOT EXISTS idx_leader_commissions_status ON public.leader_commissions(status);
CREATE INDEX IF NOT EXISTS idx_leader_commissions_created_at ON public.leader_commissions(created_at);

-- Criar função para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_group_leaders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_leader_commissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar triggers para updated_at
DROP TRIGGER IF EXISTS trigger_update_group_leaders_updated_at ON public.group_leaders;
CREATE TRIGGER trigger_update_group_leaders_updated_at
    BEFORE UPDATE ON public.group_leaders
    FOR EACH ROW
    EXECUTE FUNCTION update_group_leaders_updated_at();

DROP TRIGGER IF EXISTS trigger_update_leader_commissions_updated_at ON public.leader_commissions;
CREATE TRIGGER trigger_update_leader_commissions_updated_at
    BEFORE UPDATE ON public.leader_commissions
    FOR EACH ROW
    EXECUTE FUNCTION update_leader_commissions_updated_at();

-- Adicionar comentários para documentação
COMMENT ON TABLE public.group_leaders IS 'Líderes de grupo/afiliados que podem receber comissões sobre inscrições';
COMMENT ON COLUMN public.group_leaders.referral_code IS 'Código único de referência do líder (ex: LEADER-XXXXX)';
COMMENT ON COLUMN public.group_leaders.commission_percentage IS 'Percentual de comissão específico do líder (NULL = usa percentual global)';
COMMENT ON COLUMN public.group_leaders.total_earnings IS 'Total de comissões recebidas pelo líder';
COMMENT ON COLUMN public.group_leaders.total_referrals IS 'Total de usuários referenciados pelo líder';

COMMENT ON TABLE public.user_referrals IS 'Rastreamento de usuários que se cadastraram através de referência';
COMMENT ON COLUMN public.user_referrals.referral_type IS 'Tipo de referência: link ou code';
COMMENT ON COLUMN public.user_referrals.referral_code IS 'Código de referência usado no cadastro';

COMMENT ON TABLE public.leader_commissions IS 'Histórico de comissões calculadas e pagas aos líderes';
COMMENT ON COLUMN public.leader_commissions.commission_amount IS 'Valor da comissão em reais';
COMMENT ON COLUMN public.leader_commissions.commission_percentage IS 'Percentual aplicado para calcular a comissão';
COMMENT ON COLUMN public.leader_commissions.registration_amount IS 'Valor total da inscrição que gerou a comissão';
COMMENT ON COLUMN public.leader_commissions.status IS 'Status da comissão: pending, paid, cancelled';

COMMENT ON COLUMN public.system_settings.leader_commission_percentage IS 'Percentual global de comissão para líderes de grupo (padrão: 0)';

-- ============================================
-- Migration 030: Concluída
-- ============================================

