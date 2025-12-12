# Sistema de Líder de Grupo / Afiliado

## 📋 Visão Geral

Sistema que permite que runners sejam marcados como "Líderes de Grupo", recebendo um código e link de referência único. Quando novos usuários se cadastram usando esse código/link, o líder recebe comissão sobre as inscrições realizadas por esses usuários.

## 🎯 Objetivos

1. Permitir que runners sejam marcados como líderes de grupo
2. Gerar código e link de referência único para cada líder
3. Rastrear cadastros realizados através de referência
4. Calcular e registrar comissões sobre inscrições
5. Permitir que admin configure percentual de comissão
6. Fornecer dashboard para líderes visualizarem suas comissões

## 📊 Estrutura de Dados

### Tabelas Necessárias

#### 1. `group_leaders` (Líderes de Grupo)
```sql
- id (UUID, PK)
- user_id (UUID, FK -> users.id, UNIQUE)
- referral_code (VARCHAR, UNIQUE) -- Código único de referência
- is_active (BOOLEAN, DEFAULT true)
- commission_percentage (DECIMAL) -- Percentual de comissão (pode ser sobrescrito por configuração global)
- total_earnings (DECIMAL, DEFAULT 0) -- Total de comissões recebidas
- total_referrals (INTEGER, DEFAULT 0) -- Total de usuários referenciados
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

#### 2. `user_referrals` (Referências de Usuários)
```sql
- id (UUID, PK)
- user_id (UUID, FK -> users.id, UNIQUE) -- Usuário que se cadastrou
- leader_id (UUID, FK -> group_leaders.id) -- Líder que referenciou
- referral_code (VARCHAR) -- Código usado no cadastro
- referral_type (VARCHAR) -- 'link' ou 'code'
- created_at (TIMESTAMP)
```

#### 3. `leader_commissions` (Comissões dos Líderes)
```sql
- id (UUID, PK)
- leader_id (UUID, FK -> group_leaders.id)
- registration_id (UUID, FK -> registrations.id)
- referred_user_id (UUID, FK -> users.id)
- event_id (UUID, FK -> events.id)
- commission_amount (DECIMAL) -- Valor da comissão
- commission_percentage (DECIMAL) -- Percentual aplicado
- registration_amount (DECIMAL) -- Valor da inscrição
- status (VARCHAR) -- 'pending', 'paid', 'cancelled'
- paid_at (TIMESTAMP, NULL)
- created_at (TIMESTAMP)
```

#### 4. `system_settings` (Atualização)
Adicionar campo:
```sql
- leader_commission_percentage (DECIMAL, DEFAULT 0) -- Percentual global de comissão
```

## 🚀 Plano de Ação

### ETAPA 1: Banco de Dados e Estrutura Base
**Objetivo:** Criar estrutura de dados no banco

**Tarefas:**
1. Criar migration `030_create_group_leaders_system.sql`
   - Criar tabela `group_leaders`
   - Criar tabela `user_referrals`
   - Criar tabela `leader_commissions`
   - Adicionar campo `leader_commission_percentage` em `system_settings`
   - Criar índices para performance
   - Adicionar constraints e foreign keys

2. Atualizar `backend/src/types/index.ts`
   - Adicionar interfaces TypeScript:
     - `GroupLeader`
     - `UserReferral`
     - `LeaderCommission`

3. Atualizar `backend/scripts/run-migrations.ts`
   - Adicionar nova migration à lista

**Entregáveis:**
- ✅ Migration criada e testada
- ✅ Interfaces TypeScript atualizadas
- ✅ Estrutura de banco validada

---

### ETAPA 2: Backend - Serviços e Lógica de Negócio
**Objetivo:** Implementar serviços para gerenciar líderes e comissões

**Tarefas:**
1. Criar `backend/src/services/groupLeadersService.ts`
   - `createGroupLeader(userId)` - Criar líder e gerar código único
   - `getGroupLeaderByUserId(userId)` - Buscar líder por usuário
   - `getGroupLeaderByCode(referralCode)` - Buscar líder por código
   - `generateReferralCode()` - Gerar código único (ex: LEADER-XXXXX)
   - `updateGroupLeader(leaderId, data)` - Atualizar dados do líder
   - `deactivateGroupLeader(leaderId)` - Desativar líder

2. Criar `backend/src/services/referralsService.ts`
   - `createUserReferral(userId, referralCode, referralType)` - Registrar referência
   - `getUserReferral(userId)` - Buscar referência de um usuário
   - `getReferralsByLeader(leaderId)` - Listar todos os referenciados de um líder

3. Criar `backend/src/services/commissionsService.ts`
   - `calculateCommission(registrationId, leaderId)` - Calcular comissão
   - `createCommission(data)` - Criar registro de comissão
   - `getCommissionsByLeader(leaderId, filters)` - Listar comissões do líder
   - `updateCommissionStatus(commissionId, status)` - Atualizar status
   - `getTotalEarnings(leaderId)` - Calcular total de ganhos

4. Atualizar `backend/src/services/registrationsService.ts`
   - Modificar `createRegistration` para verificar se usuário tem referência
   - Após criar inscrição, calcular e criar comissão se aplicável

5. Atualizar `backend/src/services/authService.ts`
   - Modificar `register` para aceitar `referral_code` opcional
   - Registrar referência se código for fornecido

**Entregáveis:**
- ✅ Serviços criados e testados
- ✅ Lógica de cálculo de comissão implementada
- ✅ Integração com cadastro e inscrições

---

### ETAPA 3: Backend - Controllers e Rotas
**Objetivo:** Criar endpoints da API

**Tarefas:**
1. Criar `backend/src/controllers/groupLeadersController.ts`
   - `POST /api/group-leaders` - Criar líder (admin)
   - `GET /api/group-leaders/me` - Obter dados do próprio líder
   - `GET /api/group-leaders/:id` - Obter líder por ID (admin)
   - `PUT /api/group-leaders/:id` - Atualizar líder (admin)
   - `DELETE /api/group-leaders/:id` - Desativar líder (admin)
   - `GET /api/group-leaders/:id/referrals` - Listar referenciados
   - `GET /api/group-leaders/:id/commissions` - Listar comissões

2. Criar `backend/src/routes/groupLeaders.ts`
   - Definir rotas e middlewares
   - Proteger rotas com autenticação e autorização

3. Atualizar `backend/src/server.ts`
   - Registrar rotas de group-leaders

4. Atualizar `backend/src/controllers/authController.ts`
   - Modificar endpoint de registro para aceitar `referral_code`

5. Atualizar `backend/src/controllers/systemSettingsController.ts`
   - Adicionar endpoint para configurar `leader_commission_percentage`

**Entregáveis:**
- ✅ Endpoints criados e documentados
- ✅ Validações e tratamento de erros
- ✅ Testes de integração

---

### ETAPA 4: Frontend - Interface do Admin
**Objetivo:** Permitir que admin gerencie líderes

**Tarefas:**
1. Criar `src/components/admin/GroupLeadersManagement.tsx`
   - Lista de líderes com filtros
   - Botão para criar novo líder
   - Ações: editar, desativar, ver detalhes
   - Estatísticas: total de líderes, total de referências, total de comissões

2. Criar `src/components/admin/GroupLeaderDialog.tsx`
   - Formulário para criar/editar líder
   - Seleção de usuário (runner)
   - Configuração de percentual de comissão (opcional)
   - Exibição de código e link de referência

3. Criar `src/components/admin/GroupLeaderDetails.tsx`
   - Detalhes do líder
   - Lista de usuários referenciados
   - Histórico de comissões
   - Gráficos de performance

4. Atualizar `src/components/admin/SystemSettings.tsx`
   - Adicionar campo para configurar percentual global de comissão

5. Atualizar `src/lib/api/admin.ts`
   - Adicionar funções para gerenciar líderes

**Entregáveis:**
- ✅ Interface de gerenciamento completa
- ✅ CRUD de líderes funcionando
- ✅ Configurações de comissão

---

### ETAPA 5: Frontend - Interface do Líder
**Objetivo:** Dashboard para líderes visualizarem seus dados

**Tarefas:**
1. Criar `src/components/leader/LeaderDashboard.tsx`
   - Visão geral: código, link, estatísticas
   - Cards com métricas: total referenciados, comissões pendentes, comissões pagas
   - Gráficos de performance

2. Criar `src/components/leader/ReferralLink.tsx`
   - Exibir código de referência
   - Exibir link de referência
   - Botão para copiar link/código
   - QR Code do link (opcional)

3. Criar `src/components/leader/MyReferrals.tsx`
   - Lista de usuários referenciados
   - Filtros e busca
   - Informações: data de cadastro, status, inscrições realizadas

4. Criar `src/components/leader/MyCommissions.tsx`
   - Lista de comissões
   - Filtros: status, período, evento
   - Detalhes: valor, percentual, data, status
   - Total de ganhos

5. Atualizar `src/components/runner/Profile.tsx`
   - Adicionar seção "Líder de Grupo" se usuário for líder
   - Link para dashboard do líder

6. Criar `src/lib/api/groupLeaders.ts`
   - Funções para buscar dados do líder
   - Funções para listar referências e comissões

**Entregáveis:**
- ✅ Dashboard do líder completo
- ✅ Visualização de referências e comissões
- ✅ Integração com perfil do runner

---

### ETAPA 6: Integração com Cadastro e Inscrições
**Objetivo:** Integrar sistema de referência no fluxo de cadastro e inscrições

**Tarefas:**
1. Atualizar `src/components/MultiStepRegistration.tsx`
   - Adicionar campo opcional para código de referência (Etapa 1 ou 4)
   - Validar código de referência
   - Enviar código no registro

2. Atualizar `src/components/LoginDialog.tsx`
   - Adicionar campo opcional para código de referência no cadastro simples

3. Atualizar `src/components/event/RegistrationFlow.tsx`
   - Após criar inscrição, verificar se usuário tem referência
   - Exibir mensagem se comissão foi gerada para o líder

4. Criar componente `src/components/shared/ReferralCodeInput.tsx`
   - Input para código de referência
   - Validação em tempo real
   - Mensagem de sucesso ao validar código

5. Atualizar `src/lib/api/auth.ts`
   - Adicionar `referral_code` opcional no `RegisterData`

**Entregáveis:**
- ✅ Código de referência no cadastro
- ✅ Validação e registro de referências
- ✅ Cálculo automático de comissões

---

## 🔧 Funcionalidades Técnicas

### Geração de Código de Referência
- Formato: `XXX###` (3 letras + 3 números)
- Exemplo: `ABC123`, `XYZ789`
- Deve ser único e não pode ser adivinhado facilmente

