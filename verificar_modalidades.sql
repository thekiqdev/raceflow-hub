-- Script para verificar modalidades do evento "Corrida Teste"
-- Execute este script no banco de dados PostgreSQL

-- 1. Encontrar o evento
SELECT 
  id,
  title,
  status,
  event_date
FROM events
WHERE title ILIKE '%corrida teste%' OR title ILIKE '%teste%'
ORDER BY created_at DESC
LIMIT 5;

-- 2. Verificar modalidades (substitua <event_id> pelo ID encontrado acima)
-- Exemplo: df940e97-0376-4f7b-ad18-107fd3d61e3b
SELECT 
  ec.id,
  ec.event_id,
  ec.name as modalidade,
  ec.distance,
  ec.price,
  ec.max_participants,
  ec.created_at
FROM event_categories ec
WHERE ec.event_id = 'df940e97-0376-4f7b-ad18-107fd3d61e3b'
ORDER BY ec.price ASC, ec.name ASC;

-- 3. Verificar se há registros relacionados
SELECT 
  COUNT(*) as total_registrations,
  COUNT(DISTINCT category_id) as categorias_com_inscricoes
FROM registrations
WHERE event_id = 'df940e97-0376-4f7b-ad18-107fd3d61e3b';

-- 4. Verificar modalidades com contagem de inscrições (query completa)
SELECT 
  ec.*,
  COALESCE(reg_count.current_registrations, 0) as current_registrations,
  CASE 
    WHEN ec.max_participants IS NOT NULL THEN 
      ec.max_participants - COALESCE(reg_count.current_registrations, 0)
    ELSE NULL
  END as available_spots
FROM event_categories ec
LEFT JOIN (
  SELECT 
    category_id,
    COUNT(*) as current_registrations
  FROM registrations
  WHERE event_id = 'df940e97-0376-4f7b-ad18-107fd3d61e3b'
    AND status IN ('pending', 'confirmed')
    AND payment_status IN ('pending', 'paid')
  GROUP BY category_id
) reg_count ON ec.id = reg_count.category_id
WHERE ec.event_id = 'df940e97-0376-4f7b-ad18-107fd3d61e3b'
ORDER BY ec.price ASC, ec.name ASC;



