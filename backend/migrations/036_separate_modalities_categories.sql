-- ============================================
-- Migration 036: Separate Modalities and Categories
-- Separa modalidades e categorias em tabelas distintas
-- Permite que uma categoria esteja associada a múltiplas modalidades
-- ============================================

-- 1. Criar tabela de modalidades
CREATE TABLE IF NOT EXISTS public.modalities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    distance VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_modalities_event FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE
);

-- 2. Criar tabela de categorias com novos campos
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL,
    name VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL DEFAULT 0,
    category_type VARCHAR(50) NOT NULL DEFAULT 'geral',
    gender VARCHAR(20) NOT NULL DEFAULT 'ambos',
    min_age INTEGER NULL,
    max_participants INTEGER NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    CONSTRAINT fk_categories_event FOREIGN KEY (event_id) REFERENCES public.events(id) ON DELETE CASCADE,
    CONSTRAINT chk_category_type CHECK (category_type IN ('visitante', 'local', 'geral', 'PCD', 'militar', 'civil', 'outro')),
    CONSTRAINT chk_gender CHECK (gender IN ('ambos', 'masculino', 'feminino')),
    CONSTRAINT chk_min_age CHECK (min_age IS NULL OR min_age >= 0)
);

-- 3. Criar tabela de relacionamento muitos-para-muitos entre categorias e modalidades
CREATE TABLE IF NOT EXISTS public.category_modalities (
    category_id UUID NOT NULL,
    modality_id UUID NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    PRIMARY KEY (category_id, modality_id),
    CONSTRAINT fk_category_modalities_category FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE CASCADE,
    CONSTRAINT fk_category_modalities_modality FOREIGN KEY (modality_id) REFERENCES public.modalities(id) ON DELETE CASCADE
);

-- 4. Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_modalities_event_id ON public.modalities(event_id);
CREATE INDEX IF NOT EXISTS idx_categories_event_id ON public.categories(event_id);
CREATE INDEX IF NOT EXISTS idx_category_modalities_category_id ON public.category_modalities(category_id);
CREATE INDEX IF NOT EXISTS idx_category_modalities_modality_id ON public.category_modalities(modality_id);

-- 5. Adicionar trigger para atualizar updated_at nas novas tabelas
CREATE TRIGGER update_modalities_updated_at
  BEFORE UPDATE ON public.modalities
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Comentários nas tabelas e colunas
COMMENT ON TABLE public.modalities IS 'Tabela de modalidades dos eventos (ex: 5km, 10km, 21km, 42km)';
COMMENT ON TABLE public.categories IS 'Tabela de categorias dos eventos com restrições de tipo, gênero e idade';
COMMENT ON TABLE public.category_modalities IS 'Tabela de relacionamento muitos-para-muitos entre categorias e modalidades';

COMMENT ON COLUMN public.modalities.name IS 'Nome da modalidade (ex: Corrida 5km)';
COMMENT ON COLUMN public.modalities.distance IS 'Distância da modalidade (ex: 5km, 10km)';

COMMENT ON COLUMN public.categories.name IS 'Nome da categoria (ex: Masculino 18-29, Feminino 30-39)';
COMMENT ON COLUMN public.categories.price IS 'Preço da categoria';
COMMENT ON COLUMN public.categories.category_type IS 'Tipo da categoria: visitante, local, geral, PCD, militar, civil, outro';
COMMENT ON COLUMN public.categories.gender IS 'Gênero permitido: ambos, masculino, feminino';
COMMENT ON COLUMN public.categories.min_age IS 'Idade mínima para a categoria (NULL = sem restrição)';
COMMENT ON COLUMN public.categories.max_participants IS 'Número máximo de participantes para a categoria';

-- NOTA: A tabela event_categories será mantida temporariamente para compatibilidade
-- A migração de dados existentes será feita em uma etapa posterior
-- através de um script de migração específico

