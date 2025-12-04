-- Migration: Query optimizations
-- Created: 2024-01-01
-- Description: Optimizations and improvements to database queries

-- Add partial index for published events (most common query)
CREATE INDEX IF NOT EXISTS idx_events_published ON events(event_date DESC) 
WHERE status = 'published';

-- Add partial index for active registrations
CREATE INDEX IF NOT EXISTS idx_registrations_active ON registrations(created_at DESC)
WHERE status IN ('pending', 'confirmed');

-- Add covering index for common event queries
CREATE INDEX IF NOT EXISTS idx_events_covering ON events(id, status, event_date, city, state, organizer_id)
WHERE status = 'published';

-- Analyze tables to update statistics
ANALYZE users;
ANALYZE profiles;
ANALYZE events;
ANALYZE registrations;
ANALYZE user_roles;
ANALYZE event_categories;
ANALYZE event_kits;

-- Vacuum to reclaim storage
VACUUM ANALYZE;





