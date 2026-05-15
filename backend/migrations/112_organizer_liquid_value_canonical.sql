-- ============================================
-- Migration 112: Valor líquido canônico nas views do organizador
-- Fallback legado SOMENTE quando platform_fee_amount E registration_edit_fee_amount são NULL
-- (taxa 0 persistida é válida — não usar COALESCE(...) > 0)
-- ============================================

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
      CASE WHEN r.payment_status = 'paid'
        AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN
        CASE WHEN r.platform_fee_amount IS NOT NULL OR r.registration_edit_fee_amount IS NOT NULL THEN
          GREATEST(0, ROUND(
            (r.total_amount - COALESCE(r.platform_fee_amount, 0) - COALESCE(r.registration_edit_fee_amount, 0))::numeric,
            2
          ))
        ELSE
          calculate_value_without_platform_fee(r.total_amount, get_platform_fee(), get_platform_fee_type())
        END
      ELSE 0 END
    ), 0) FROM registrations r
     JOIN events e ON r.event_id = e.id
     WHERE e.organizer_id = o.organizer_id
     AND r.payment_status = 'paid') as total_revenue,
    (SELECT COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid'
        AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN
        CASE WHEN r.platform_fee_amount IS NOT NULL OR r.registration_edit_fee_amount IS NOT NULL THEN
          GREATEST(0, ROUND(
            (r.total_amount - COALESCE(r.platform_fee_amount, 0) - COALESCE(r.registration_edit_fee_amount, 0))::numeric,
            2
          ))
        ELSE
          calculate_value_without_platform_fee(r.total_amount, get_platform_fee(), get_platform_fee_type())
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

CREATE OR REPLACE VIEW organizer_revenue_by_day AS
SELECT
    e.organizer_id,
    DATE_TRUNC('day', r.created_at) as revenue_date,
    COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid'
        AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN
        CASE WHEN r.platform_fee_amount IS NOT NULL OR r.registration_edit_fee_amount IS NOT NULL THEN
          GREATEST(0, ROUND(
            (r.total_amount - COALESCE(r.platform_fee_amount, 0) - COALESCE(r.registration_edit_fee_amount, 0))::numeric,
            2
          ))
        ELSE
          calculate_value_without_platform_fee(r.total_amount, get_platform_fee(), get_platform_fee_type())
        END
      ELSE 0 END
    ), 0) as revenue
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
WHERE r.created_at IS NOT NULL
GROUP BY e.organizer_id, DATE_TRUNC('day', r.created_at)
ORDER BY e.organizer_id, revenue_date DESC;

CREATE OR REPLACE VIEW organizer_top_events AS
SELECT
    e.organizer_id,
    e.id as event_id,
    e.title as event_title,
    COUNT(r.id) FILTER (
      WHERE NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    ) as registration_count,
    COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid'
        AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN
        CASE WHEN r.platform_fee_amount IS NOT NULL OR r.registration_edit_fee_amount IS NOT NULL THEN
          GREATEST(0, ROUND(
            (r.total_amount - COALESCE(r.platform_fee_amount, 0) - COALESCE(r.registration_edit_fee_amount, 0))::numeric,
            2
          ))
        ELSE
          calculate_value_without_platform_fee(r.total_amount, get_platform_fee(), get_platform_fee_type())
        END
      ELSE 0 END
    ), 0) as revenue
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
GROUP BY e.organizer_id, e.id, e.title
ORDER BY e.organizer_id, registration_count DESC;

COMMENT ON VIEW organizer_dashboard_stats IS 'Receita organizador: total - taxas persistidas; fallback legado só se ambas taxas NULL';
COMMENT ON VIEW organizer_revenue_by_day IS 'Receita diária organizador (regra canônica de taxas)';
COMMENT ON VIEW organizer_top_events IS 'Top eventos organizador (regra canônica de taxas)';
