# Plano de Implementação - Admin Dashboard

Este documento detalha o plano de implementação das APIs e banco de dados para substituir os dados mockados no painel administrativo.

## Estrutura do Admin Dashboard

O painel admin possui 9 seções principais:

1. **Dashboard (Overview)** - Visão geral com métricas e gráficos
2. **Usuários** - Gestão de organizadores, atletas e administradores
3. **Eventos** - Gestão de eventos (já parcialmente migrado)
4. **Financeiro** - Gestão de saques, reembolsos e configurações financeiras
5. **Relatórios** - Relatórios avançados e personalizados
6. **Base de Conhecimento** - Gestão de artigos e categorias FAQ
7. **Personalizar** - Customização da home page (já migrado)
8. **Configurações** - Configurações do sistema
9. **Suporte** - Chamados, comunicados e FAQ

---

## ETAPA 1: Dashboard Overview (Dashboard Geral)

### Objetivo
Substituir dados mockados por dados reais do banco de dados.

### Dados Necessários

#### Métricas Principais:
- **Eventos Ativos**: Contagem de eventos com status 'published' ou 'ongoing'
- **Total de Atletas**: Contagem de perfis com role 'runner'
- **Organizadores Ativos**: Contagem de perfis com role 'organizer' e status ativo
- **Faturamento Total**: Soma de `total_amount` de registrations com `payment_status = 'paid'`

#### Métricas Secundárias:
- **Inscrições Totais**: Contagem total de registrations com status 'confirmed'
- **Comissões Arrecadadas**: 5% do faturamento total (configurável)
- **Eventos Finalizados**: Contagem de eventos com status 'finished'

#### Gráficos:
- **Inscrições por Mês**: Agrupamento de registrations por mês (últimos 6 meses)
- **Faturamento Mensal**: Soma de `total_amount` por mês (últimos 6 meses)

#### Ações Rápidas:
- **Aprovar Organizadores**: Contagem de organizadores pendentes (requer nova tabela `organizer_approvals`)
- **Ver Relatórios**: Link para seção de relatórios
- **Enviar Comunicado Global**: Link para seção de suporte

### Implementação Backend

#### 1.1 Criar Tabela de Estatísticas (Opcional - pode usar views)
```sql
-- View para estatísticas do dashboard
CREATE VIEW admin_dashboard_stats AS
SELECT 
  (SELECT COUNT(*) FROM events WHERE status IN ('published', 'ongoing')) as active_events,
  (SELECT COUNT(*) FROM profiles p 
   JOIN user_roles ur ON p.id = ur.user_id 
   WHERE ur.role = 'runner') as total_runners,
  (SELECT COUNT(*) FROM profiles p 
   JOIN user_roles ur ON p.id = ur.user_id 
   WHERE ur.role = 'organizer') as active_organizers,
  (SELECT COALESCE(SUM(total_amount), 0) FROM registrations 
   WHERE payment_status = 'paid') as total_revenue,
  (SELECT COUNT(*) FROM registrations WHERE status = 'confirmed') as total_registrations,
  (SELECT COUNT(*) FROM events WHERE status = 'finished') as finished_events;
```

#### 1.2 Criar Endpoint `/api/admin/dashboard/stats`
- **GET** `/api/admin/dashboard/stats`
- Retorna todas as métricas principais e secundárias
- Requer role: `admin`

#### 1.3 Criar Endpoint `/api/admin/dashboard/charts`
- **GET** `/api/admin/dashboard/charts?period=6months`
- Retorna dados para gráficos de inscrições e faturamento
- Requer role: `admin`

### Implementação Frontend

#### 1.4 Atualizar `DashboardOverview.tsx`
- Remover dados mockados
- Implementar `loadDashboardStats()` usando novo endpoint
- Implementar `loadChartData()` usando novo endpoint
- Adicionar loading states e error handling

### Arquivos a Modificar/Criar

**Backend:**
- `backend/src/controllers/adminController.ts` (novo)
- `backend/src/routes/adminRoutes.ts` (novo)
- `backend/src/services/adminService.ts` (novo)

**Frontend:**
- `src/components/admin/DashboardOverview.tsx`
- `src/lib/api/admin.ts` (novo)

---

## ETAPA 2: Gestão de Usuários

### Objetivo
Implementar CRUD completo para gestão de usuários (organizadores, atletas, admins).

### Dados Necessários

#### Organizadores:
- Lista de perfis com role 'organizer'
- Estatísticas: número de eventos, inscrições totais, faturamento
- Status: ativo/pendente/bloqueado (requer nova coluna `status` em `profiles`)

