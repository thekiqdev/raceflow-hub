ALTER TABLE checkout_orders DROP CONSTRAINT checkout_orders_status_check;
ALTER TABLE checkout_orders ADD CONSTRAINT checkout_orders_status_check CHECK
  (status IN ('draft','reviewed','reserved','awaiting_payment','confirmed','cancelled','expired','needs_review','refunded'));

CREATE TABLE checkout_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES checkout_orders(id),
  request_key uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('PIX','CREDIT_CARD','FREE')),
  status text NOT NULL CHECK (status IN ('preparing','creating','unknown','pending','paid','failed','cancelled','refunded','review')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  customer_id text,
  provider_id text UNIQUE,
  provider_status text,
  invoice_url text,
  cancel_requested boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL,
  checked_at timestamptz,
  issue text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,request_key)
);
CREATE UNIQUE INDEX checkout_one_active_payment ON checkout_payment_attempts(order_id)
  WHERE status NOT IN ('failed','cancelled');
CREATE INDEX checkout_payment_reconcile ON checkout_payment_attempts(checked_at NULLS FIRST);

-- Um pagamento, várias alocações. Nunca duplicar a cobrança em asaas_payments por atleta.
CREATE TABLE checkout_payment_allocations (
  registration_id uuid PRIMARY KEY REFERENCES registrations(id),
  attempt_id uuid NOT NULL REFERENCES checkout_payment_attempts(id),
  gross_cents bigint NOT NULL CHECK (gross_cents >= 0),
  platform_fee_cents bigint NOT NULL CHECK (platform_fee_cents >= 0),
  refunded_cents bigint NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0 AND refunded_cents <= gross_cents),
  settled_at timestamptz
);
CREATE TABLE checkout_payment_events (
  event_key text PRIMARY KEY,
  attempt_id uuid NOT NULL REFERENCES checkout_payment_attempts(id),
  event_type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE TABLE checkout_payment_effects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id uuid NOT NULL REFERENCES registrations(id),
  kind text NOT NULL CHECK (kind IN ('confirmed','refunded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(registration_id,kind)
);
CREATE TABLE checkout_payment_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES checkout_payment_attempts(id),
  registration_id uuid NOT NULL REFERENCES registrations(id),
  request_key uuid NOT NULL,
  requested_by uuid NOT NULL REFERENCES users(id),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL CHECK (status IN ('sending','unknown','pending','done','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(attempt_id,request_key)
);
CREATE UNIQUE INDEX checkout_one_refund_per_item ON checkout_payment_refunds(registration_id) WHERE status <> 'failed';
CREATE UNIQUE INDEX checkout_one_unresolved_refund ON checkout_payment_refunds(attempt_id) WHERE status IN ('sending','unknown','pending');
COMMENT ON TABLE checkout_payment_effects IS 'Outbox idempotente para entrega e comissões por inscrição; consumidor integrado na etapa de entrega.';
