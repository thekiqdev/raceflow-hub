-- ============================================
-- Migration 110: Admin split transfer (nova inscrição + casca transferida)
-- - Liga inscrição origem -> destino (sem alterar runner da origem).
-- - payment_method: admin_transfer (sem nova cobrança).
-- - Views/relatórios: excluem casca (status transferred + transferred_to preenchido)
--   da receita e contagens "pagas", evitando duplicar faturamento.
-- ============================================

ALTER TYPE public.payment_method ADD VALUE IF NOT EXISTS 'admin_transfer';

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS transferred_to_registration_id UUID NULL
    REFERENCES public.registrations(id) ON DELETE SET NULL;

ALTER TABLE public.registrations
  ADD COLUMN IF NOT EXISTS transferred_from_registration_id UUID NULL
    REFERENCES public.registrations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_transferred_to
  ON public.registrations (transferred_to_registration_id)
  WHERE transferred_to_registration_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_registrations_transferred_from
  ON public.registrations (transferred_from_registration_id)
  WHERE transferred_from_registration_id IS NOT NULL;

COMMENT ON COLUMN public.registrations.transferred_to_registration_id IS
  'Quando preenchido em inscrição com status transferred: o titular ativo passou para esta nova inscrição (split super admin). Não contar em receita "paga" nem estoque.';
COMMENT ON COLUMN public.registrations.transferred_from_registration_id IS
  'Inscrição de origem quando esta linha foi criada por transferência administrativa (split).';

-- ========== organizer_dashboard_stats (088) ==========
CREATE OR REPLACE VIEW organizer_dashboard_stats AS
SELECT
    organizer_id,
    (SELECT COUNT(*) FROM events WHERE organizer_id = o.organizer_id AND status = 'published') as active_events,
    (SELECT COUNT(*) FROM events WHERE organizer_id = o.organizer_id AND status = 'draft') as draft_events,
    (SELECT COUNT(*) FROM events WHERE organizer_id = o.organizer_id AND status = 'finished') as finished_events,
    (SELECT COUNT(*) FROM registrations r
     JOIN events e ON r.event_id = e.id
     WHERE e.organizer_id = o.organizer_id
       AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)) as total_registrations,
    (SELECT COUNT(*) FROM registrations r
     JOIN events e ON r.event_id = e.id
     WHERE e.organizer_id = o.organizer_id
     AND r.created_at >= CURRENT_DATE
       AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)) as registrations_today,
    (SELECT COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid'
           AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN
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
      CASE WHEN r.payment_status = 'paid'
           AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN
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

CREATE OR REPLACE VIEW organizer_revenue_by_day AS
SELECT
    e.organizer_id,
    DATE_TRUNC('day', r.created_at) as revenue_date,
    COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid'
           AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN
        CASE WHEN (COALESCE(r.platform_fee_amount, 0) + COALESCE(r.registration_edit_fee_amount, 0)) > 0
          THEN (r.total_amount - COALESCE(r.platform_fee_amount, 0) - COALESCE(r.registration_edit_fee_amount, 0))
          ELSE calculate_value_without_platform_fee(r.total_amount, get_platform_fee(), get_platform_fee_type())
        END
      ELSE 0 END
    ), 0) as revenue
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
  AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
WHERE r.created_at IS NOT NULL
GROUP BY e.organizer_id, DATE_TRUNC('day', r.created_at)
ORDER BY e.organizer_id, revenue_date DESC;

CREATE OR REPLACE VIEW organizer_top_events AS
SELECT
    e.organizer_id,
    e.id as event_id,
    e.title as event_title,
    COUNT(r.id) as registration_count,
    COALESCE(SUM(
      CASE WHEN r.payment_status = 'paid'
           AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN
        CASE WHEN (COALESCE(r.platform_fee_amount, 0) + COALESCE(r.registration_edit_fee_amount, 0)) > 0
          THEN (r.total_amount - COALESCE(r.platform_fee_amount, 0) - COALESCE(r.registration_edit_fee_amount, 0))
          ELSE calculate_value_without_platform_fee(r.total_amount, get_platform_fee(), get_platform_fee_type())
        END
      ELSE 0 END
    ), 0) as revenue
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
  AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
GROUP BY e.organizer_id, e.id, e.title
ORDER BY e.organizer_id, registration_count DESC;