#### Atletas:
- Lista de perfis com role 'runner'
- Estatísticas: número de inscrições
- Status: ativo/bloqueado

#### Administradores:
- Lista de perfis com role 'admin'
- Função/role específica (super_admin, financial, etc.)

### Implementação Backend

#### 2.1 Adicionar Coluna `status` em `profiles`
```sql
ALTER TABLE profiles ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'pending', 'blocked'));
CREATE INDEX idx_profiles_status ON profiles(status);
```

#### 2.2 Criar Endpoints de Usuários
- **GET** `/api/admin/users/organizers` - Lista organizadores com estatísticas
- **GET** `/api/admin/users/athletes` - Lista atletas com estatísticas
- **GET** `/api/admin/users/admins` - Lista administradores
- **GET** `/api/admin/users/:id` - Detalhes de um usuário
- **PUT** `/api/admin/users/:id` - Atualizar usuário (status, etc.)
- **POST** `/api/admin/users/:id/approve` - Aprovar organizador
- **POST** `/api/admin/users/:id/block` - Bloquear usuário
- **POST** `/api/admin/users/:id/unblock` - Desbloquear usuário
- **POST** `/api/admin/users/:id/reset-password` - Redefinir senha
- **POST** `/api/admin/users/admins` - Criar novo admin
- **GET** `/api/admin/users/export?type=organizers|athletes|admins` - Exportar dados

### Implementação Frontend

#### 2.3 Atualizar `UserManagement.tsx`
- Remover dados mockados
- Implementar carregamento de dados por aba
- Implementar ações: aprovar, bloquear, editar, exportar
- Adicionar paginação e busca

### Arquivos a Modificar/Criar

**Backend:**
- `backend/src/controllers/userManagementController.ts` (novo)
- `backend/src/services/userManagementService.ts` (novo)
- `backend/src/routes/adminRoutes.ts` (adicionar rotas)

**Frontend:**
- `src/components/admin/UserManagement.tsx`
- `src/lib/api/userManagement.ts` (novo)

---

## ETAPA 3: Gestão Financeira

### Objetivo
Implementar gestão de saques, reembolsos e configurações financeiras.

### Dados Necessários

#### Saques:
- Solicitações de saque dos organizadores
- Valor solicitado, taxa (5%), valor líquido
- Método de pagamento (PIX, TED)
- Status: pendente/aprovado/rejeitado

#### Reembolsos:
- Solicitações de reembolso de atletas
- Evento, valor, motivo
- Status: em_analise/aprovado/rejeitado

#### Configurações:
- Taxa de comissão da plataforma (5%)
- Valor mínimo para saque
- Configurações de gateway de pagamento

### Implementação Backend

#### 3.1 Criar Tabela `withdraw_requests`
```sql
CREATE TABLE withdraw_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organizer_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  fee DECIMAL(10,2) NOT NULL,
  net_amount DECIMAL(10,2) NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('PIX', 'TED', 'BANK_TRANSFER')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_withdraw_requests_organizer_id ON withdraw_requests(organizer_id);
CREATE INDEX idx_withdraw_requests_status ON withdraw_requests(status);
```

#### 3.2 Criar Tabela `refund_requests`
```sql
CREATE TABLE refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE NOT NULL,
  athlete_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  event_id UUID REFERENCES events(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  reason TEXT NOT NULL,
  status TEXT DEFAULT 'em_analise' CHECK (status IN ('em_analise', 'aprovado', 'rejeitado')),
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  processed_at TIMESTAMP WITH TIME ZONE,
  processed_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_refund_requests_registration_id ON refund_requests(registration_id);
CREATE INDEX idx_refund_requests_athlete_id ON refund_requests(athlete_id);
CREATE INDEX idx_refund_requests_status ON refund_requests(status);
```

#### 3.3 Criar Tabela `financial_settings`
```sql
CREATE TABLE financial_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_percentage DECIMAL(5,2) DEFAULT 5.00,
  min_withdraw_amount DECIMAL(10,2) DEFAULT 100.00,
  payment_gateway TEXT DEFAULT 'mercadopago',
  gateway_public_key TEXT,
  gateway_private_key TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);
```

