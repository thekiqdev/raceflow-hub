-- Payload PIX (copia e cola) da taxa de transferência, para exibição embutida no dialog.
ALTER TABLE checkout_transfer_payments
  ADD COLUMN IF NOT EXISTS pix_qr_code text;
