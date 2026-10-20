-- Estorno local de pedido FREE / R$ 0 precisa registrar amount_cents = 0.
ALTER TABLE checkout_payment_refunds
  DROP CONSTRAINT IF EXISTS checkout_payment_refunds_amount_cents_check;

ALTER TABLE checkout_payment_refunds
  ADD CONSTRAINT checkout_payment_refunds_amount_cents_check
  CHECK (amount_cents >= 0);
