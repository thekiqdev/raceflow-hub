-- Script para investigar o evento "Corrida Teste" e suas categorias

-- 1. Encontrar o evento "Corrida Teste"
SELECT 
  id,
  title,
  status,
  event_date,
  organizer_id,
  created_at
FROM events
WHERE title ILIKE '%corrida teste%' OR title ILIKE '%teste%'
ORDER BY created_at DESC;

-- 2. Verificar categorias do evento (substitua <event_id> pelo ID encontrado acima)
-- SELECT 
--   ec.id,
--   ec.event_id,
--   ec.name,
--   ec.distance,
--   ec.price,
--   ec.max_participants,
--   ec.created_at,
--   COUNT(r.id) as current_registrations
-- FROM event_categories ec
-- LEFT JOIN registrations r ON r.category_id = ec.id 
--   AND r.status IN ('pending', 'confirmed')
--   AND r.payment_status IN ('pending', 'paid')
-- WHERE ec.event_id = '<event_id>'
-- GROUP BY ec.id, ec.event_id, ec.name, ec.distance, ec.price, ec.max_participants, ec.created_at
-- ORDER BY ec.price ASC, ec.name ASC;

-- 3. Verificar se há algum problema com a query do serviço
-- SELECT 
--   ec.*,
--   COALESCE(reg_count.current_registrations, 0) as current_registrations,
--   CASE 
--     WHEN ec.max_participants IS NOT NULL THEN 
--       ec.max_participants - COALESCE(reg_count.current_registrations, 0)
--     ELSE NULL
--   END as available_spots
-- FROM event_categories ec
-- LEFT JOIN (
--   SELECT 
--     category_id,
--     COUNT(*) as current_registrations
--   FROM registrations
--   WHERE event_id = '<event_id>'
--     AND status IN ('pending', 'confirmed')
--     AND payment_status IN ('pending', 'paid')
--   GROUP BY category_id
-- ) reg_count ON ec.id = reg_count.category_id
-- WHERE ec.event_id = '<event_id>'
-- ORDER BY ec.price ASC, ec.name ASC;