COMMENT ON VIEW organizer_dashboard_stats IS 'Receita líquida; exclui cascas de transferência admin (transferred + transferred_to).';
COMMENT ON VIEW organizer_revenue_by_day IS 'Receita líquida por dia; exclui cascas de transferência admin.';
COMMENT ON VIEW organizer_top_events IS 'Top eventos; contagens excluem cascas de transferência admin.';

-- ========== organizer_registrations_by_day / gender / modality (011) ==========
CREATE OR REPLACE VIEW organizer_registrations_by_day AS
SELECT
    e.organizer_id,
    DATE_TRUNC('day', r.created_at) as registration_date,
    COUNT(r.id) as registration_count
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
  AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
WHERE r.created_at IS NOT NULL
GROUP BY e.organizer_id, DATE_TRUNC('day', r.created_at)
ORDER BY e.organizer_id, registration_date DESC;

CREATE OR REPLACE VIEW organizer_registrations_by_gender AS
SELECT
    e.organizer_id,
    COALESCE(p.gender, 'Não informado') as gender,
    COUNT(r.id) as registration_count
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
  AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
LEFT JOIN profiles p ON r.runner_id = p.id
WHERE r.id IS NOT NULL
GROUP BY e.organizer_id, COALESCE(p.gender, 'Não informado')
ORDER BY e.organizer_id, registration_count DESC;

CREATE OR REPLACE VIEW organizer_registrations_by_modality AS
SELECT
    e.organizer_id,
    COALESCE(ec.name, 'Sem categoria') as modality_name,
    COUNT(r.id) as registration_count
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
  AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
LEFT JOIN event_categories ec ON r.category_id = ec.id
WHERE r.id IS NOT NULL
GROUP BY e.organizer_id, COALESCE(ec.name, 'Sem categoria')
ORDER BY e.organizer_id, registration_count DESC;

-- ========== admin_dashboard_stats (089) ==========
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
   WHERE payment_status = 'paid'
   AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)) as total_revenue,
  (SELECT COALESCE(SUM(total_amount), 0) FROM registrations
   WHERE payment_status = 'paid'
   AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)
   AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')) as previous_month_revenue,
  (SELECT COUNT(*) FROM registrations WHERE status = 'confirmed') as total_registrations,
  (SELECT COALESCE(SUM(total_amount * 0.05), 0) FROM registrations
   WHERE payment_status = 'paid'
   AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)) as total_commissions,
  (SELECT COUNT(*) FROM events WHERE status = 'finished') as finished_events,
  (SELECT COALESCE(SUM(platform_fee_amount), 0) FROM registrations
   WHERE payment_status = 'paid'
   AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)) as platform_fee_revenue,
  (SELECT COALESCE(SUM(registration_edit_fee_amount), 0) FROM registrations
   WHERE payment_status = 'paid'
   AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)) as registration_edit_fee_revenue,
  (SELECT COALESCE(SUM(COALESCE(platform_fee_amount, 0) + COALESCE(registration_edit_fee_amount, 0)), 0) FROM registrations
   WHERE payment_status = 'paid'
   AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)) as total_platform_fees;

COMMENT ON VIEW admin_dashboard_stats IS 'OK Etapa 4 + split admin: receita/taxas excluem cascas transferred->.';

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

CREATE OR REPLACE VIEW admin_revenue_by_month AS
SELECT
  TO_CHAR(DATE_TRUNC('month', created_at), 'Mon') as month,
  TO_CHAR(DATE_TRUNC('month', created_at), 'YYYY-MM') as month_key,
  COALESCE(SUM(total_amount), 0) as faturamento
FROM registrations
WHERE payment_status = 'paid'
AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)
AND created_at >= CURRENT_DATE - INTERVAL '6 months'
GROUP BY DATE_TRUNC('month', created_at)
ORDER BY DATE_TRUNC('month', created_at);

-- ========== report views (009) ==========
CREATE OR REPLACE VIEW report_registrations_by_period AS
SELECT
  DATE_TRUNC('day', r.created_at) as period,
  COUNT(*) FILTER (WHERE NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)) as total_registrations,
  COUNT(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN 1 END) as paid_registrations,
  COUNT(CASE WHEN r.payment_status = 'pending' THEN 1 END) as pending_registrations,
  COUNT(CASE WHEN r.payment_status = 'failed' THEN 1 END) as failed_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    THEN r.total_amount ELSE 0 END), 0) as total_revenue
FROM registrations r
GROUP BY DATE_TRUNC('day', r.created_at)
ORDER BY period DESC;

