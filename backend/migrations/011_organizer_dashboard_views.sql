-- Migration: Organizer Dashboard Views
-- Description: Creates views for organizer dashboard statistics and charts

-- View: organizer_dashboard_stats
-- Provides main metrics for organizer dashboard
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
    (SELECT COALESCE(SUM(r.total_amount), 0) FROM registrations r 
     JOIN events e ON r.event_id = e.id 
     WHERE e.organizer_id = o.organizer_id 
     AND r.payment_status = 'paid') as total_revenue,
    (SELECT COALESCE(SUM(r.total_amount), 0) FROM registrations r 
     JOIN events e ON r.event_id = e.id 
     WHERE e.organizer_id = o.organizer_id 
     AND r.payment_status = 'paid' 
     AND r.created_at >= date_trunc('month', CURRENT_DATE)) as revenue_this_month
FROM (
    SELECT DISTINCT organizer_id FROM events
) o;

-- View: organizer_registrations_by_day
-- Provides daily registration counts for the last N days
CREATE OR REPLACE VIEW organizer_registrations_by_day AS
SELECT
    e.organizer_id,
    DATE_TRUNC('day', r.created_at) as registration_date,
    COUNT(r.id) as registration_count
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
WHERE r.created_at IS NOT NULL
GROUP BY e.organizer_id, DATE_TRUNC('day', r.created_at)
ORDER BY e.organizer_id, registration_date DESC;

-- View: organizer_revenue_by_day
-- Provides daily revenue for the last N days
CREATE OR REPLACE VIEW organizer_revenue_by_day AS
SELECT
    e.organizer_id,
    DATE_TRUNC('day', r.created_at) as revenue_date,
    COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0) as revenue
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
WHERE r.created_at IS NOT NULL
GROUP BY e.organizer_id, DATE_TRUNC('day', r.created_at)
ORDER BY e.organizer_id, revenue_date DESC;

-- View: organizer_registrations_by_gender
-- Provides registration counts by gender
CREATE OR REPLACE VIEW organizer_registrations_by_gender AS
SELECT
    e.organizer_id,
    COALESCE(p.gender, 'Não informado') as gender,
    COUNT(r.id) as registration_count
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
LEFT JOIN profiles p ON r.runner_id = p.id
WHERE r.id IS NOT NULL
GROUP BY e.organizer_id, COALESCE(p.gender, 'Não informado')
ORDER BY e.organizer_id, registration_count DESC;

-- View: organizer_registrations_by_modality
-- Provides registration counts by event category/modality
CREATE OR REPLACE VIEW organizer_registrations_by_modality AS
SELECT
    e.organizer_id,
    COALESCE(ec.name, 'Sem categoria') as modality_name,
    COUNT(r.id) as registration_count
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
LEFT JOIN event_categories ec ON r.category_id = ec.id
WHERE r.id IS NOT NULL
GROUP BY e.organizer_id, COALESCE(ec.name, 'Sem categoria')
ORDER BY e.organizer_id, registration_count DESC;

-- View: organizer_top_events
-- Provides top events by registration count
CREATE OR REPLACE VIEW organizer_top_events AS
SELECT
    e.organizer_id,
    e.id as event_id,
    e.title as event_title,
    COUNT(r.id) as registration_count,
    COALESCE(SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END), 0) as revenue
FROM events e
LEFT JOIN registrations r ON e.id = r.event_id
GROUP BY e.organizer_id, e.id, e.title
ORDER BY e.organizer_id, registration_count DESC;

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_events_organizer_id ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at);
CREATE INDEX IF NOT EXISTS idx_registrations_payment_status ON registrations(payment_status);

COMMENT ON VIEW organizer_dashboard_stats IS 'Main statistics for organizer dashboard';
COMMENT ON VIEW organizer_registrations_by_day IS 'Daily registration counts for organizer';
COMMENT ON VIEW organizer_revenue_by_day IS 'Daily revenue for organizer';
COMMENT ON VIEW organizer_registrations_by_gender IS 'Registration counts by gender for organizer';
COMMENT ON VIEW organizer_registrations_by_modality IS 'Registration counts by modality for organizer';
COMMENT ON VIEW organizer_top_events IS 'Top events by registration count for organizer';




