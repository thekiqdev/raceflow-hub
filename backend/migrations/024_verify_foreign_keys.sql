-- ============================================
-- Migration 024: Verify Foreign Keys
-- Script para verificar se todas as foreign keys estão corretas
-- ============================================

-- Listar todas as foreign keys atuais no banco
SELECT 
    tc.table_name, 
    kcu.column_name, 
    ccu.table_name AS foreign_table_name,
    ccu.column_name AS foreign_column_name,
    tc.constraint_name
FROM information_schema.table_constraints AS tc 
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' 
AND tc.table_schema = 'public'
ORDER BY tc.table_name, kcu.column_name;

-- Verificar se há foreign keys faltando
-- Comparar com a lista esperada:

-- EXPECTED FOREIGN KEYS:
-- announcement_reads -> announcement_id -> announcements.id
-- announcement_reads -> user_id -> profiles.id
-- announcements -> created_by -> profiles.id
-- asaas_customers -> user_id -> profiles.id
-- asaas_payments -> registration_id -> registrations.id
-- asaas_webhook_events -> registration_id -> registrations.id
-- kit_pickup_locations -> event_id -> events.id
-- kit_products -> kit_id -> event_kits.id
-- knowledge_articles -> category_id -> knowledge_categories.id
-- knowledge_articles -> created_by -> profiles.id
-- product_variants -> product_id -> kit_products.id
-- profiles -> id -> users.id
-- refund_requests -> athlete_id -> profiles.id
-- refund_requests -> event_id -> events.id
-- refund_requests -> processed_by -> profiles.id
-- refund_requests -> registration_id -> registrations.id
-- registrations -> category_id -> event_categories.id
-- registrations -> event_id -> events.id
-- registrations -> kit_id -> event_kits.id
-- registrations -> registered_by -> profiles.id
-- registrations -> runner_id -> profiles.id
-- support_ticket_messages -> ticket_id -> support_tickets.id
-- support_ticket_messages -> user_id -> profiles.id
-- support_tickets -> assigned_to -> profiles.id
-- support_tickets -> user_id -> profiles.id
-- user_roles -> user_id -> profiles.id
-- withdraw_requests -> organizer_id -> profiles.id
-- withdraw_requests -> processed_by -> profiles.id
-- events -> organizer_id -> profiles.id (verificar se está presente)

-- Verificar foreign key de events -> organizer_id
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'events'
            AND kcu.column_name = 'organizer_id'
            AND tc.constraint_type = 'FOREIGN KEY'
        ) THEN '✓ events.organizer_id -> profiles.id existe'
        ELSE '✗ events.organizer_id -> profiles.id FALTANDO'
    END AS status;

-- Verificar foreign key de category_batches -> category_id (se existir)
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.table_constraints AS tc 
            JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
            WHERE tc.table_name = 'category_batches'
            AND kcu.column_name = 'category_id'
            AND tc.constraint_type = 'FOREIGN KEY'
        ) THEN '✓ category_batches.category_id -> event_categories.id existe'
        ELSE '✗ category_batches.category_id -> event_categories.id FALTANDO'
    END AS status;

