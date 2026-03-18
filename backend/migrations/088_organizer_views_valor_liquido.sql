-- ============================================
-- Migration 088: Organizer views use valor líquido (OK Etapa 3)
-- Receita = total_amount - platform_fee_amount - registration_edit_fee_amount
-- Fallback: quando ambas taxas são 0, usa calculate_value_without_platform_fee (dados antigos)
-- ============================================

-- View: organizer_dashboard_stats
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
    (SELECT COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid' THEN
        CASE WHEN (COALESCE(r.platform_fee_amount, 0) + COALESCE(r.registration_edit_fee_amount, 0)) > 0
          THEN (r.total_amount - COALESCE(r.platform_fee_amount, 0) - COALESCE(r.registration_edit_fee_amount, 0))
          ELSE calculate_value_without_platform_fee(r.total_amount, get_platform_fee(), get_platform_fee_type())
        END
      ELSE 0 END
    ), 0) FROM registrations r
     JOIN events e ON r.event_id = e.id
     WHERE e.organizer_id = o.organizer_id
     AND r.payment_status = 'paid') as total_revenue,
    (SELECT COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid' THEN
        CASE WHEN (COALESCE(r.platform_fee_amount, 0) + COALESCE(r.registration_edit_fee_amount, 0)) > 0
          THEN (r.total_amount - COALESCE(r.platform_fee_amount, 0) - COALESCE(r.registration_edit_fee_amount, 0))
          ELSE calculate_value_without_platform_fee(r.total_amount, get_platform_fee(), get_platform_fee_type())
        END
      ELSE 0 END
    ), 0) FROM registrations r
     JOIN events e ON r.event_id = e.id
     WHERE e.organizer_id = o.organizer_id
     AND r.payment_status = 'paid'
     AND r.created_at >= date_trunc('month', CURRENT_DATE)) as revenue_this_month
FROM (
    SELECT DISTINCT organizer_id FROM events
) o;

-- View: organizer_revenue_by_day
CREATE OR REPLACE VIEW organizer_revenue_by_day AS
SELECT
    e.organizer_id,
    DATE_TRUNC('day', r.created_at) as revenue_date,
    COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid' THEN
        CASE WHEN (COALESCE(r.platform_fee_amount, 0) + COALESCE(r.registration_edit_fee_amount, 0)) > 0
          THEN (r.total_amount - COALESCE(r.platform_fee_amount, 0) - COALESCE(r.registration_edit_fee_amount, 0))
          ELSE calculate_value_without_platform_fee(r.total_amount, get_platform_fee(), get_platform_fee_type())
        END
      ELSE 0 END
    ), 0) as revenue
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
WHERE r.created_at IS NOT NULL
GROUP BY e.organizer_id, DATE_TRUNC('day', r.created_at)
ORDER BY e.organizer_id, revenue_date DESC;

-- View: organizer_top_events
CREATE OR REPLACE VIEW organizer_top_events AS
SELECT
    e.organizer_id,
    e.id as event_id,
    e.title as event_title,
    COUNT(r.id) as registration_count,
    COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid' THEN
        CASE WHEN (COALESCE(r.platform_fee_amount, 0) + COALESCE(r.registration_edit_fee_amount, 0)) > 0
          THEN (r.total_amount - COALESCE(r.platform_fee_amount, 0) - COALESCE(r.registration_edit_fee_amount, 0))
          ELSE calculate_value_without_platform_fee(r.total_amount, get_platform_fee(), get_platform_fee_type())
        END
      ELSE 0 END
    ), 0) as revenue
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
GROUP BY e.organizer_id, e.id, e.title
ORDER BY e.organizer_id, registration_count DESC;

COMMENT ON VIEW organizer_dashboard_stats IS 'OK Etapa 3: Receita = valor líquido (total - taxa inscrição - taxa atualização). Fallback para dados antigos.';
COMMENT ON VIEW organizer_revenue_by_day IS 'OK Etapa 3: Receita por dia = valor líquido por inscrição paga.';
COMMENT ON VIEW organizer_top_events IS 'OK Etapa 3: Top eventos por receita (valor líquido).';