#### 3.4 Criar Endpoints Financeiros
- **GET** `/api/admin/financial/overview` - Visão geral financeira
- **GET** `/api/admin/financial/withdrawals` - Lista de saques
- **POST** `/api/admin/financial/withdrawals/:id/approve` - Aprovar saque
- **POST** `/api/admin/financial/withdrawals/:id/reject` - Rejeitar saque
- **GET** `/api/admin/financial/refunds` - Lista de reembolsos
- **POST** `/api/admin/financial/refunds/:id/approve` - Aprovar reembolso
- **POST** `/api/admin/financial/refunds/:id/reject` - Rejeitar reembolso
- **GET** `/api/admin/financial/settings` - Obter configurações
- **PUT** `/api/admin/financial/settings` - Atualizar configurações

### Implementação Frontend

#### 3.5 Atualizar `FinancialManagement.tsx`
- Remover dados mockados
- Implementar carregamento de saques e reembolsos
- Implementar ações de aprovação/rejeição
- Implementar configurações financeiras

### Arquivos a Modificar/Criar

**Backend:**
- `backend/src/controllers/financialController.ts` (novo)
- `backend/src/services/financialService.ts` (novo)
- `backend/src/routes/adminRoutes.ts` (adicionar rotas)

**Frontend:**
- `src/components/admin/FinancialManagement.tsx`
- `src/lib/api/financial.ts` (novo)

---

## ETAPA 4: Relatórios Avançados

### Objetivo
Implementar geração de relatórios personalizados (PDF, Excel).

### Relatórios Disponíveis:
1. Inscrições por Período
2. Novos Usuários por Mês
3. Faturamento Detalhado
4. Ranking de Organizadores
5. Média de Inscrições por Atleta
6. Evolução de Inscrições

### Implementação Backend

#### 4.1 Criar Endpoints de Relatórios
- **GET** `/api/admin/reports/registrations-by-period?start_date=&end_date=` - Inscrições por período
- **GET** `/api/admin/reports/new-users-by-month?months=6` - Novos usuários por mês
- **GET** `/api/admin/reports/revenue-detailed?start_date=&end_date=` - Faturamento detalhado
- **GET** `/api/admin/reports/organizer-ranking?limit=10` - Ranking de organizadores
- **GET** `/api/admin/reports/avg-registrations-per-athlete` - Média de inscrições por atleta
- **GET** `/api/admin/reports/registrations-evolution?months=6` - Evolução de inscrições
- **POST** `/api/admin/reports/custom` - Relatório personalizado
- **GET** `/api/admin/reports/export?type=&format=pdf|excel&params=...` - Exportar relatório

### Implementação Frontend

#### 4.2 Atualizar `AdvancedReports.tsx`
- Remover dados mockados
- Implementar geração de relatórios
- Implementar exportação (PDF/Excel)
- Implementar filtros personalizados

### Arquivos a Modificar/Criar

**Backend:**
- `backend/src/controllers/reportsController.ts` (novo)
- `backend/src/services/reportsService.ts` (novo)
- `backend/src/utils/pdfGenerator.ts` (novo)
- `backend/src/utils/excelGenerator.ts` (novo)
- `backend/src/routes/adminRoutes.ts` (adicionar rotas)

**Frontend:**
- `src/components/admin/AdvancedReports.tsx`
- `src/lib/api/reports.ts` (novo)

---

## ETAPA 5: Base de Conhecimento

### Objetivo
Implementar CRUD completo para artigos e categorias da base de conhecimento.

### Dados Necessários

#### Artigos:
- Título, slug, categoria, conteúdo
- Status: rascunho/publicado
- Visualizações, datas de criação/atualização

#### Categorias:
- Nome, slug, contagem de artigos

### Implementação Backend

#### 5.1 Criar Tabela `knowledge_categories`
```sql
CREATE TABLE knowledge_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_knowledge_categories_slug ON knowledge_categories(slug);
```

#### 5.2 Criar Tabela `knowledge_articles`
```sql
CREATE TABLE knowledge_articles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES knowledge_categories(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  content TEXT NOT NULL,
  status TEXT DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado')),
  views INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_knowledge_articles_category_id ON knowledge_articles(category_id);
CREATE INDEX idx_knowledge_articles_slug ON knowledge_articles(slug);
CREATE INDEX idx_knowledge_articles_status ON knowledge_articles(status);
```

