-- ============================================
-- Migration 020: Fix Admin Dashboard Views
-- Garante que as views do dashboard administrativo existam
-- ============================================

-- View para estatísticas gerais do dashboard
CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT 
  -- Eventos Ativos (published ou ongoing)
  (SELECT COUNT(*) FROM events WHERE status IN ('published', 'ongoing')) as active_events,
  
  -- Eventos Pendentes (draft)
  (SELECT COUNT(*) FROM events WHERE status = 'draft') as pending_events,
  
  -- Total de Atletas (runners)
  (SELECT COUNT(DISTINCT p.id) FROM profiles p 
   JOIN user_roles ur ON p.id = ur.user_id 
   WHERE ur.role = 'runner') as total_runners,
  
  -- Novos atletas este mês
  (SELECT COUNT(DISTINCT p.id) FROM profiles p 
   JOIN user_roles ur ON p.id = ur.user_id 
   WHERE ur.role = 'runner'
   AND DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', CURRENT_DATE)) as new_runners_this_month,
  
  -- Organizadores Ativos
  (SELECT COUNT(DISTINCT p.id) FROM profiles p 
   JOIN user_roles ur ON p.id = ur.user_id 
   WHERE ur.role = 'organizer') as active_organizers,
  
  -- Organizadores Pendentes (será implementado na ETAPA 2)
  0 as pending_organizers,
  
  -- Faturamento Total (registrations pagas)
  (SELECT COALESCE(SUM(total_amount), 0) FROM registrations 
   WHERE payment_status = 'paid') as total_revenue,
  
  -- Faturamento do mês anterior (para comparação)
  (SELECT COALESCE(SUM(total_amount), 0) FROM registrations 
   WHERE payment_status = 'paid'
   AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')) as previous_month_revenue,
  
  -- Inscrições Totais (confirmadas)
  (SELECT COUNT(*) FROM registrations WHERE status = 'confirmed') as total_registrations,
  
  -- Comissões Arrecadadas (5% do faturamento)
  (SELECT COALESCE(SUM(total_amount * 0.05), 0) FROM registrations 
   WHERE payment_status = 'paid') as total_commissions,
  
  -- Eventos Finalizados
  (SELECT COUNT(*) FROM events WHERE status = 'finished') as finished_events;

-- View para dados de gráficos (inscrições por mês)
CREATE OR REPLACE VIEW admin_registrations_by_month AS
SELECT 
  TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') as month,
  TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month_key,
  COUNT(*) as inscricoes
FROM registrations
WHERE status = 'confirmed'
AND created_at >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY DATE_TRUNC('month', created_at);

-- View para dados de gráficos (faturamento por mês)
CREATE OR REPLACE VIEW admin_revenue_by_month AS
SELECT 
  TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') as month,
  TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month_key,
  COALESCE(SUM(total_amount), 0) as faturamento
FROM registrations
WHERE payment_status = 'paid'
AND created_at >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY DATE_TRUNC('month', created_at);

-- Comentários para documentação
COMMENT ON VIEW admin_dashboard_stats IS 'Estatísticas gerais para o dashboard administrativo';
COMMENT ON VIEW admin_registrations_by_month IS 'Inscrições confirmadas agrupadas por mês (últimos 6 meses)';
COMMENT ON VIEW admin_revenue_by_month IS 'Faturamento agrupado por mês (últimos 6 meses)';