CREATE OR REPLACE VIEW report_revenue_by_event AS
SELECT
  e.id as event_id,
  e.title as event_title,
  e.event_date,
  p.id as organizer_id,
  p.full_name as organizer_name,
  COUNT(r.id) FILTER (WHERE NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)) as total_registrations,
  COUNT(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN 1 END) as paid_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    THEN r.total_amount ELSE 0 END), 0) as total_revenue,
  COALESCE(AVG(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    THEN r.total_amount END), 0) as avg_ticket
FROM events e
LEFT JOIN profiles p ON e.organizer_id = p.id
LEFT JOIN registrations r ON e.id = r.event_id
GROUP BY e.id, e.title, e.event_date, p.id, p.full_name
ORDER BY total_revenue DESC;

CREATE OR REPLACE VIEW report_top_organizers AS
SELECT
  p.id as organizer_id,
  p.full_name as organizer_name,
  COUNT(DISTINCT e.id) as total_events,
  COUNT(DISTINCT r.id) FILTER (WHERE NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)) as total_registrations,
  COUNT(DISTINCT CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN r.id END) as paid_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    THEN r.total_amount ELSE 0 END), 0) as total_revenue,
  COALESCE(AVG(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    THEN r.total_amount END), 0) as avg_ticket
FROM profiles p
JOIN user_roles ur ON p.id = ur.user_id AND ur.role = 'organizer'
LEFT JOIN events e ON p.id = e.organizer_id
LEFT JOIN registrations r ON e.id = r.event_id
GROUP BY p.id, p.full_name
ORDER BY total_revenue DESC;

CREATE OR REPLACE VIEW report_athlete_behavior AS
SELECT
  p.id as athlete_id,
  p.full_name as athlete_name,
  COUNT(r.id) FILTER (WHERE NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)) as total_registrations,
  COUNT(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN 1 END) as paid_registrations,
  COUNT(CASE WHEN r.payment_status = 'failed' THEN 1 END) as failed_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    THEN r.total_amount ELSE 0 END), 0) as total_spent,
  COALESCE(AVG(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    THEN r.total_amount END), 0) as avg_spent_per_registration,
  MIN(r.created_at) as first_registration,
  MAX(r.created_at) as last_registration
FROM profiles p
JOIN user_roles ur ON p.id = ur.user_id AND ur.role = 'runner'
LEFT JOIN registrations r ON p.id = r.runner_id
GROUP BY p.id, p.full_name
HAVING COUNT(r.id) FILTER (WHERE NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)) > 0
ORDER BY total_registrations DESC;

CREATE OR REPLACE VIEW report_monthly_registration_evolution AS
SELECT
  DATE_TRUNC('month', r.created_at) as month,
  COUNT(*) FILTER (WHERE NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)) as total_registrations,
  COUNT(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN 1 END) as paid_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    THEN r.total_amount ELSE 0 END), 0) as total_revenue,
  LAG(COUNT(*) FILTER (WHERE NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)))
    OVER (ORDER BY DATE_TRUNC('month', r.created_at)) as previous_month_registrations,
  LAG(COALESCE(SUM(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    THEN r.total_amount ELSE 0 END), 0))
    OVER (ORDER BY DATE_TRUNC('month', r.created_at)) as previous_month_revenue
FROM registrations r
GROUP BY DATE_TRUNC('month', r.created_at)
ORDER BY month DESC;

CREATE OR REPLACE VIEW report_event_performance AS
SELECT
  e.id as event_id,
  e.title as event_title,
  e.event_date,
  e.status,
  e.city,
  e.state,
  COUNT(r.id) FILTER (WHERE NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)) as total_registrations,
  COUNT(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN 1 END) as paid_registrations,
  COUNT(CASE WHEN r.payment_status = 'pending' THEN 1 END) as pending_registrations,
  COALESCE(SUM(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    THEN r.total_amount ELSE 0 END), 0) as total_revenue,
  COALESCE(AVG(CASE WHEN r.payment_status = 'paid'
    AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
    THEN r.total_amount END), 0) as avg_ticket,
  CASE
    WHEN COUNT(r.id) FILTER (WHERE NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)) > 0 THEN
      ROUND((COUNT(CASE WHEN r.payment_status = 'paid'
        AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL) THEN 1 END)::numeric
        / COUNT(r.id) FILTER (WHERE NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL))::numeric) * 100, 2)
    ELSE 0
  END as conversion_rate
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
GROUP BY e.id, e.title, e.event_date, e.status, e.city, e.state
ORDER BY total_revenue DESC;
