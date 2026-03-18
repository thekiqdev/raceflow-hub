-- ============================================
-- Migration 076: Update organizer views to use value without platform fee
-- Atualiza as views do organizador para usar valor sem taxa da plataforma
-- ============================================

-- View: organizer_dashboard_stats
-- Atualizada para calcular revenue sem taxa da plataforma
CREATE OR REPLACE VIEW organizer_dashboard_stats AS
SELECT
    organizer_id,
    (SELECT COUNT(*) FROM events WHERE organizer_id = o.organizer_id AND status = 'published') as active_events,
    (SELECT COUNT(*) FROM events WHERE organizer_id = o.organizer_id AND status = 'draft') as draft_events,
    (SELECT COUNT(*) FROM events WHERE organizer_id = o.organizer_id AND status = 'finished') as finished_events,
    (SELECT COUNT(*) FROM registrations r 
     JOIN events e ON r.event_id = e.id 
     WHERE e.organizer_id = o.organizer_id) as total_registrations,
    (SELECT COUNT(*) FROM registrations r 
     JOIN events e ON r.event_id = e.id 
     WHERE e.organizer_id = o.organizer_id 
     AND r.created_at >= CURRENT_DATE) as registrations_today,
    -- Total revenue sem taxa da plataforma
    (SELECT COALESCE(SUM(
      calculate_value_without_platform_fee(
        r.total_amount,
        get_platform_fee(),
        get_platform_fee_type()
      )
    ), 0) FROM registrations r 
     JOIN events e ON r.event_id = e.id 
     WHERE e.organizer_id = o.organizer_id 
     AND r.payment_status = 'paid') as total_revenue,
    -- Revenue deste mês sem taxa da plataforma
    (SELECT COALESCE(SUM(
      calculate_value_without_platform_fee(
        r.total_amount,
        get_platform_fee(),
        get_platform_fee_type()
      )
    ), 0) FROM registrations r 
     JOIN events e ON r.event_id = e.id 
     WHERE e.organizer_id = o.organizer_id 
     AND r.payment_status = 'paid' 
     AND r.created_at >= date_trunc('month', CURRENT_DATE)) as revenue_this_month
FROM (
    SELECT DISTINCT organizer_id FROM events
) o;

-- View: organizer_revenue_by_day
-- Atualizada para calcular revenue sem taxa da plataforma
CREATE OR REPLACE VIEW organizer_revenue_by_day AS
SELECT
    e.organizer_id,
    DATE_TRUNC('day', r.created_at) as revenue_date,
    COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid' THEN
        calculate_value_without_platform_fee(
          r.total_amount,
          get_platform_fee(),
          get_platform_fee_type()
        )
      ELSE 0 END
    ), 0) as revenue
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
WHERE r.created_at IS NOT NULL
GROUP BY e.organizer_id, DATE_TRUNC('day', r.created_at)
ORDER BY e.organizer_id, revenue_date DESC;

-- View: organizer_top_events
-- Atualizada para calcular revenue sem taxa da plataforma
CREATE OR REPLACE VIEW organizer_top_events AS
SELECT
    e.organizer_id,
    e.id as event_id,
    e.title as event_title,
    COUNT(r.id) as registration_count,
    COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid' THEN
        calculate_value_without_platform_fee(
          r.total_amount,
          get_platform_fee(),
          get_platform_fee_type()
        )
      ELSE 0 END
    ), 0) as revenue
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
GROUP BY e.organizer_id, e.id, e.title
ORDER BY e.organizer_id, registration_count DESC;

-- Comentários atualizados
COMMENT ON VIEW organizer_dashboard_stats IS 'Main statistics for organizer dashboard (revenue values exclude platform fee)';
COMMENT ON VIEW organizer_revenue_by_day IS 'Daily revenue for organizer (values exclude platform fee)';
COMMENT ON VIEW organizer_top_events IS 'Top events by registration count for organizer (revenue values exclude platform fee)';