### Link de Referência
- Formato: `https://cronoteam.com/cadastro?ref=XXX###`
- Ou: `https://cronoteam.com/register?code=XXX###`

### Cálculo de Comissão
```typescript
// Lógica de cálculo
const commissionPercentage = leader.commission_percentage || systemSettings.leader_commission_percentage;
const commissionAmount = registrationAmount * (commissionPercentage / 100);
```

### Status de Comissão
- `pending`: Comissão calculada, aguardando pagamento
- `paid`: Comissão paga ao líder
- `cancelled`: Comissão cancelada (inscrição cancelada)

## 📝 Pontos de Atenção

1. **Segurança:**
   - Validar que apenas admins podem criar/editar líderes
   - Validar que líder só vê seus próprios dados
   - Validar código de referência no cadastro

2. **Performance:**
   - Índices nas tabelas de referências e comissões
   - Cache de estatísticas do líder
   - Paginação nas listagens

3. **UX:**
   - Feedback visual ao copiar link/código
   - Mensagens claras sobre comissões
   - Dashboard intuitivo e informativo

4. **Negócio:**
   - Permitir múltiplos níveis de comissão? (futuro)
   - Comissão apenas na primeira inscrição ou em todas?
   - Como será o pagamento das comissões? (manual ou automático)

## ✅ Checklist Final

### Banco de Dados
- [ ] Migration criada e testada
- [ ] Índices criados
- [ ] Constraints aplicadas
- [ ] Dados de teste inseridos

### Backend
- [ ] Serviços implementados
- [ ] Controllers criados
- [ ] Rotas configuradas
- [ ] Validações implementadas
- [ ] Testes unitários

### Frontend - Admin
- [ ] Gerenciamento de líderes
- [ ] Configuração de comissões
- [ ] Visualização de estatísticas

### Frontend - Líder
- [ ] Dashboard do líder
- [ ] Visualização de referências
- [ ] Visualização de comissões
- [ ] Link e código de referência

### Integração
- [ ] Código no cadastro
- [ ] Cálculo automático de comissões
- [ ] Notificações (opcional)

## 🎯 Próximos Passos

Após implementação básica, considerar:
- Sistema de pagamento automático de comissões
- Múltiplos níveis de comissão (network marketing)
- Relatórios avançados e exportação
- Notificações por email quando comissão é gerada
- Sistema de metas e bonificações

---

**Documento criado em:** 2024
**Versão:** 1.0
**Status:** Planejamento

