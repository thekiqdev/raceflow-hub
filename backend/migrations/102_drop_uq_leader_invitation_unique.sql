-- ============================================
-- Migration 102: Remover índice único incompatível com múltiplos convites bônus por líder/evento
-- ============================================
-- O índice parcial uq_leader_invitation_unique (migração 100) em
-- (event_id, leader_id, status) WHERE status IN ('available','sent') impede mais de UM convite
-- "available" por (evento, líder), ignorando commission_id — quebrando o modelo de múltiplas
-- comissões / múltiplos slots de bônus (missing invitation delivery, leader_invitations por lastro).
-- A unicidade operacional por inscrição bônus permanece em unique_bonus_registration (bonus_registration_id).
-- ============================================

DROP INDEX IF EXISTS public.uq_leader_invitation_unique;
