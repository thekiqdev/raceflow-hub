-- ============================================
-- Migration 009: Reports Views
-- Views para geração de relatórios avançados
-- ============================================

-- View: Registrations by Period
CREATE OR REPLACE VIEW report_registrations_by_period AS
SELECT 
  DATE_TRUNC('day', r.created_at) as period,
  COUNT(*) as total_registrations,
  COUNT(CASE WHEN r.payment_status = 'paid' THEN 1 END) as paid_registrations,
  COUNT(CASE WHEN r.payment_status = 'pending' THEN 1 END) as pending_registrations,
  COUNT(CASE WHEN r.payment_status = 'failed' THEN 1 END) as failed_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0) as total_revenue
FROM registrations r
GROUP BY DATE_TRUNC('day', r.created_at)
ORDER BY period DESC;

-- View: New Users by Month
CREATE OR REPLACE VIEW report_new_users_by_month AS
SELECT 
  DATE_TRUNC('month', p.created_at) as month,
  COUNT(*) as total_users,
  COUNT(CASE WHEN ur.role = 'runner' THEN 1 END) as runners,
  COUNT(CASE WHEN ur.role = 'organizer' THEN 1 END) as organizers,
  COUNT(CASE WHEN ur.role = 'admin' THEN 1 END) as admins
FROM profiles p
LEFT JOIN user_roles ur ON p.id = ur.user_id
GROUP BY DATE_TRUNC('month', p.created_at)
ORDER BY month DESC;

-- View: Revenue by Event and Organizer
CREATE OR REPLACE VIEW report_revenue_by_event AS
SELECT 
  e.id as event_id,
  e.title as event_title,
  e.event_date,
  p.id as organizer_id,
  p.full_name as organizer_name,
  COUNT(r.id) as total_registrations,
  COUNT(CASE WHEN r.payment_status = 'paid' THEN 1 END) as paid_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0) as total_revenue,
  COALESCE(AVG(CASE WHEN r.payment_status = 'paid' THEN r.total_amount END), 0) as avg_ticket
FROM events e
LEFT JOIN profiles p ON e.organizer_id = p.id
LEFT JOIN registrations r ON e.id = r.event_id
GROUP BY e.id, e.title, e.event_date, p.id, p.full_name
ORDER BY total_revenue DESC;

-- View: Top Organizers Ranking
CREATE OR REPLACE VIEW report_top_organizers AS
SELECT 
  p.id as organizer_id,
  p.full_name as organizer_name,
  COUNT(DISTINCT e.id) as total_events,
  COUNT(DISTINCT r.id) as total_registrations,
  COUNT(DISTINCT CASE WHEN r.payment_status = 'paid' THEN r.id END) as paid_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0) as total_revenue,
  COALESCE(AVG(CASE WHEN r.payment_status = 'paid' THEN r.total_amount END), 0) as avg_ticket
FROM profiles p
JOIN user_roles ur ON p.id = ur.user_id AND ur.role = 'organizer'
LEFT JOIN events e ON p.id = e.organizer_id
LEFT JOIN registrations r ON e.id = r.event_id
GROUP BY p.id, p.full_name
ORDER BY total_revenue DESC;

-- View: Athlete Registration Behavior
CREATE OR REPLACE VIEW report_athlete_behavior AS
SELECT 
  p.id as athlete_id,
  p.full_name as athlete_name,
  COUNT(r.id) as total_registrations,
  COUNT(CASE WHEN r.payment_status = 'paid' THEN 1 END) as paid_registrations,
  COUNT(CASE WHEN r.payment_status = 'failed' THEN 1 END) as failed_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0) as total_spent,
  COALESCE(AVG(CASE WHEN r.payment_status = 'paid' THEN r.total_amount END), 0) as avg_spent_per_registration,
  MIN(r.created_at) as first_registration,
  MAX(r.created_at) as last_registration
FROM profiles p
JOIN user_roles ur ON p.id = ur.user_id AND ur.role = 'runner'
LEFT JOIN registrations r ON p.id = r.runner_id
GROUP BY p.id, p.full_name
HAVING COUNT(r.id) > 0
ORDER BY total_registrations DESC;

-- View: Monthly Registration Evolution
CREATE OR REPLACE VIEW report_monthly_registration_evolution AS
SELECT 
  DATE_TRUNC('month', r.created_at) as month,
  COUNT(*) as total_registrations,
  COUNT(CASE WHEN r.payment_status = 'paid' THEN 1 END) as paid_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0) as total_revenue,
  LAG(COUNT(*)) OVER (ORDER BY DATE_TRUNC('month', r.created_at)) as previous_month_registrations,
  LAG(COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0)) 
    OVER (ORDER BY DATE_TRUNC('month', r.created_at)) as previous_month_revenue
FROM registrations r
GROUP BY DATE_TRUNC('month', r.created_at)
ORDER BY month DESC;

-- View: Event Performance Summary
CREATE OR REPLACE VIEW report_event_performance AS
SELECT 
  e.id as event_id,
  e.title as event_title,
  e.event_date,
  e.status,
  e.city,
  e.state,
  COUNT(r.id) as total_registrations,
  COUNT(CASE WHEN r.payment_status = 'paid' THEN 1 END) as paid_registrations,
  COUNT(CASE WHEN r.payment_status = 'pending' THEN 1 END) as pending_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0) as total_revenue,
  COALESCE(AVG(CASE WHEN r.payment_status = 'paid' THEN r.total_amount END), 0) as avg_ticket,
  CASE 
    WHEN COUNT(r.id) > 0 THEN 
      ROUND((COUNT(CASE WHEN r.payment_status = 'paid' THEN 1 END)::numeric / COUNT(r.id)::numeric) * 100, 2)
    ELSE 0 
  END as conversion_rate
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
GROUP BY e.id, e.title, e.event_date, e.status, e.city, e.state
ORDER BY total_revenue DESC;

-- Comentários para documentação
COMMENT ON VIEW report_registrations_by_period IS 'Relatório de inscrições por período (dia)';
COMMENT ON VIEW report_new_users_by_month IS 'Relatório de novos usuários por mês';
COMMENT ON VIEW report_revenue_by_event IS 'Relatório de receita por evento e organizador';
COMMENT ON VIEW report_top_organizers IS 'Ranking de organizadores mais ativos';
COMMENT ON VIEW report_athlete_behavior IS 'Comportamento e estatísticas dos atletas';
COMMENT ON VIEW report_monthly_registration_evolution IS 'Evolução mensal de inscrições';
COMMENT ON VIEW report_event_performance IS 'Performance e estatísticas dos eventos';

