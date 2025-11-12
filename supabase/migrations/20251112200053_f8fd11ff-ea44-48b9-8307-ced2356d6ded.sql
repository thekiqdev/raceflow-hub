-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'organizer', 'runner');

-- Create enum for event status
CREATE TYPE public.event_status AS ENUM ('draft', 'published', 'ongoing', 'finished', 'cancelled');

-- Create enum for registration status
CREATE TYPE public.registration_status AS ENUM ('pending', 'confirmed', 'cancelled', 'refund_requested', 'refunded');

-- Create enum for payment status
CREATE TYPE public.payment_status AS ENUM ('pending', 'paid', 'refunded', 'failed');

-- Create profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  phone TEXT NOT NULL,
  gender TEXT,
  birth_date DATE NOT NULL,
  lgpd_consent BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, role)
);

-- Create events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_date DATE NOT NULL,
  location TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  banner_url TEXT,
  regulation_url TEXT,
  status event_status DEFAULT 'draft',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create event_categories table (modalidades)
CREATE TABLE public.event_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  distance TEXT NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  max_participants INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create event_kits table
CREATE TABLE public.event_kits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create registrations table
CREATE TABLE public.registrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  runner_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  registered_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  category_id UUID REFERENCES public.event_categories(id) ON DELETE CASCADE NOT NULL,
  kit_id UUID REFERENCES public.event_kits(id) ON DELETE CASCADE,
  status registration_status DEFAULT 'pending',
  payment_status payment_status DEFAULT 'pending',
  total_amount DECIMAL(10,2) NOT NULL,
  confirmation_code TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- Create security definer function to check user roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view all roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage all roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for events
CREATE POLICY "Everyone can view published events"
  ON public.events FOR SELECT
  TO authenticated
  USING (status = 'published' OR organizer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can create events"
  ON public.events FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'organizer') OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Organizers can update own events"
  ON public.events FOR UPDATE
  TO authenticated
  USING (organizer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete events"
  ON public.events FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for event_categories
CREATE POLICY "Everyone can view categories of visible events"
  ON public.event_categories FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_id
      AND (events.status = 'published' OR events.organizer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Organizers can manage categories for own events"
  ON public.event_categories FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_id
      AND (events.organizer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- RLS Policies for event_kits
CREATE POLICY "Everyone can view kits of visible events"
  ON public.event_kits FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_id
      AND (events.status = 'published' OR events.organizer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

CREATE POLICY "Organizers can manage kits for own events"
  ON public.event_kits FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_id
      AND (events.organizer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
    )
  );

-- RLS Policies for registrations
CREATE POLICY "Users can view own registrations"
  ON public.registrations FOR SELECT
  TO authenticated
  USING (
    runner_id = auth.uid() 
    OR registered_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_id AND events.organizer_id = auth.uid()
    )
  );

CREATE POLICY "Runners can create registrations"
  ON public.registrations FOR INSERT
  TO authenticated
  WITH CHECK (registered_by = auth.uid());

CREATE POLICY "Users can update own registrations"
  ON public.registrations FOR UPDATE
  TO authenticated
  USING (
    runner_id = auth.uid()
    OR registered_by = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR EXISTS (
      SELECT 1 FROM public.events
      WHERE events.id = event_id AND events.organizer_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Triggers for updated_at
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

-- Function to handle new user profile creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Default new users to 'runner' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'runner');
  RETURN NEW;
END;
$$;

-- Trigger to create user role on profile creation
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();