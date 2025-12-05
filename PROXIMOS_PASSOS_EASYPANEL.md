# 🚀 Próximos Passos - Deploy no Easypanel

Após o deploy bem-sucedido do backend e frontend, siga estes passos para finalizar a configuração.

## ✅ Status Atual

- ✅ Backend deployado e rodando
- ✅ Frontend deployado e rodando
- ✅ PostgreSQL configurado
- ⏳ **Pendente**: Migrações do banco de dados
- ⏳ **Pendente**: Criação de usuários de teste

---

## 📋 Passo 1: Executar Migrações do Banco de Dados

As migrações precisam ser executadas na ordem correta. Você tem 3 opções:

### Opção A: Script Automatizado (⭐ RECOMENDADO - Mais Fácil)

**⚠️ IMPORTANTE**: Após o próximo rebuild do backend, os scripts estarão disponíveis automaticamente.

1. No Easypanel, acesse o serviço **Backend**
2. Clique em **Terminal** ou **Executar Comando**
3. Execute:

```bash
# Instalar dependências de desenvolvimento (necessário para tsx)
npm install --include=dev

# Executar script de migração automatizado
npm run migrate
```

**Vantagens:**
- ✅ Executa todas as migrações automaticamente na ordem correta
- ✅ Rastreia quais migrações já foram executadas (não executa duas vezes)
- ✅ Mostra progresso e resumo detalhado
- ✅ Mais seguro (usa transações)

**O que o script faz:**
- Cria uma tabela `schema_migrations` para rastrear migrações
- Executa cada migração em ordem (001, 002, 003, ...)
- Pula migrações que já foram executadas
- Mostra um resumo ao final

**Se os scripts não estiverem disponíveis ainda:**
- Faça um rebuild do serviço backend no Easypanel
- Ou use a Opção B abaixo (via psql direto)

### Opção B: Via PostgreSQL Direto (🚀 Solução Imediata)

**⚠️ IMPORTANTE**: Esta opção requer que você tenha acesso aos arquivos SQL. Você pode:
- Baixar os arquivos do repositório GitHub
- Ou copiar o conteúdo de cada arquivo SQL

1. No Easypanel, acesse o serviço **PostgreSQL**
2. Clique em **Terminal** ou **Executar Comando**
3. Conecte ao banco:

```bash
psql -U postgres -d cronoteam
```

4. Dentro do psql, você pode:
   - **Opção 1**: Copiar e colar o conteúdo de cada arquivo SQL diretamente
   - **Opção 2**: Se os arquivos estiverem no container, usar `\i`:

```sql
-- Se os arquivos estiverem acessíveis:
\i /caminho/para/001_initial_schema.sql
\i /caminho/para/002_add_indexes.sql
-- ... continue com todas as 18 migrações
```

**Arquivos de migração necessários (na ordem):**
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

**💡 Dica**: Você pode baixar todos os arquivos do repositório GitHub em `backend/migrations/` e copiar o conteúdo de cada um no psql.

### Opção C: Via Terminal do Backend (Manual - Requer Rebuild)

1. No Easypanel, acesse o serviço **PostgreSQL**
2. Clique em **Terminal** ou **Executar Comando**
3. Execute os seguintes comandos na ordem:

```bash
# Conectar ao banco
psql -U postgres -d cronoteam

# Executar migrações na ordem:
\i /path/to/migrations/001_initial_schema.sql
\i /path/to/migrations/002_add_indexes.sql
\i /path/to/migrations/003_optimize_queries.sql
\i /path/to/migrations/004_admin_dashboard_views.sql
\i /path/to/migrations/005_add_user_status.sql
\i /path/to/migrations/006_financial_tables.sql
\i /path/to/migrations/007_knowledge_base_tables.sql
\i /path/to/migrations/008_system_settings.sql
\i /path/to/migrations/009_reports_views.sql
\i /path/to/migrations/010_support_tables.sql
\i /path/to/migrations/011_organizer_dashboard_views.sql
\i /path/to/migrations/012_organizer_settings.sql
\i /path/to/migrations/013_add_variant_group_name.sql
\i /path/to/migrations/014_add_variant_quantity.sql
\i /path/to/migrations/015_add_variant_sku_price.sql
\i /path/to/migrations/016_add_variant_attributes.sql
\i /path/to/migrations/017_add_profile_is_public.sql
\i /path/to/migrations/018_allow_null_valid_from.sql
```

### Opção B: Via Container do Backend

1. No Easypanel, acesse o serviço **Backend**
2. Clique em **Terminal** ou **Executar Comando**
3. Execute:

