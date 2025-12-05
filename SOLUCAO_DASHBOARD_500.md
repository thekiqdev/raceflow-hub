# 🔧 Solução: Erro 500 no Dashboard Admin

## ❌ Problema

Ao acessar o dashboard administrativo, você recebe o erro:
```
GET https://cronoteam-crono-back.e758qe.easypanel.host/api/admin/dashboard/stats 500 (Internal Server Error)
```

## 🔍 Causa

O erro ocorre porque as **views do banco de dados** que o dashboard usa não existem:
- `admin_dashboard_stats`
- `admin_registrations_by_month`
- `admin_revenue_by_month`

Essas views deveriam ter sido criadas pela migração `004_admin_dashboard_views.sql`, mas provavelmente não foram executadas.

## ✅ Soluções

### Solução 1: Executar Migração SQL Diretamente (Recomendado)

No Easypanel, acesse o serviço **PostgreSQL** e execute o SQL:

1. **Acesse o PostgreSQL**:
   - No Easypanel, vá para o serviço do banco de dados
   - Clique em **Terminal** ou **SQL Editor**

2. **Execute o script**:
   - Copie o conteúdo de `backend/migrations/020_fix_admin_dashboard_views.sql`
   - Cole e execute no SQL Editor

**OU** execute via terminal do backend:

```bash
# No container do backend
psql -h $POSTGRES_HOST -U $POSTGRES_USER -d $POSTGRES_DB -f migrations/020_fix_admin_dashboard_views.sql
```

### Solução 2: Executar Todas as Migrações

Se as views não existem, é provável que outras migrações também não tenham sido executadas:

1. **No Easypanel, acesse o serviço Backend**
2. **Abra o Terminal**
3. **Execute**:

```bash
npm run migrate
```

Isso executará todas as migrações pendentes, incluindo a `004_admin_dashboard_views.sql`.

### Solução 3: Executar Migração Manual via psql

Se você tem acesso direto ao PostgreSQL:

```bash
psql -h <POSTGRES_HOST> -U <POSTGRES_USER> -d <POSTGRES_DB> -f backend/migrations/020_fix_admin_dashboard_views.sql
```

Substitua:
- `<POSTGRES_HOST>` pelo host do PostgreSQL no Easypanel
- `<POSTGRES_USER>` pelo usuário (geralmente `postgres`)
- `<POSTGRES_DB>` pelo nome do banco (geralmente `cronoteam`)

## 🔄 O Que Foi Corrigido

1. **Tratamento de Erro**: O código agora retorna valores padrão se as views não existirem (em vez de erro 500)
2. **Migração de Correção**: Criada `020_fix_admin_dashboard_views.sql` para garantir que as views existam
3. **Logs Melhorados**: Mensagens de aviso quando views não existem

## 📊 Views Criadas

Após executar a migração, as seguintes views serão criadas:

### `admin_dashboard_stats`
Estatísticas gerais:
- Eventos ativos/pendentes
- Total de atletas e organizadores
- Faturamento total e do mês anterior
- Inscrições totais
- Comissões arrecadadas
- Eventos finalizados

### `admin_registrations_by_month`
Inscrições confirmadas agrupadas por mês (últimos 6 meses)

### `admin_revenue_by_month`
Faturamento agrupado por mês (últimos 6 meses)

## ⚠️ Nota Importante

**Mesmo com o tratamento de erro**, o dashboard mostrará valores zerados se as views não existirem. **Execute a migração** para ver os dados reais.

## 🎯 Próximos Passos

1. **Imediato**: Execute `020_fix_admin_dashboard_views.sql` no PostgreSQL
2. **Verificação**: Recarregue o dashboard e verifique se os dados aparecem
3. **Prevenção**: Execute todas as migrações com `npm run migrate` no backend

## 🔍 Verificar se Views Existem

Para verificar se as views foram criadas, execute no PostgreSQL:

```sql
SELECT table_name 
FROM information_schema.views 
WHERE table_schema = 'public' 
AND table_name LIKE 'admin_%';
```

Você deve ver:
- `admin_dashboard_stats`
- `admin_registrations_by_month`
- `admin_revenue_by_month`

