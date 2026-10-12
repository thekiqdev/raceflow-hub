-- Troca de meio: abandonar cobrança sem liberar a reserva do pedido.
ALTER TABLE checkout_payment_attempts
  ADD COLUMN IF NOT EXISTS keep_reservation boolean NOT NULL DEFAULT false;
