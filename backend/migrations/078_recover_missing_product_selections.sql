-- ============================================
-- Migration 078: Document missing product selections issue
-- Documenta o problema de inscrições antigas sem seleções de produtos
-- ============================================

-- Esta migração apenas documenta o problema e não tenta recuperar dados
-- porque não é possível recuperar dados que não foram salvos originalmente.

DO $$
DECLARE
  total_affected INTEGER;
BEGIN
  -- Contar quantas inscrições podem estar afetadas
  SELECT COUNT(DISTINCT r.id) INTO total_affected
  FROM registrations r
  WHERE r.kit_id IS NOT NULL
    AND r.status != 'cancelled'
    AND NOT EXISTS (
      SELECT 1 FROM registration_product_selections rps
      WHERE rps.registration_id = r.id
    )
    AND EXISTS (
      SELECT 1 FROM kit_products kp
      WHERE kp.kit_id = r.kit_id
      AND kp.type = 'variable'
      AND kp.variant_attributes IS NOT NULL
      AND array_length(kp.variant_attributes, 1) > 0
    );

  RAISE NOTICE '⚠️  ATENÇÃO: Inscrições antigas sem atributos';
  RAISE NOTICE '   Total de inscrições que podem estar afetadas: %', total_affected;
  RAISE NOTICE '';
  RAISE NOTICE '   LIMITAÇÕES:';
  RAISE NOTICE '   - Não é possível recuperar atributos que não foram salvos';
  RAISE NOTICE '   - Inscrições futuras serão salvas corretamente após a correção';
  RAISE NOTICE '   - Use o script recover-product-selections.ts para tentar recuperação parcial';
  RAISE NOTICE '';
  RAISE NOTICE '   SOLUÇÃO:';
  RAISE NOTICE '   - Execute: npm run recover-selections (se disponível)';
  RAISE NOTICE '   - Ou execute manualmente: ts-node backend/scripts/recover-product-selections.ts';
END $$;

-- Log migration completion
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 078 concluída:';
  RAISE NOTICE '   - Problema documentado';
  RAISE NOTICE '   - Script de recuperação disponível em backend/scripts/recover-product-selections.ts';
END $$;
