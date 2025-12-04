-- Migration: Add indexes for performance optimization
-- Created: 2024-01-01
-- Description: Adds indexes to improve query performance

-- Indexes for users table
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- Indexes for profiles table
CREATE INDEX IF NOT EXISTS idx_profiles_user_id ON profiles(id);
CREATE INDEX IF NOT EXISTS idx_profiles_cpf ON profiles(cpf);

-- Indexes for events table
CREATE INDEX IF NOT EXISTS idx_events_organizer_id ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_status ON events(status);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_city ON events(city);
CREATE INDEX IF NOT EXISTS idx_events_state ON events(state);
CREATE INDEX IF NOT EXISTS idx_events_city_state ON events(city, state);
CREATE INDEX IF NOT EXISTS idx_events_status_date ON events(status, event_date);

-- Indexes for registrations table
CREATE INDEX IF NOT EXISTS idx_registrations_event_id ON registrations(event_id);
CREATE INDEX IF NOT EXISTS idx_registrations_runner_id ON registrations(runner_id);
CREATE INDEX IF NOT EXISTS idx_registrations_registered_by ON registrations(registered_by);
CREATE INDEX IF NOT EXISTS idx_registrations_status ON registrations(status);
CREATE INDEX IF NOT EXISTS idx_registrations_payment_status ON registrations(payment_status);
CREATE INDEX IF NOT EXISTS idx_registrations_event_runner ON registrations(event_id, runner_id);
CREATE INDEX IF NOT EXISTS idx_registrations_created_at ON registrations(created_at);

-- Indexes for user_roles table
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role ON user_roles(role);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON user_roles(user_id, role);

-- Indexes for event_categories table
CREATE INDEX IF NOT EXISTS idx_event_categories_event_id ON event_categories(event_id);

-- Indexes for event_kits table
CREATE INDEX IF NOT EXISTS idx_event_kits_event_id ON event_kits(event_id);

-- Indexes for category_batches table
CREATE INDEX IF NOT EXISTS idx_category_batches_category_id ON category_batches(category_id);

-- Indexes for kit_products table
CREATE INDEX IF NOT EXISTS idx_kit_products_kit_id ON kit_products(kit_id);

-- Indexes for product_variants table
CREATE INDEX IF NOT EXISTS idx_product_variants_product_id ON product_variants(product_id);

-- Indexes for kit_pickup_locations table
CREATE INDEX IF NOT EXISTS idx_kit_pickup_locations_event_id ON kit_pickup_locations(event_id);

-- Comments
COMMENT ON INDEX idx_events_organizer_id IS 'Index for filtering events by organizer';
COMMENT ON INDEX idx_events_status IS 'Index for filtering events by status';
COMMENT ON INDEX idx_events_city_state IS 'Composite index for filtering by city and state';
COMMENT ON INDEX idx_registrations_event_runner IS 'Composite index for filtering registrations by event and runner';





