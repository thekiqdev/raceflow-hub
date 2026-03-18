-- ============================================
-- Migration 089: Add platform fee stats to admin dashboard (OK Etapa 4)
-- Taxa de inscrição + taxa de atualização = total taxas da plataforma
-- ============================================

CREATE OR REPLACE VIEW admin_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM events WHERE status IN ('published', 'ongoing')) as active_events,
  (SELECT COUNT(*) FROM events WHERE status = 'draft') as pending_events,
  (SELECT COUNT(DISTINCT p.id) FROM profiles p
   JOIN user_roles ur ON p.id = ur.user_id
   WHERE ur.role = 'runner') as total_runners,
  (SELECT COUNT(DISTINCT p.id) FROM profiles p
   JOIN user_roles ur ON p.id = ur.user_id
   WHERE ur.role = 'runner'
   AND DATE_TRUNC('month', p.created_at) = DATE_TRUNC('month', CURRENT_DATE)) as new_runners_this_month,
  (SELECT COUNT(DISTINCT p.id) FROM profiles p
   JOIN user_roles ur ON p.id = ur.user_id
   WHERE ur.role = 'organizer') as active_organizers,
  0 as pending_organizers,
  (SELECT COALESCE(SUM(total_amount), 0) FROM registrations
   WHERE payment_status = 'paid') as total_revenue,
  (SELECT COALESCE(SUM(total_amount), 0) FROM registrations
   WHERE payment_status = 'paid'
   AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')) as previous_month_revenue,
  (SELECT COUNT(*) FROM registrations WHERE status = 'confirmed') as total_registrations,
  (SELECT COALESCE(SUM(total_amount * 0.05), 0) FROM registrations
   WHERE payment_status = 'paid') as total_commissions,
  (SELECT COUNT(*) FROM events WHERE status = 'finished') as finished_events,
  -- OK Etapa 4: taxas da plataforma (inscrição + atualização)
  (SELECT COALESCE(SUM(platform_fee_amount), 0) FROM registrations
   WHERE payment_status = 'paid') as platform_fee_revenue,
  (SELECT COALESCE(SUM(registration_edit_fee_amount), 0) FROM registrations
   WHERE payment_status = 'paid') as registration_edit_fee_revenue,
  (SELECT COALESCE(SUM(COALESCE(platform_fee_amount, 0) + COALESCE(registration_edit_fee_amount, 0)), 0) FROM registrations
   WHERE payment_status = 'paid') as total_platform_fees;

COMMENT ON VIEW admin_dashboard_stats IS 'OK Etapa 4: Inclui platform_fee_revenue, registration_edit_fee_revenue, total_platform_fees.';