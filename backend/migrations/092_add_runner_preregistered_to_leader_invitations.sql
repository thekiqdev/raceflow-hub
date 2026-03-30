-- ============================================
-- Migration 092: Add runner_preregistered to leader_invitations
-- Indica se o runner foi criado pelo líder (pré-cadastro) no momento do envio do convite.
-- Usado para escolher o template de email (convite sem cadastro vs já cadastrado).
-- ============================================

ALTER TABLE leader_invitations
  ADD COLUMN IF NOT EXISTS runner_preregistered BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN leader_invitations.runner_preregistered IS 'True se o runner foi criado pelo líder (pré-cadastro) ao enviar este convite; false se o runner já existia.';
