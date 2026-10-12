-- Dados fictícios para caracterizar a coexistência; somente no banco descartável da suíte.
-- Um evento por inscrição evita simular duplicidades inválidas de atleta/evento.
WITH fixtures(event_id, registration_id, status, payment_status, payment_method, code) AS (
  VALUES
    ('10000000-0000-4000-8000-000000000001'::uuid, '20000000-0000-4000-8000-000000000001'::uuid, 'confirmed', 'paid', 'pix', 'LEGACY-PAID'),
    ('10000000-0000-4000-8000-000000000002'::uuid, '20000000-0000-4000-8000-000000000002'::uuid, 'pending', 'pending', 'pix', 'LEGACY-PENDING'),
    ('10000000-0000-4000-8000-000000000003'::uuid, '20000000-0000-4000-8000-000000000003'::uuid, 'transferred', 'paid', 'pix', 'LEGACY-HISTORY'),
    ('10000000-0000-4000-8000-000000000004'::uuid, '20000000-0000-4000-8000-000000000004'::uuid, 'confirmed', 'paid', 'free_bonus', 'LEGACY-INVITATION')
), inserted_events AS (
  INSERT INTO events(id, organizer_id, title)
  SELECT event_id, $2::uuid, 'Evento legado fictício' FROM fixtures
  RETURNING id
)
INSERT INTO registrations(id, event_id, runner_id, registered_by, status, payment_status,
                          payment_method, total_amount, confirmation_code)
SELECT f.registration_id, e.id, $1::uuid, $1::uuid, f.status, f.payment_status,
       f.payment_method, CASE WHEN f.payment_method = 'free_bonus' THEN 0 ELSE 100 END, f.code
FROM fixtures f JOIN inserted_events e ON e.id = f.event_id
RETURNING *;
