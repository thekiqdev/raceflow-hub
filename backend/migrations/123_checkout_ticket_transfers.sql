-- Estrutura aditiva. Não transfere ingressos nem altera valores já conciliados.
ALTER TABLE registrations ADD COLUMN checkout_current_identity jsonb;
ALTER TABLE registrations ADD COLUMN checkout_ticket_version integer NOT NULL DEFAULT 0 CHECK (checkout_ticket_version>=0);
ALTER TABLE transfer_requests ADD COLUMN checkout_ticket_version integer CHECK (checkout_ticket_version>=0);
CREATE TABLE checkout_ticket_transfers (
  request_id uuid PRIMARY KEY REFERENCES transfer_requests(id),
  registration_id uuid NOT NULL REFERENCES registrations(id),
  order_id uuid NOT NULL REFERENCES checkout_orders(id),
  previous_runner_id uuid REFERENCES users(id),
  new_runner_id uuid NOT NULL REFERENCES users(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  previous_identity jsonb NOT NULL,
  current_identity jsonb NOT NULL,
  ticket_version integer NOT NULL CHECK (ticket_version>0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(registration_id,ticket_version)
);
ALTER TABLE checkout_delivery_jobs DROP CONSTRAINT checkout_delivery_jobs_kind_check;
ALTER TABLE checkout_delivery_jobs ADD CONSTRAINT checkout_delivery_jobs_kind_check
  CHECK (kind IN ('buyer_confirmation','athlete_confirmation','refund','bonus','transfer_notice'));
