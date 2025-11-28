-- Add payment_method column to registrations table
CREATE TYPE public.payment_method AS ENUM ('pix', 'credit_card', 'boleto');

ALTER TABLE public.registrations 
ADD COLUMN payment_method payment_method;

-- Add index for better query performance
CREATE INDEX idx_registrations_payment_method ON public.registrations(payment_method);
CREATE INDEX idx_registrations_event_id ON public.registrations(event_id);