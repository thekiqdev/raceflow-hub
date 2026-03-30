-- Migration 069: Add old_platform_url to system_settings
-- URL da plataforma antiga para acesso pelo runner no menu perfil

ALTER TABLE public.system_settings
ADD COLUMN IF NOT EXISTS old_platform_url TEXT;

COMMENT ON COLUMN public.system_settings.old_platform_url IS 'URL da plataforma antiga para acesso pelo runner no menu perfil';

-- Log migration completion
DO $$
DECLARE
  settings_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO settings_count FROM public.system_settings;
  RAISE NOTICE '✅ Migration 069 concluída:';
  RAISE NOTICE '   - Coluna old_platform_url adicionada à tabela system_settings';
  RAISE NOTICE '   - Configurações existentes: %', settings_count;
END $$;
