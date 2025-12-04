# Plano de Migração - Painel do Organizador

## 📋 Visão Geral

Este documento detalha o plano de migração completo do painel do organizador (`/organizer/dashboard`), substituindo todos os dados mockados por chamadas reais à API.

## 🎯 Estrutura do Painel

O painel do organizador possui 8 seções principais:

1. **Dashboard** - Visão geral com métricas e gráficos
2. **Eventos** - Gestão de eventos do organizador
3. **Inscrições** - Gestão de inscrições dos eventos
4. **Financeiro** - Painel financeiro e saques
5. **Relatórios** - Relatórios detalhados (já parcialmente migrado)
6. **Resultados** - Em desenvolvimento
7. **Mensagens** - Em desenvolvimento
8. **Configurações** - Configurações do organizador

---

## 📝 ETAPA 1: Dashboard Overview

### Objetivo
Migrar todas as métricas, gráficos e dados do dashboard principal.

### Dados Mockados Identificados:
- ✅ Métricas principais (eventos ativos, total inscrições, faturamento, inscrições hoje)
- ✅ Gráfico de inscrições por dia (últimos 30 dias)
- ✅ Gráfico de faturamento por dia (últimos 30 dias)
- ✅ Gráfico de inscrições por gênero (pie chart)
- ✅ Gráfico de modalidades mais populares (bar chart)
- ✅ Top 3 corridas com mais inscrições

### Endpoints Necessários:

#### Backend (Criar):
1. `GET /api/organizer/dashboard/stats`
   - Retorna métricas principais do organizador
   - Eventos ativos, total de inscrições, faturamento total, inscrições hoje

2. `GET /api/organizer/dashboard/charts`
   - Retorna dados para gráficos
   - Parâmetros: `period` (dias, padrão: 30)
   - Retorna: registrationsByDay, revenueByDay, genderData, modalityData, topEvents

#### Frontend (Criar):
- `src/lib/api/organizer.ts` - Cliente API para endpoints do organizador
- Atualizar `OrganizerDashboardOverview.tsx` para usar dados reais

### Arquivos a Modificar:
- `backend/src/routes/organizerRoutes.ts` (criar)
- `backend/src/controllers/organizerController.ts` (criar)
- `backend/src/services/organizerService.ts` (criar)
- `backend/migrations/011_organizer_views.sql` (criar views se necessário)
- `src/lib/api/organizer.ts` (criar)
- `src/components/organizer/OrganizerDashboardOverview.tsx` (atualizar)

---

## 📝 ETAPA 2: Gestão de Eventos

### Objetivo
Migrar a lista de eventos do organizador com todas as funcionalidades.

### Dados Mockados Identificados:
- ✅ Lista de eventos (mock array)
- ✅ Filtros de busca (nome, cidade)
- ✅ Ações: criar, editar, excluir, enviar resultado

### Endpoints Necessários:

#### Backend (Já Existem):
- ✅ `GET /api/events?organizer_id={id}` - Lista eventos do organizador
- ✅ `POST /api/events` - Criar evento
- ✅ `PUT /api/events/:id` - Atualizar evento
- ✅ `DELETE /api/events/:id` - Excluir evento (verificar se existe)

#### Backend (Criar/Verificar):
- Verificar se `DELETE /api/events/:id` existe
- Verificar se `result_url` pode ser atualizado via `PUT /api/events/:id`

#### Frontend (Atualizar):
- `src/components/organizer/OrganizerEvents.tsx` - Substituir mock por `getEvents({ organizer_id })`
- Integrar com `EventFormDialog` (já existe)

### Arquivos a Modificar:
- `backend/src/controllers/eventsController.ts` (verificar delete)
- `src/components/organizer/OrganizerEvents.tsx` (atualizar)

---

## 📝 ETAPA 3: Gestão de Inscrições

### Objetivo
Migrar a lista de inscrições com filtros e ações.

### Dados Mockados Identificados:
- ✅ Lista de inscrições (mock array)
- ✅ Filtros: busca (nome, CPF), status, evento
- ✅ Ações: exportar, inscrever atleta manualmente

