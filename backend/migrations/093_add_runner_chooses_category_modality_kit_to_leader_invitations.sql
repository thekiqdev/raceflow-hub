-- ============================================
-- Migration 093: Add runner_chooses_category_modality_kit to leader_invitations
-- Flag que indica se o corredor pode escolher categoria, modalidade e kit (true)
-- ou se o líder já definiu no envio do convite (false).
-- NULL em registros antigos: frontend/backend podem inferir pelo preenchimento da inscrição.
-- ============================================

ALTER TABLE leader_invitations
  ADD COLUMN IF NOT EXISTS runner_chooses_category_modality_kit BOOLEAN NULL;

COMMENT ON COLUMN leader_invitations.runner_chooses_category_modality_kit IS 'True = corredor escolhe categoria/modalidade/kit; false = líder definiu no envio. NULL = convite antigo (inferir pelos dados da inscrição).';