#### 5.3 Criar Endpoints de Base de Conhecimento
- **GET** `/api/admin/knowledge/articles` - Lista artigos
- **GET** `/api/admin/knowledge/articles/:id` - Detalhes do artigo
- **POST** `/api/admin/knowledge/articles` - Criar artigo
- **PUT** `/api/admin/knowledge/articles/:id` - Atualizar artigo
- **DELETE** `/api/admin/knowledge/articles/:id` - Deletar artigo
- **POST** `/api/admin/knowledge/articles/:id/toggle-status` - Alternar status
- **GET** `/api/admin/knowledge/categories` - Lista categorias
- **POST** `/api/admin/knowledge/categories` - Criar categoria
- **PUT** `/api/admin/knowledge/categories/:id` - Atualizar categoria
- **DELETE** `/api/admin/knowledge/categories/:id` - Deletar categoria

### Implementação Frontend

#### 5.4 Atualizar `KnowledgeBase.tsx`
- Remover dados mockados
- Implementar CRUD de artigos
- Implementar CRUD de categorias
- Adicionar editor de conteúdo (markdown ou rich text)

### Arquivos a Modificar/Criar

**Backend:**
- `backend/src/controllers/knowledgeController.ts` (novo)
- `backend/src/services/knowledgeService.ts` (novo)
- `backend/src/routes/adminRoutes.ts` (adicionar rotas)

**Frontend:**
- `src/components/admin/KnowledgeBase.tsx`
- `src/lib/api/knowledge.ts` (novo)

---

## ETAPA 6: Configurações do Sistema

### Objetivo
Implementar gestão de configurações globais do sistema.

### Configurações Necessárias:
- Logo da plataforma (já implementado via localStorage, migrar para banco)
- Dados institucionais (nome, email, telefone, endereço, redes sociais)
- Configurações de e-mail (SMTP)
- Gateway de pagamento
- Módulos do sistema (ativar/desativar funcionalidades)

### Implementação Backend

#### 6.1 Criar Tabela `system_settings`
```sql
CREATE TABLE system_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value TEXT,
  setting_type TEXT DEFAULT 'text' CHECK (setting_type IN ('text', 'number', 'boolean', 'json')),
  category TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_system_settings_key ON system_settings(setting_key);
CREATE INDEX idx_system_settings_category ON system_settings(category);
```

#### 6.2 Criar Endpoints de Configurações
- **GET** `/api/admin/settings` - Obter todas as configurações
- **GET** `/api/admin/settings/:category` - Obter configurações por categoria
- **PUT** `/api/admin/settings` - Atualizar configurações (múltiplas)
- **POST** `/api/admin/settings/logo` - Upload de logo
- **DELETE** `/api/admin/settings/logo` - Remover logo

### Implementação Frontend

#### 6.3 Atualizar `SystemSettings.tsx`
- Migrar logo de localStorage para banco
- Implementar carregamento de configurações
- Implementar salvamento de configurações
- Adicionar validações

### Arquivos a Modificar/Criar

**Backend:**
- `backend/src/controllers/settingsController.ts` (novo)
- `backend/src/services/settingsService.ts` (novo)
- `backend/src/routes/adminRoutes.ts` (adicionar rotas)
- `backend/src/middleware/upload.ts` (para upload de logo)

**Frontend:**
- `src/components/admin/SystemSettings.tsx`
- `src/lib/api/settings.ts` (novo)

---

## ETAPA 7: Comunicação e Suporte

### Objetivo
Implementar gestão de chamados, comunicados e FAQ.

### Dados Necessários

#### Chamados:
- ID, usuário, tipo (atleta/organizador), assunto, status, data

#### Comunicados:
- Destinatários, assunto, mensagem, data de envio

#### FAQ:
- Pergunta, categoria, status, resposta

### Implementação Backend

#### 7.1 Criar Tabela `support_tickets`
```sql
CREATE TABLE support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('atleta', 'organizador')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT DEFAULT 'aberto' CHECK (status IN ('aberto', 'respondido', 'em_analise', 'encerrado')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  responded_at TIMESTAMP WITH TIME ZONE,
  responded_by UUID REFERENCES profiles(id)
);

CREATE INDEX idx_support_tickets_user_id ON support_tickets(user_id);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);
```

#### 7.2 Criar Tabela `announcements`
```sql
CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  target_audience TEXT NOT NULL CHECK (target_audience IN ('all', 'athletes', 'organizers', 'filtered')),
  subject TEXT NOT NULL,
  message TEXT NOT NULL,
  sent_at TIMESTAMP WITH TIME ZONE,
  created_by UUID REFERENCES profiles(id) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_announcements_target_audience ON announcements(target_audience);
CREATE INDEX idx_announcements_sent_at ON announcements(sent_at);
```

