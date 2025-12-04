-- ============================================
-- Migration 001: Initial Schema
-- Adaptado do Supabase para PostgreSQL puro
-- ============================================

-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'organizer', 'runner');

-- Create enum for event status
CREATE TYPE public.event_status AS ENUM ('draft', 'published', 'ongoing', 'finished', 'cancelled');

-- Create enum for registration status
CREATE TYPE public.registration_status AS ENUM ('pending', 'confirmed', 'cancelled', 'refund_requested', 'refunded');

-- Create enum for payment status
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'refunded', 'failed');

-- Create enum for payment method
CREATE TYPE public.payment_method AS ENUM ('pix', 'credit_card', 'boleto');

-- ============================================
-- Users Table (substitui auth.users do Supabase)
-- ============================================
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on email for faster lookups
CREATE INDEX idx_users_email ON public.users(email);

-- ============================================
-- Profiles Table
-- ============================================
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  gender TEXT,
  birth_date DATE NOT NULL,
  lgpd_consent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index on cpf for faster lookups
CREATE INDEX idx_profiles_cpf ON public.profiles(cpf);

-- ============================================
-- User Roles Table
-- ============================================
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create index for faster role lookups
CREATE INDEX idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX idx_user_roles_role ON public.user_roles(role);

-- ============================================
-- Events Table
-- ============================================
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date TIMESTAMP WITH TIME ZONE NOT NULL,
  location TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  banner_url TEXT,
  regulation_url TEXT,
  result_url TEXT,
  status event_status DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for events
CREATE INDEX idx_events_organizer_id ON public.events(organizer_id);
CREATE INDEX idx_events_status ON public.events(status);
CREATE INDEX idx_events_event_date ON public.events(event_date);
CREATE INDEX idx_events_city_state ON public.events(city, state);

-- ============================================
-- Event Categories Table
-- ============================================
CREATE TABLE public.event_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  distance TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  max_participants INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster category lookups
CREATE INDEX idx_event_categories_event_id ON public.event_categories(event_id);

-- ============================================
-- Category Batches Table (Lotes de Preço)
-- ============================================
CREATE TABLE public.category_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.event_categories(id) ON DELETE CASCADE NOT NULL,
  price NUMERIC NOT NULL,
  valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT positive_price CHECK (price >= 0)
);

-- Create indexes for category batches
CREATE INDEX idx_category_batches_category_id ON public.category_batches(category_id);
CREATE INDEX idx_category_batches_valid_from ON public.category_batches(valid_from);

-- ============================================
-- Event Kits Table
-- ============================================
CREATE TABLE public.event_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for faster kit lookups
CREATE INDEX idx_event_kits_event_id ON public.event_kits(event_id);

-- ============================================
-- Kit Products Table
-- ============================================
CREATE TABLE public.kit_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id UUID REFERENCES public.event_kits(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK (type IN ('variable', 'unique')),
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for kit products
CREATE INDEX idx_kit_products_kit_id ON public.kit_products(kit_id);

-- ============================================
-- Product Variants Table
-- ============================================
CREATE TABLE public.product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES public.kit_products(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for product variants
CREATE INDEX idx_product_variants_product_id ON public.product_variants(product_id);

-- ============================================
-- Kit Pickup Locations Table
-- ============================================
CREATE TABLE public.kit_pickup_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  address TEXT NOT NULL,
  pickup_date TIMESTAMP WITH TIME ZONE NOT NULL,
  latitude NUMERIC,
  longitude NUMERIC,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for pickup locations
CREATE INDEX idx_kit_pickup_locations_event_id ON public.kit_pickup_locations(event_id);

-- ============================================
-- Registrations Table
-- ============================================
CREATE TABLE public.registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  runner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  registered_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.event_categories(id) ON DELETE CASCADE NOT NULL,
  kit_id UUID REFERENCES public.event_kits(id) ON DELETE CASCADE,
  status registration_status DEFAULT 'pending',
  payment_status payment_status DEFAULT 'pending',
  payment_method payment_method,
  total_amount DECIMAL(10,2) NOT NULL,
  confirmation_code TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for registrations
CREATE INDEX idx_registrations_event_id ON public.registrations(event_id);
CREATE INDEX idx_registrations_runner_id ON public.registrations(runner_id);
CREATE INDEX idx_registrations_registered_by ON public.registrations(registered_by);
CREATE INDEX idx_registrations_category_id ON public.registrations(category_id);
CREATE INDEX idx_registrations_status ON public.registrations(status);
CREATE INDEX idx_registrations_payment_status ON public.registrations(payment_status);
CREATE INDEX idx_registrations_payment_method ON public.registrations(payment_method);
CREATE INDEX idx_registrations_confirmation_code ON public.registrations(confirmation_code);

-- ============================================
-- Home Page Settings Table
-- ============================================
CREATE TABLE public.home_page_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hero_title TEXT NOT NULL DEFAULT 'Agende seu Próximo Evento Esportivo',
  hero_subtitle TEXT DEFAULT 'Gestão completa de cronometragem e inscrições para corridas e eventos esportivos',
  hero_image_url TEXT,
  whatsapp_number TEXT DEFAULT '+5511999999999',
  whatsapp_text TEXT DEFAULT 'Entre em contato via WhatsApp',
  consultoria_title TEXT DEFAULT 'Consultoria Especializada em Eventos Esportivos',
  consultoria_description TEXT DEFAULT 'Nossa equipe oferece consultoria completa para organização de eventos esportivos',
  stats_events TEXT DEFAULT '500+',
  stats_events_label TEXT DEFAULT 'Eventos Realizados',
  stats_runners TEXT DEFAULT '50k+',
  stats_runners_label TEXT DEFAULT 'Corredores Atendidos',
  stats_cities TEXT DEFAULT '100+',
  stats_cities_label TEXT DEFAULT 'Cidades',
  stats_years TEXT DEFAULT '10+',
  stats_years_label TEXT DEFAULT 'Anos de Experiência',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- Functions
-- ============================================

-- Function to check if user has a specific role
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Function to handle new user profile creation (creates default 'runner' role)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Default new users to 'runner' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'runner')
  ON CONFLICT (user_id, role) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ============================================
-- Triggers
-- ============================================

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_registrations_updated_at
  BEFORE UPDATE ON public.registrations
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_home_page_settings_updated_at
  BEFORE UPDATE ON public.home_page_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Trigger to create user role on profile creation
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Insert default home page settings
-- ============================================
INSERT INTO public.home_page_settings (id)
VALUES ('00000000-0000-0000-0000-000000000001')
ON CONFLICT DO NOTHING;





