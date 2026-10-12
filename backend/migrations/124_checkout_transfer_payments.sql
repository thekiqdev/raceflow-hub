-- Somente transferências de ingressos de pedidos; histórico legado permanece intacto.
ALTER TABLE transfer_requests ADD COLUMN IF NOT EXISTS checkout_request_key uuid;
CREATE UNIQUE INDEX IF NOT EXISTS transfer_checkout_request_key
  ON transfer_requests(requested_by,checkout_request_key) WHERE checkout_request_key IS NOT NULL;
CREATE TABLE IF NOT EXISTS checkout_transfer_payments (
  request_id uuid PRIMARY KEY REFERENCES transfer_requests(id),
  customer_id text NOT NULL,
  amount_cents bigint NOT NULL CHECK(amount_cents>0),
  state text NOT NULL CHECK(state IN ('prepared','creating','pending','paid','review','refunded')),
  provider_id text UNIQUE,
  invoice_url text,
  provider_status text,
  issue text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