#### 7.3 Criar Tabela `faq_items`
```sql
CREATE TABLE faq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT DEFAULT 'rascunho' CHECK (status IN ('rascunho', 'publicado')),
  order_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_faq_items_category ON faq_items(category);
CREATE INDEX idx_faq_items_status ON faq_items(status);
```

#### 7.4 Criar Endpoints de Suporte
- **GET** `/api/admin/support/tickets` - Lista chamados
- **GET** `/api/admin/support/tickets/:id` - Detalhes do chamado
- **POST** `/api/admin/support/tickets/:id/respond` - Responder chamado
- **POST** `/api/admin/support/tickets/:id/close` - Encerrar chamado
- **GET** `/api/admin/support/announcements` - Lista comunicados
- **POST** `/api/admin/support/announcements` - Criar comunicado
- **GET** `/api/admin/support/faq` - Lista FAQ
- **POST** `/api/admin/support/faq` - Criar item FAQ
- **PUT** `/api/admin/support/faq/:id` - Atualizar item FAQ
- **DELETE** `/api/admin/support/faq/:id` - Deletar item FAQ

### Implementação Frontend

#### 7.5 Atualizar `CommunicationSupport.tsx`
- Remover dados mockados
- Implementar gestão de chamados
- Implementar envio de comunicados
- Implementar CRUD de FAQ

### Arquivos a Modificar/Criar

**Backend:**
- `backend/src/controllers/supportController.ts` (novo)
- `backend/src/services/supportService.ts` (novo)
- `backend/src/routes/adminRoutes.ts` (adicionar rotas)

**Frontend:**
- `src/components/admin/CommunicationSupport.tsx`
- `src/lib/api/support.ts` (novo)

---

## ETAPA 8: Melhorias no EventManagement

### Objetivo
Completar a migração do EventManagement (já parcialmente migrado).

### Melhorias Necessárias:
- Calcular revenue corretamente a partir de registrations
- Adicionar filtros avançados
- Melhorar estatísticas de eventos
- Adicionar exportação de dados

### Implementação Backend

#### 8.1 Melhorar Endpoint de Eventos
- Adicionar cálculo de revenue no endpoint existente
- Adicionar filtros por status, data, organizador
- Adicionar ordenação e paginação

### Implementação Frontend

#### 8.2 Atualizar `EventManagement.tsx`
- Melhorar cálculo de revenue
- Adicionar filtros
- Adicionar exportação

### Arquivos a Modificar

**Backend:**
- `backend/src/controllers/eventsController.ts` (melhorar)
- `backend/src/services/eventsService.ts` (melhorar)

**Frontend:**
- `src/components/admin/EventManagement.tsx`

---

## Resumo das Etapas

| Etapa | Seção | Complexidade | Prioridade |
|-------|-------|--------------|------------|
| 1 | Dashboard Overview | Média | Alta |
| 2 | Gestão de Usuários | Alta | Alta |
| 3 | Gestão Financeira | Alta | Alta |
| 4 | Relatórios Avançados | Média | Média |
| 5 | Base de Conhecimento | Baixa | Média |
| 6 | Configurações do Sistema | Média | Média |
| 7 | Comunicação e Suporte | Média | Baixa |
| 8 | Melhorias EventManagement | Baixa | Média |

---

## Ordem de Implementação Recomendada

1. **ETAPA 1** - Dashboard Overview (base para outras funcionalidades)
2. **ETAPA 2** - Gestão de Usuários (necessário para outras funcionalidades)
3. **ETAPA 3** - Gestão Financeira (depende de usuários e eventos)
4. **ETAPA 8** - Melhorias EventManagement (completar migração)
5. **ETAPA 5** - Base de Conhecimento (independente)
6. **ETAPA 6** - Configurações do Sistema (independente)
7. **ETAPA 4** - Relatórios Avançados (depende de outras funcionalidades)
8. **ETAPA 7** - Comunicação e Suporte (independente)

---

## Notas Importantes

1. **Autenticação e Autorização**: Todos os endpoints devem verificar role `admin`
2. **Validação**: Usar Zod para validação de dados em todos os endpoints
3. **Error Handling**: Implementar tratamento de erros consistente
4. **Logging**: Registrar todas as ações administrativas
5. **Testes**: Criar testes para cada endpoint implementado
6. **Documentação**: Atualizar API_DOCUMENTATION.md com novos endpoints

---

## Próximos Passos

Após cada etapa ser implementada e testada, o usuário deve confirmar com "OK ETAPA X" para prosseguir para a próxima etapa.




