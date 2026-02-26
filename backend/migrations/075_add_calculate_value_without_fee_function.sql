-- ============================================
-- Migration 075: Add function to calculate value without platform fee
-- Adiciona função para calcular valor sem taxa da plataforma
-- ============================================

-- Função para calcular valor sem taxa da plataforma
CREATE OR REPLACE FUNCTION calculate_value_without_platform_fee(
  total_amount DECIMAL,
  platform_fee DECIMAL,
  platform_fee_type VARCHAR
) RETURNS DECIMAL AS $$
BEGIN
  -- Se algum valor for NULL, zero ou negativo, retorna o total_amount original
  IF total_amount IS NULL OR total_amount <= 0 OR platform_fee IS NULL OR platform_fee <= 0 THEN
    RETURN total_amount;
  END IF;
  
  -- Se o tipo de taxa não for válido, retorna o total_amount original
  IF platform_fee_type NOT IN ('fixed', 'percentage') THEN
    RETURN total_amount;
  END IF;
  
  IF platform_fee_type = 'percentage' THEN
    -- Se taxa é percentual: value_without_fee = total_amount / (1 + fee/100)
    -- Exemplo: se total é 110 e taxa é 10%, então original = 110 / 1.10 = 100
    RETURN ROUND(total_amount / (1 + platform_fee / 100), 2);
  ELSE
    -- Se taxa é fixa: value_without_fee = total_amount - fee
    RETURN GREATEST(0, ROUND(total_amount - platform_fee, 2));
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Comentário na função
COMMENT ON FUNCTION calculate_value_without_platform_fee IS 'Calcula o valor original da inscrição sem a taxa da plataforma. Para taxa percentual: value = total / (1 + fee/100). Para taxa fixa: value = total - fee.';

-- Funções auxiliares para obter configurações de taxa da plataforma
CREATE OR REPLACE FUNCTION get_platform_fee() RETURNS DECIMAL AS $$
BEGIN
  RETURN COALESCE((SELECT platform_fee FROM system_settings LIMIT 1), 0);
END;
$$ LANGUAGE plpgsql STABLE;

CREATE OR REPLACE FUNCTION get_platform_fee_type() RETURNS VARCHAR AS $$
BEGIN
  RETURN COALESCE((SELECT platform_fee_type FROM system_settings LIMIT 1), 'fixed');
END;
$$ LANGUAGE plpgsql STABLE;

-- Comentários nas funções auxiliares
COMMENT ON FUNCTION get_platform_fee IS 'Retorna o valor da taxa da plataforma configurada no system_settings';
COMMENT ON FUNCTION get_platform_fee_type IS 'Retorna o tipo da taxa da plataforma (fixed ou percentage) configurado no system_settings';
