# 🚀 Guia de Deploy no Easypanel

Este guia explica como fazer o deploy do RaceFlow Hub no Easypanel.

## 📋 Pré-requisitos

1. Conta no Easypanel
2. Repositório Git configurado (GitHub, GitLab, etc.)
3. Domínio configurado (opcional, mas recomendado)

## 🗄️ Passo 1: Configurar PostgreSQL

### Opção A: Usar PostgreSQL do Easypanel

1. No Easypanel, crie um novo serviço **PostgreSQL**
2. Configure:
   - **Nome**: `raceflow-postgres`
   - **Versão**: `15-alpine` (ou superior)
   - **Database**: `raceflow_db`
   - **User**: `raceflow_user`
   - **Password**: Gere uma senha forte e salve

3. Anote as variáveis de conexão:
   - Host (geralmente o nome do serviço)
   - Port (geralmente 5432)
   - Database, User, Password

### Opção B: Usar PostgreSQL Externo

Se você já tem um PostgreSQL externo, use as credenciais existentes.

## 🔧 Passo 2: Configurar Backend

1. No Easypanel, crie um novo serviço **App**
2. Configure:
   - **Nome**: `raceflow-backend`
   - **Source**: Conecte seu repositório Git
   - **Build Context**: `/backend`
   - **Dockerfile**: `backend/Dockerfile`
   - **Port**: `3001`

3. **IMPORTANTE**: Após criar o serviço, o Easypanel gerará automaticamente uma URL para o backend. Você verá algo como:
   - `https://raceflow-backend-xxxxx.easypanel.host` (URL automática do Easypanel)
   - OU se configurar domínio customizado: `https://api.seudominio.com`

4. Configure as **Environment Variables**:

```env
NODE_ENV=production
POSTGRES_HOST=raceflow-postgres  # Nome do serviço PostgreSQL no Easypanel
POSTGRES_PORT=5432
POSTGRES_DB=raceflow_db
POSTGRES_USER=raceflow_user
POSTGRES_PASSWORD=sua_senha_aqui
DATABASE_URL=postgresql://raceflow_user:sua_senha_aqui@raceflow-postgres:5432/raceflow_db
JWT_SECRET=seu_jwt_secret_super_seguro_aqui
JWT_EXPIRES_IN=7d
API_PORT=3001
# Use a URL que o Easypanel gerou ou seu domínio customizado
API_URL=https://raceflow-backend-xxxxx.easypanel.host
# OU se tiver domínio: API_URL=https://api.seudominio.com
# CORS deve permitir o domínio do frontend
CORS_ORIGIN=https://raceflow-frontend-xxxxx.easypanel.host
# OU se tiver domínio: CORS_ORIGIN=https://seudominio.com,https://www.seudominio.com
```

4. **Build Command**: (geralmente automático com Dockerfile)
5. **Start Command**: (geralmente automático com Dockerfile)

## 🎨 Passo 3: Configurar Frontend

1. No Easypanel, crie um novo serviço **App**
2. Configure:
   - **Nome**: `raceflow-frontend`
   - **Source**: Conecte seu repositório Git
   - **Build Context**: `/` (raiz)
   - **Dockerfile**: `Dockerfile`
   - **Port**: `80`

3. **IMPORTANTE**: Após criar o serviço, o Easypanel gerará automaticamente uma URL para o frontend. Você verá algo como:
   - `https://raceflow-frontend-xxxxx.easypanel.host` (URL automática do Easypanel)
   - OU se configurar domínio customizado: `https://seudominio.com`

4. Configure as **Environment Variables**:

```env
# Use a URL do backend que você configurou no Passo 2, adicionando /api no final
VITE_API_URL=https://raceflow-backend-xxxxx.easypanel.host/api
# OU se tiver domínio: VITE_API_URL=https://api.seudominio.com/api
```

4. **Build Command**: (geralmente automático com Dockerfile)
5. **Start Command**: (geralmente automático com Dockerfile)

## 🔄 Passo 4: Executar Migrações do Banco de Dados

Após o backend estar rodando, você precisa executar as migrações:

1. Conecte-se ao container do backend via terminal do Easypanel
2. Execute as migrações manualmente ou crie um script:

```bash
# Opção 1: Via psql direto no PostgreSQL
psql -h raceflow-postgres -U raceflow_user -d raceflow_db -f migrations/001_initial_schema.sql

# Opção 2: Via script Node.js (se criado)
npm run migrate
```

**Ordem das migrações:**
1. `001_initial_schema.sql`
2. `002_add_indexes.sql`
3. `003_optimize_queries.sql`
4. `004_admin_dashboard_views.sql`
5. `005_add_user_status.sql`
6. `006_financial_tables.sql`
7. `007_knowledge_base_tables.sql`
8. `008_system_settings.sql`
9. `009_reports_views.sql`
10. `010_support_tables.sql`
11. `011_organizer_dashboard_views.sql`
12. `012_organizer_settings.sql`
13. `013_add_variant_group_name.sql`
14. `014_add_variant_quantity.sql`
15. `015_add_variant_sku_price.sql`
16. `016_add_variant_attributes.sql`
17. `017_add_profile_is_public.sql`
18. `018_allow_null_valid_from.sql`

## 🌐 Passo 5: Configurar Domínios (Opcional)

### Backend
- **Domínio**: `api.seudominio.com`
- **Porta**: `3001`

### Frontend
- **Domínio**: `seudominio.com` ou `www.seudominio.com`
- **Porta**: `80`

## 🔐 Passo 6: Segurança

1. **JWT_SECRET**: Gere uma string aleatória forte:
   ```bash
   openssl rand -base64 32
   ```

2. **CORS_ORIGIN**: Configure apenas os domínios que você usa em produção

3. **POSTGRES_PASSWORD**: Use uma senha forte e única

## ✅ Passo 7: Verificar Deploy

1. Acesse o frontend: `https://seudominio.com`
2. Verifique o health check do backend: `https://api.seudominio.com/api/health`
3. Teste o login e criação de eventos

## 🐛 Troubleshooting

### Backend não conecta ao banco
- Verifique se o `POSTGRES_HOST` está correto (nome do serviço PostgreSQL)
- Verifique se as credenciais estão corretas
- Verifique se o PostgreSQL está rodando e saudável

### Frontend não conecta ao backend
- Verifique se `VITE_API_URL` está correto
- Verifique se o backend está acessível publicamente
- Verifique CORS no backend

### Migrações não executadas
- Execute manualmente via terminal do Easypanel
- Verifique se os arquivos de migração estão no container

## 📝 Notas Importantes

1. **Variáveis de Ambiente**: Nunca commite senhas ou secrets no Git. Use as variáveis de ambiente do Easypanel.

2. **Build Context**: Certifique-se de que o build context está correto:
   - Backend: `/backend`
   - Frontend: `/` (raiz)

3. **Portas**: O Easypanel geralmente gerencia as portas automaticamente, mas você pode configurar manualmente se necessário.

4. **Health Checks**: Os health checks estão configurados nos Dockerfiles para monitoramento automático.

5. **Volumes**: O PostgreSQL usa volumes persistentes para dados.

## 🔄 Atualizações

Para atualizar o aplicativo:
1. Faça push das alterações para o Git
2. O Easypanel detectará as mudanças e fará rebuild automático
3. Ou force um rebuild manualmente no painel

## 📞 Suporte

Em caso de problemas:
1. Verifique os logs no Easypanel
2. Verifique os health checks
3. Verifique as variáveis de ambiente
4. Verifique a conectividade entre serviços