### Endpoints Necessários:

#### Backend (Já Existem):
- ✅ `GET /api/registrations?event_id={id}` - Lista inscrições de um evento
- ✅ `GET /api/registrations?organizer_id={id}` - Lista todas as inscrições do organizador (verificar)

#### Backend (Criar):
- `GET /api/organizer/registrations` - Lista todas as inscrições do organizador (todos os eventos)
  - Filtros: `event_id`, `status`, `search` (nome, CPF)
- `POST /api/organizer/registrations` - Inscrever atleta manualmente
- `GET /api/organizer/registrations/export` - Exportar lista (CSV/Excel)

#### Frontend (Atualizar):
- `src/components/organizer/OrganizerRegistrations.tsx` - Substituir mock por API

### Arquivos a Modificar:
- `backend/src/routes/organizerRoutes.ts` (adicionar rotas)
- `backend/src/controllers/organizerController.ts` (adicionar controllers)
- `backend/src/services/organizerService.ts` (adicionar services)
- `src/lib/api/organizer.ts` (adicionar funções)
- `src/components/organizer/OrganizerRegistrations.tsx` (atualizar)

---

## 📝 ETAPA 4: Painel Financeiro

### Objetivo
Migrar resumo financeiro, solicitações de saque e configurações.

### Dados Mockados Identificados:
- ✅ Resumo financeiro (total arrecadado, líquido, saldo disponível, taxas)
- ✅ Histórico de saques (mock array)
- ✅ Formulário de solicitação de saque
- ✅ Configurações bancárias
- ✅ Política de reembolso

### Endpoints Necessários:

#### Backend (Já Existem - Admin):
- ✅ `GET /api/admin/financial/overview` - Visão geral financeira (adaptar para organizador)
- ✅ `GET /api/admin/financial/withdrawals` - Lista de saques (adaptar para organizador)
- ✅ `POST /api/admin/financial/withdrawals` - Criar saque (adaptar para organizador)

#### Backend (Criar):
- `GET /api/organizer/financial/overview` - Resumo financeiro do organizador
- `GET /api/organizer/financial/withdrawals` - Lista saques do organizador
- `POST /api/organizer/financial/withdrawals` - Solicitar saque
- `GET /api/organizer/financial/settings` - Configurações bancárias
- `PUT /api/organizer/financial/settings` - Atualizar configurações bancárias
- `GET /api/organizer/financial/refund-policy` - Política de reembolso
- `PUT /api/organizer/financial/refund-policy` - Atualizar política de reembolso

#### Frontend (Atualizar):
- `src/components/organizer/OrganizerFinancial.tsx` - Substituir mock por API

### Arquivos a Modificar:
- `backend/src/routes/organizerRoutes.ts` (adicionar rotas)
- `backend/src/controllers/organizerController.ts` (adicionar controllers)
- `backend/src/services/organizerService.ts` (adicionar services)
- `backend/migrations/012_organizer_financial.sql` (criar tabelas se necessário)
- `src/lib/api/organizer.ts` (adicionar funções)
- `src/components/organizer/OrganizerFinancial.tsx` (atualizar)

---

## 📝 ETAPA 5: Relatórios

### Objetivo
Completar a migração dos relatórios (já parcialmente migrado).

### Status Atual:
- ✅ Já usa `getEvents` e `getRegistrations` da API
- ✅ Calcula dados no frontend
- ⚠️ Pode ser otimizado com endpoints específicos

### Endpoints Necessários:

#### Backend (Criar - Opcional/Otimização):
- `GET /api/organizer/reports/summary` - Resumo financeiro calculado
- `GET /api/organizer/reports/event-revenue` - Receita por evento
- `GET /api/organizer/reports/registrations-by-period` - Inscrições por período

#### Frontend (Atualizar):
- `src/components/organizer/OrganizerReports.tsx` - Otimizar com endpoints específicos (opcional)

