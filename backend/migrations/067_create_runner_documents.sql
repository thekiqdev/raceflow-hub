-- ============================================
-- Migration 067: Create Runner Documents Table
-- ============================================
-- Tabela para armazenar documentos enviados pelos runners para validação
-- Permite upload de documentos (RG, CPF, atestado médico, carteirinhas, etc.)
-- e aprovação/rejeição por administradores

-- Tabela para armazenar documentos dos runners
CREATE TABLE IF NOT EXISTS public.runner_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  runner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL, -- 'militar', 'estudante', 'pcd', 'rg', 'cpf', 'atestado_medico', etc.
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_size INTEGER NOT NULL, -- em bytes
  mime_type VARCHAR(100) NOT NULL,
  expiry_date DATE, -- Data de validade (opcional)
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT, -- Motivo da rejeição (se rejeitado)
  reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL, -- Admin que revisou
  reviewed_at TIMESTAMP WITH TIME ZONE, -- Data da revisão
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_runner_documents_runner_id ON public.runner_documents(runner_id);
CREATE INDEX IF NOT EXISTS idx_runner_documents_status ON public.runner_documents(status);
CREATE INDEX IF NOT EXISTS idx_runner_documents_document_type ON public.runner_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_runner_documents_created_at ON public.runner_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_runner_documents_reviewed_by ON public.runner_documents(reviewed_by) WHERE reviewed_by IS NOT NULL;

-- Comentários
COMMENT ON TABLE public.runner_documents IS 'Documentos enviados pelos runners para validação';
COMMENT ON COLUMN public.runner_documents.runner_id IS 'ID do runner (profile) que enviou o documento';
COMMENT ON COLUMN public.runner_documents.document_type IS 'Tipo do documento: militar, estudante, pcd, rg, cpf, atestado_medico, comprovante_residencia, outro';
COMMENT ON COLUMN public.runner_documents.file_name IS 'Nome original do arquivo enviado';
COMMENT ON COLUMN public.runner_documents.file_path IS 'Caminho completo do arquivo no servidor';
COMMENT ON COLUMN public.runner_documents.file_url IS 'URL pública para acessar o arquivo';
COMMENT ON COLUMN public.runner_documents.file_size IS 'Tamanho do arquivo em bytes';
COMMENT ON COLUMN public.runner_documents.mime_type IS 'Tipo MIME do arquivo (application/pdf, image/jpeg, etc.)';
COMMENT ON COLUMN public.runner_documents.expiry_date IS 'Data de validade do documento (opcional, apenas para documentos com validade)';
COMMENT ON COLUMN public.runner_documents.status IS 'Status: pending (pendente), approved (aprovado), rejected (rejeitado)';
COMMENT ON COLUMN public.runner_documents.rejection_reason IS 'Motivo da rejeição (preenchido apenas quando status = rejected)';
COMMENT ON COLUMN public.runner_documents.reviewed_by IS 'ID do administrador que revisou o documento';
COMMENT ON COLUMN public.runner_documents.reviewed_at IS 'Data e hora em que o documento foi revisado (aprovado ou rejeitado)';

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_runner_documents_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_runner_documents_updated_at
  BEFORE UPDATE ON public.runner_documents
  FOR EACH ROW
  EXECUTE FUNCTION update_runner_documents_updated_at();

-- Log migration completion
DO $$
DECLARE
  documents_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO documents_count FROM public.runner_documents;
  RAISE NOTICE '✅ Migration 067 concluída:';
  RAISE NOTICE '   - Tabela runner_documents criada';
  RAISE NOTICE '   - Índices criados';
  RAISE NOTICE '   - Trigger de updated_at configurado';
  RAISE NOTICE '   - Documentos existentes: %', documents_count;
END $$;
