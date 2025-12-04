# Database Migrations

Este diretório contém as migrations do banco de dados PostgreSQL.

## Estrutura

As migrations estão numeradas sequencialmente:
- `001_initial_schema.sql` - Schema inicial completo

## Executando Migrations

### Via Docker Compose (Recomendado)

```bash
# Executar uma migration específica
Get-Content backend/migrations/001_initial_schema.sql | docker-compose exec -T postgres psql -U raceflow_user -d raceflow_db

# Ou no Linux/Mac:
cat backend/migrations/001_initial_schema.sql | docker-compose exec -T postgres psql -U raceflow_user -d raceflow_db
```

### Via psql direto

```bash
# Conectar ao banco
docker-compose exec postgres psql -U raceflow_user -d raceflow_db

# Executar migration
\i backend/migrations/001_initial_schema.sql
```

## Verificando Status

### Listar todas as tabelas
```bash
docker-compose exec -T postgres psql -U raceflow_user -d raceflow_db -c "\dt public.*"
```

### Listar todos os enums
```bash
docker-compose exec -T postgres psql -U raceflow_user -d raceflow_db -c "SELECT typname FROM pg_type WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') AND typtype = 'e' ORDER BY typname;"
```

### Listar todas as funções
```bash
docker-compose exec -T postgres psql -U raceflow_user -d raceflow_db -c "SELECT routine_name FROM information_schema.routines WHERE routine_schema = 'public' AND routine_type = 'FUNCTION' ORDER BY routine_name;"
```

### Listar todos os triggers
```bash
docker-compose exec -T postgres psql -U raceflow_user -d raceflow_db -c "SELECT trigger_name, event_object_table FROM information_schema.triggers WHERE trigger_schema = 'public' ORDER BY event_object_table, trigger_name;"
```

## Estrutura do Banco

### Tabelas Principais
- `users` - Usuários do sistema (substitui auth.users do Supabase)
- `profiles` - Perfis dos usuários
- `user_roles` - Roles dos usuários (admin, organizer, runner)
- `events` - Eventos esportivos
- `event_categories` - Categorias dos eventos
- `category_batches` - Lotes de preço por categoria
- `event_kits` - Kits dos eventos
- `kit_products` - Produtos dos kits
- `product_variants` - Variantes dos produtos
- `kit_pickup_locations` - Locais de retirada de kits
- `registrations` - Inscrições nos eventos
- `home_page_settings` - Configurações da página inicial

### Enums
- `app_role`: 'admin', 'organizer', 'runner'
- `event_status`: 'draft', 'published', 'ongoing', 'finished', 'cancelled'
- `registration_status`: 'pending', 'confirmed', 'cancelled', 'refund_requested', 'refunded'
- `payment_status`: 'pending', 'paid', 'refunded', 'failed'
- `payment_method`: 'pix', 'credit_card', 'boleto'

### Funções
- `has_role(_user_id UUID, _role app_role)`: Verifica se usuário tem role específica
- `update_updated_at_column()`: Atualiza timestamp updated_at
- `handle_new_user()`: Cria role padrão 'runner' ao criar perfil

### Triggers
- `update_users_updated_at`: Atualiza updated_at em users
- `update_profiles_updated_at`: Atualiza updated_at em profiles
- `update_events_updated_at`: Atualiza updated_at em events
- `update_registrations_updated_at`: Atualiza updated_at em registrations
- `update_home_page_settings_updated_at`: Atualiza updated_at em home_page_settings
- `on_profile_created`: Cria role 'runner' ao criar perfil

## Notas Importantes

### Diferenças do Supabase

1. **Tabela users**: Criada manualmente, substitui `auth.users` do Supabase
2. **RLS removido**: As políticas de Row Level Security foram removidas, pois serão implementadas no backend
3. **auth.uid()**: Todas as referências a `auth.uid()` foram removidas, o backend passará o user_id como parâmetro
4. **SECURITY DEFINER**: Removido das funções, não é mais necessário sem RLS

### Próximas Migrations

Ao criar novas migrations:
1. Numere sequencialmente (002_, 003_, etc.)
2. Documente as mudanças
3. Teste antes de aplicar em produção
4. Mantenha compatibilidade com dados existentes quando possível