### Arquivos a Modificar:
- `backend/src/routes/organizerRoutes.ts` (adicionar rotas - opcional)
- `backend/src/controllers/organizerController.ts` (adicionar controllers - opcional)
- `backend/src/services/organizerService.ts` (adicionar services - opcional)
- `src/lib/api/organizer.ts` (adicionar funções - opcional)
- `src/components/organizer/OrganizerReports.tsx` (otimizar - opcional)

---

## 📝 ETAPA 6: Configurações

### Objetivo
Migrar configurações do organizador.

### Dados Mockados Identificados:
- ✅ Logo da organização (atualmente em localStorage)
- ✅ Informações da organização (nome, email, telefone)
- ⚠️ Notificações (em desenvolvimento)
- ⚠️ Segurança (em desenvolvimento)

### Endpoints Necessários:

#### Backend (Criar):
- `GET /api/organizer/settings` - Obter configurações
- `PUT /api/organizer/settings` - Atualizar configurações
- `POST /api/organizer/settings/logo` - Upload de logo
- `DELETE /api/organizer/settings/logo` - Remover logo

#### Frontend (Atualizar):
- `src/components/organizer/OrganizerSettings.tsx` - Substituir localStorage por API

### Arquivos a Modificar:
- `backend/src/routes/organizerRoutes.ts` (adicionar rotas)
- `backend/src/controllers/organizerController.ts` (adicionar controllers)
- `backend/src/services/organizerService.ts` (adicionar services)
- `backend/migrations/013_organizer_settings.sql` (criar tabela se necessário)
- `src/lib/api/organizer.ts` (adicionar funções)
- `src/components/organizer/OrganizerSettings.tsx` (atualizar)

---

## 🔄 Ordem de Execução

1. **ETAPA 1** - Dashboard Overview (base para outras etapas)
2. **ETAPA 2** - Gestão de Eventos (já tem endpoints, só conectar)
3. **ETAPA 3** - Gestão de Inscrições
4. **ETAPA 4** - Painel Financeiro
5. **ETAPA 5** - Relatórios (opcional, já funciona)
6. **ETAPA 6** - Configurações

---

## 📦 Estrutura de Arquivos a Criar

### Backend:
```
backend/
├── src/
│   ├── routes/
│   │   └── organizerRoutes.ts (NOVO)
│   ├── controllers/
│   │   └── organizerController.ts (NOVO)
│   ├── services/
│   │   └── organizerService.ts (NOVO)
│   └── middleware/
│       └── authorization.ts (verificar requireRole para organizer)
└── migrations/
    ├── 011_organizer_views.sql (NOVO - se necessário)
    ├── 012_organizer_financial.sql (NOVO - se necessário)
    └── 013_organizer_settings.sql (NOVO - se necessário)
```

### Frontend:
```
src/
├── lib/
│   └── api/
│       └── organizer.ts (NOVO)
└── components/
    └── organizer/
        ├── OrganizerDashboardOverview.tsx (ATUALIZAR)
        ├── OrganizerEvents.tsx (ATUALIZAR)
        ├── OrganizerRegistrations.tsx (ATUALIZAR)
        ├── OrganizerFinancial.tsx (ATUALIZAR)
        ├── OrganizerReports.tsx (OTIMIZAR - opcional)
        └── OrganizerSettings.tsx (ATUALIZAR)
```

---

## ✅ Checklist de Validação

Para cada etapa, validar:
- [ ] Dados carregando corretamente da API
- [ ] Loading states implementados
- [ ] Error handling implementado
- [ ] Filtros e busca funcionando
- [ ] Ações (criar/editar/excluir) funcionando
- [ ] Validação de permissões (só organizador pode ver seus dados)
- [ ] Testes manuais realizados

---

## 🚀 Próximos Passos

1. Criar estrutura base de rotas/organizerRoutes.ts
2. Começar pela ETAPA 1 (Dashboard Overview)
3. Seguir ordem sequencial
4. Testar cada etapa antes de prosseguir

---

**Status:** Aguardando confirmação para iniciar ETAPA 1




