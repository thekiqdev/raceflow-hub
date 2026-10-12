-- Rascunhos privados do comprador. Não cria usuário nem inscrição e não reserva estoque.
CREATE TABLE public.checkout_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  cpf varchar(11) NOT NULL CHECK (cpf ~ '^[0-9]{11}$'),
  full_name text,
  birth_date date,
  gender text CHECK (gender IN ('M', 'F', 'O')),
  identity_source text NOT NULL CHECK (identity_source IN ('account', 'cpf_api', 'manual')),
  gender_locked boolean NOT NULL DEFAULT false,
  email text,
  delivery_mode text NOT NULL DEFAULT 'buyer' CHECK (delivery_mode IN ('buyer', 'email', 'account')),
  ready boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (buyer_id, event_id, cpf),
  CHECK (delivery_mode <> 'email' OR email IS NOT NULL),
  CHECK (identity_source <> 'account' OR (full_name IS NULL AND birth_date IS NULL AND gender IS NULL AND email IS NULL))
);
CREATE INDEX checkout_participants_expiry ON public.checkout_participants(expires_at);
COMMENT ON TABLE public.checkout_participants IS 'Identificação prévia ao pedido; dados isolados por comprador/evento. Referência não concede acesso ao perfil nem a ingressos.';
