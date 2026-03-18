-- Migration 092: Allow NULL for birth_date and phone in profiles
-- Inscrição manual pelo organizador pode criar atleta com apenas nome e CPF;
-- birth_date e phone passam a ser opcionais para esse fluxo.

ALTER TABLE public.profiles
  ALTER COLUMN birth_date DROP NOT NULL;

ALTER TABLE public.profiles
  ALTER COLUMN phone DROP NOT NULL;

COMMENT ON COLUMN public.profiles.birth_date IS 'Data de nascimento (opcional em cadastros criados pelo organizador)';
COMMENT ON COLUMN public.profiles.phone IS 'Telefone (opcional em cadastros criados pelo organizador)';
