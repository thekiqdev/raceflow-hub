-- Fixture mínima: executada apenas no PostgreSQL descartável dos testes.
CREATE TABLE events (id uuid PRIMARY KEY, organizer_id uuid);
CREATE TABLE categories (id uuid PRIMARY KEY, event_id uuid REFERENCES events, name text,
 price numeric DEFAULT 100, gender text DEFAULT 'ambos', min_age int, max_age int, max_participants int);
CREATE TABLE modalities (id uuid PRIMARY KEY, event_id uuid REFERENCES events, max_participants int);
CREATE TABLE category_modalities (category_id uuid REFERENCES categories, modality_id uuid REFERENCES modalities);
CREATE TABLE category_batches (id uuid PRIMARY KEY, category_id uuid REFERENCES categories, valid_from date, valid_to date, price numeric, created_at timestamptz DEFAULT now());
CREATE TABLE category_custom_fields (id uuid PRIMARY KEY, category_id uuid REFERENCES categories, label text,
 field_type text, display_order int DEFAULT 0, created_at timestamptz DEFAULT now());
CREATE TABLE users (id uuid PRIMARY KEY, email text);
CREATE TABLE profiles (id uuid PRIMARY KEY, birth_date date DEFAULT '1990-01-01', gender text DEFAULT 'masculino', full_name text, cpf text);
CREATE TABLE event_kits (id uuid PRIMARY KEY, event_id uuid REFERENCES events, price numeric DEFAULT 20);
CREATE TABLE kit_products (id uuid PRIMARY KEY, kit_id uuid REFERENCES event_kits, name text,
 type text DEFAULT 'variable', variant_attributes jsonb);
CREATE TABLE product_variants (id uuid PRIMARY KEY, product_id uuid REFERENCES kit_products, name text, available_quantity int);
CREATE TABLE coupons (id uuid PRIMARY KEY, organizer_id uuid, code text, current_uses int DEFAULT 0,
 max_uses int, is_active boolean DEFAULT true, expiration_date timestamptz, leader_id uuid,
 type text DEFAULT 'fixed', discount_value numeric DEFAULT 10, updated_at timestamptz);
CREATE TABLE coupon_events (coupon_id uuid REFERENCES coupons, event_id uuid REFERENCES events);
CREATE TABLE registrations (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event_id uuid REFERENCES events,
 runner_id uuid, registered_by uuid, category_id uuid REFERENCES categories, kit_id uuid REFERENCES event_kits,
 modality_id uuid REFERENCES modalities, category_batch_id uuid, payment_method text DEFAULT 'pix',
 status text DEFAULT 'pending', payment_status text DEFAULT 'pending', total_amount numeric,
 platform_fee_amount numeric DEFAULT 0, registration_edit_fee_amount numeric DEFAULT 0,
 confirmation_code text UNIQUE, coupon_code text, transferred_to_registration_id uuid, updated_at timestamptz);
CREATE TABLE registration_product_selections (registration_id uuid REFERENCES registrations,
 product_id uuid REFERENCES kit_products, variant_id uuid REFERENCES product_variants,
 attribute_name text NOT NULL, attribute_value text NOT NULL);
CREATE TABLE registration_custom_field_values (registration_id uuid REFERENCES registrations,
 category_custom_field_id uuid REFERENCES category_custom_fields, value text, updated_at timestamptz,
 PRIMARY KEY (registration_id, category_custom_field_id));
CREATE TABLE leader_invitations (id uuid PRIMARY KEY, leader_id uuid, bonus_registration_id uuid REFERENCES registrations,
 event_id uuid, runner_id uuid, runner_cpf text, status text DEFAULT 'available', sent_at timestamptz,
 updated_at timestamptz, runner_chooses_category_modality_kit boolean, runner_preregistered boolean);
CREATE TABLE system_settings (id uuid PRIMARY KEY, enabled_modules jsonb, platform_fee numeric DEFAULT 0,
 platform_fee_type text DEFAULT 'fixed', platform_fee_min numeric DEFAULT 0);
INSERT INTO system_settings (id,enabled_modules) VALUES ('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a12','{"platform_fees":true,"senior_discount_60_plus":false}');
