-- Payload PIX (copia e cola) para exibição embutida no checkout de grupo.
ALTER TABLE checkout_payment_attempts
  ADD COLUMN IF NOT EXISTS pix_qr_code text;