```bash
# Instalar psql no container (se necessário)
apk add --no-cache postgresql-client

# Executar migrações
export PGHOST=cronoteam_cronobd
export PGPORT=5432
export PGDATABASE=cronoteam
export PGUSER=postgres
export PGPASSWORD=sua_senha_aqui

# Executar cada migração
psql -f /app/migrations/001_initial_schema.sql
psql -f /app/migrations/002_add_indexes.sql
psql -f /app/migrations/003_optimize_queries.sql
psql -f /app/migrations/004_admin_dashboard_views.sql
psql -f /app/migrations/005_add_user_status.sql
psql -f /app/migrations/006_financial_tables.sql
psql -f /app/migrations/007_knowledge_base_tables.sql
psql -f /app/migrations/008_system_settings.sql
psql -f /app/migrations/009_reports_views.sql
psql -f /app/migrations/010_support_tables.sql
psql -f /app/migrations/011_organizer_dashboard_views.sql
psql -f /app/migrations/012_organizer_settings.sql
psql -f /app/migrations/013_add_variant_group_name.sql
psql -f /app/migrations/014_add_variant_quantity.sql
psql -f /app/migrations/015_add_variant_sku_price.sql
psql -f /app/migrations/016_add_variant_attributes.sql
psql -f /app/migrations/017_add_profile_is_public.sql
psql -f /app/migrations/018_allow_null_valid_from.sql
```

**⚠️ IMPORTANTE**: Os arquivos de migração precisam estar no container. Se não estiverem, você pode:

1. Copiar os arquivos para o container via volume
2. Ou executar via `psql` conectando diretamente ao PostgreSQL

---

## 👥 Passo 2: Criar Usuários de Teste

Após as migrações, crie os usuários de teste:

### Via Terminal do Backend

1. No Easypanel, acesse o serviço **Backend**
2. Clique em **Terminal** ou **Executar Comando**
3. Execute:

```bash
# Instalar dependências de desenvolvimento (se necessário)
npm install --include=dev

# Executar script de criação de usuários
npm run create-test-users
```

### Usuários que serão criados:

| Email | Senha | Role | Descrição |
|-------|-------|-----|-----------|
| `admin@test.com` | `admin123` | Admin | Administrador do sistema |
| `organizador@test.com` | `organizador123` | Organizer | Organizador de eventos |
| `runner@test.com` | `runner123` | Runner | Corredor/participante |

**⚠️ IMPORTANTE**: 
- Altere essas senhas em produção!
- Esses usuários são apenas para testes iniciais.

---

## 🔍 Passo 3: Verificar se Tudo Está Funcionando

### 3.1 Verificar Health Check do Backend

Acesse no navegador ou via curl:
```
https://seu-backend-url.easypanel.host/api/health
```

Deve retornar:
```json
{
  "status": "ok",
  "timestamp": "...",
  "database": "connected"
}
```

### 3.2 Verificar Conexão do Frontend com Backend

1. Acesse o frontend no navegador
2. Abra o Console do navegador (F12)
3. Verifique se não há erros de CORS ou conexão
4. Tente fazer login com um dos usuários de teste

### 3.3 Testar Funcionalidades Básicas

- [ ] Login com `admin@test.com`
- [ ] Criar um evento (como organizador)
- [ ] Visualizar eventos públicos (sem login)
- [ ] Fazer uma inscrição (como corredor)

---

## 🔧 Troubleshooting

### Erro: "relation does not exist"

**Causa**: Migrações não foram executadas ou executadas na ordem errada.

**Solução**: 
1. Verifique se todas as migrações foram executadas
2. Execute as migrações na ordem correta (001, 002, 003, ...)

### Erro: "password authentication failed"

**Causa**: Credenciais do PostgreSQL incorretas.

**Solução**:
1. Verifique as variáveis de ambiente do backend
2. Verifique se o `POSTGRES_HOST` está correto (nome do serviço PostgreSQL)
3. Verifique se a senha está correta

### Erro: "Cannot connect to database"

**Causa**: Backend não consegue se conectar ao PostgreSQL.

**Solução**:
1. Verifique se o PostgreSQL está rodando
2. Verifique se o `POSTGRES_HOST` está correto
3. Verifique se ambos os serviços estão na mesma rede no Easypanel

### Erro: CORS no frontend

**Causa**: `CORS_ORIGIN` não inclui a URL do frontend.

**Solução**:
1. Verifique a variável `CORS_ORIGIN` no backend
2. Adicione a URL do frontend (ex: `https://seu-frontend-url.easypanel.host`)
3. Reinicie o backend

---

## 📝 Checklist Final

- [ ] Migrações executadas com sucesso
- [ ] Usuários de teste criados
- [ ] Health check do backend funcionando
- [ ] Frontend conectando ao backend
- [ ] Login funcionando
- [ ] Criação de eventos funcionando
- [ ] Inscrições funcionando

---

## 🎯 Próximos Passos Após Configuração Inicial

1. **Configurar Domínio Customizado** (se necessário)
   - Configurar DNS apontando para o Easypanel
   - Atualizar `CORS_ORIGIN` e `VITE_API_URL`

2. **Configurar SSL/HTTPS**
   - O Easypanel geralmente gerencia isso automaticamente

3. **Configurar Backup do PostgreSQL**
   - Configurar backups automáticos no Easypanel

4. **Monitoramento**
   - Configurar alertas para health checks
   - Monitorar logs de erro

5. **Segurança**
   - Alterar senhas padrão
   - Gerar `JWT_SECRET` forte
   - Revisar configurações de CORS

---

## 📞 Precisa de Ajuda?

Se encontrar problemas:
1. Verifique os logs no Easypanel
2. Verifique as variáveis de ambiente
3. Verifique a conectividade entre serviços
4. Consulte a documentação do Easypanel

