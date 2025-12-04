# Plano de Migração - Painel do Runner

## Objetivo
Migrar completamente o painel do runner (`/runner/dashboard`) para usar dados reais da API, removendo todos os dados mockados e conectando cada funcionalidade aos endpoints correspondentes.

## Estrutura do Painel

O painel do runner possui 4 abas principais (via BottomNav):
1. **Home** - ExploreEvents (Explorar Corridas)
2. **Registrations** - MyRegistrations (Minhas Inscrições)
3. **Results** - Results (Meus Resultados)
4. **Profile** - Profile (Meu Perfil)

Além disso, existe uma página separada `/runner/profile` com visualização mais detalhada.

---

## ETAPA 1: Dashboard Overview / ExploreEvents ✅
**Status:** Parcialmente migrado

### O que já está feito:
- ✅ Componente `ExploreEvents` já usa `getEvents` da API
- ✅ Filtros de cidade e mês funcionando
- ✅ Lista de eventos publicados carregando corretamente

### O que precisa ser feito:
- [ ] Verificar se há necessidade de adicionar estatísticas no topo (total de eventos, próximos eventos, etc.)
- [ ] Adicionar loading states mais robustos
- [ ] Melhorar tratamento de erros

**Endpoint necessário:** `GET /api/events?status=published` (já existe)

---

## ETAPA 2: Minhas Inscrições (MyRegistrations)
**Status:** Parcialmente migrado

### O que já está feito:
- ✅ Componente `MyRegistrations` já usa `getRegistrations` da API
- ✅ Filtros por status (ativas, pendentes, canceladas) funcionando
- ✅ Exibição de dados básicos das inscrições

### O que precisa ser feito:
- [ ] **Corrigir transferência de inscrição** - Atualmente usa `supabase` diretamente, precisa criar endpoint
- [ ] Adicionar endpoint para buscar detalhes completos da inscrição (incluindo categoria, kit, etc.)
- [ ] Melhorar exibição de dados (adicionar mais informações)
- [ ] Adicionar funcionalidade de cancelamento de inscrição (se permitido)
- [ ] Adicionar download de comprovante/QR Code
- [ ] Adicionar filtros adicionais (por evento, por data)

**Endpoints necessários:**
- ✅ `GET /api/registrations?runner_id={id}` (já existe)
- [ ] `PUT /api/registrations/:id/transfer` (criar)
- [ ] `PUT /api/registrations/:id/cancel` (criar ou usar existente)
- [ ] `GET /api/registrations/:id/details` (criar ou usar existente)

---

## ETAPA 3: Meus Resultados (Results)
**Status:** Não migrado (100% mockado)

### O que precisa ser feito:
- [ ] Criar endpoint para buscar resultados do runner
- [ ] Conectar componente `Results` à API
- [ ] Exibir resultados reais das corridas completadas
- [ ] Adicionar estatísticas (total de provas, pódios, melhor tempo, etc.)
- [ ] Adicionar gráficos de evolução (se aplicável)
- [ ] Adicionar funcionalidade de compartilhamento de resultados
- [ ] Adicionar filtros (por evento, por data, por categoria)

**Endpoints necessários:**
- [ ] `GET /api/runner/results` (criar)
- [ ] `GET /api/runner/results/stats` (criar)
- [ ] `GET /api/runner/results/:event_id` (criar)

**Nota:** Resultados podem vir de:
1. Tabela `results` (se existir)
2. Link `result_url` do evento + parsing
3. Integração com sistema externo de resultados

---

## ETAPA 4: Perfil do Runner (Profile)
**Status:** Não migrado (100% mockado)

### Componentes relacionados:
- `Profile.tsx` - Componente principal do perfil (no dashboard)
- `RunnerProfile.tsx` - Página completa do perfil
- `ProfileEditDialog.tsx` - Dialog para editar perfil
- `DocumentsManagement.tsx` - Gerenciamento de documentos
- `PrivacySettings.tsx` - Configurações de privacidade
- `PaymentHistory.tsx` - Histórico de pagamentos
- `NotificationSettings.tsx` - Configurações de notificações
- `AccountSettings.tsx` - Configurações da conta

### O que precisa ser feito:

#### 4.1 Perfil Básico
- [ ] Conectar `Profile.tsx` ao endpoint de perfil
- [ ] Exibir dados reais do perfil (nome, email, telefone, CPF, etc.)
- [ ] Adicionar estatísticas reais (total de inscrições, corridas completadas, etc.)
- [ ] Conectar `ProfileEditDialog.tsx` ao endpoint de atualização

**Endpoints necessários:**
- ✅ `GET /api/profiles/me` (já existe)
- ✅ `PUT /api/profiles/me` (já existe)

#### 4.2 Estatísticas e Conquistas
- [ ] Calcular estatísticas reais baseadas nas inscrições:
  - Total de inscrições
  - Corridas completadas
  - Distância total percorrida
  - Valor total investido
- [ ] Implementar sistema de conquistas (achievements):
  - Primeira corrida
  - 5 corridas, 10 corridas, etc.
  - 50km totais, 100km totais, etc.
  - Outras conquistas personalizadas
- [ ] Criar endpoint para buscar conquistas do runner

**Endpoints necessários:**
- [ ] `GET /api/runner/stats` (criar)
- [ ] `GET /api/runner/achievements` (criar)

#### 4.3 Histórico de Pagamentos
- [ ] Conectar `PaymentHistory.tsx` ao endpoint de pagamentos
- [ ] Exibir histórico real de transações
- [ ] Adicionar filtros (por data, por status, por evento)

**Endpoints necessários:**
- [ ] `GET /api/runner/payments` (criar)
- [ ] `GET /api/runner/payments/:id` (criar)

#### 4.4 Documentos
- [ ] Conectar `DocumentsManagement.tsx` ao endpoint de documentos
- [ ] Permitir upload de documentos (RG, CPF, atestado médico, etc.)
- [ ] Listar documentos enviados
- [ ] Permitir download/exclusão de documentos

**Endpoints necessários:**
- [ ] `GET /api/runner/documents` (criar)
- [ ] `POST /api/runner/documents` (criar - upload)
- [ ] `DELETE /api/runner/documents/:id` (criar)

#### 4.5 Configurações
- [ ] Conectar `PrivacySettings.tsx` ao endpoint de configurações
- [ ] Conectar `NotificationSettings.tsx` ao endpoint de notificações
- [ ] Conectar `AccountSettings.tsx` ao endpoint de conta (troca de senha, etc.)

**Endpoints necessários:**
- [ ] `GET /api/runner/settings` (criar)
- [ ] `PUT /api/runner/settings` (criar)
- [ ] `PUT /api/runner/settings/password` (criar)

---

## ETAPA 5: Funcionalidades Adicionais

### 5.1 Transferência de Inscrição
- [ ] Criar endpoint `PUT /api/registrations/:id/transfer`
- [ ] Validar CPF do destinatário
- [ ] Atualizar `runner_id` da inscrição
- [ ] Enviar notificações (se aplicável)

### 5.2 Cancelamento de Inscrição
- [ ] Criar endpoint `PUT /api/registrations/:id/cancel`
- [ ] Validar regras de cancelamento (prazo, etc.)
- [ ] Processar reembolso (se aplicável)
- [ ] Atualizar status da inscrição

### 5.3 QR Code e Comprovante
- [ ] Verificar se endpoint já existe: `GET /api/registrations/:id/qrcode`
- [ ] Adicionar download de comprovante em PDF
- [ ] Melhorar visualização do QR Code

---

## Resumo de Endpoints a Criar

### Backend - Novos Endpoints Necessários:

1. **Resultados:**
   - `GET /api/runner/results` - Listar resultados do runner
   - `GET /api/runner/results/stats` - Estatísticas de resultados
   - `GET /api/runner/results/:event_id` - Resultado de um evento específico

2. **Estatísticas e Conquistas:**
   - `GET /api/runner/stats` - Estatísticas gerais do runner
   - `GET /api/runner/achievements` - Conquistas do runner

3. **Inscrições:**
   - `PUT /api/registrations/:id/transfer` - Transferir inscrição
   - `PUT /api/registrations/:id/cancel` - Cancelar inscrição
   - `GET /api/registrations/:id/details` - Detalhes completos da inscrição

4. **Pagamentos:**
   - `GET /api/runner/payments` - Histórico de pagamentos
   - `GET /api/runner/payments/:id` - Detalhes de um pagamento

5. **Documentos:**
   - `GET /api/runner/documents` - Listar documentos
   - `POST /api/runner/documents` - Upload de documento
   - `DELETE /api/runner/documents/:id` - Excluir documento

6. **Configurações:**
   - `GET /api/runner/settings` - Obter configurações
   - `PUT /api/runner/settings` - Atualizar configurações
   - `PUT /api/runner/settings/password` - Trocar senha

---

## Ordem de Execução Recomendada

1. **ETAPA 1** - Dashboard Overview (já está quase pronto, apenas ajustes)
2. **ETAPA 2** - Minhas Inscrições (corrigir transferência e adicionar funcionalidades)
3. **ETAPA 4** - Perfil do Runner (mais complexo, dividir em sub-etapas)
4. **ETAPA 3** - Meus Resultados (pode depender de dados de eventos completados)
5. **ETAPA 5** - Funcionalidades Adicionais (melhorias e extras)

---

## Notas Importantes

1. **Autenticação:** Todos os endpoints devem verificar se o usuário é um runner e se está acessando seus próprios dados.

2. **Segurança:** 
   - Validar ownership em todas as operações
   - Não permitir acesso a dados de outros runners
   - Validar CPF em transferências

3. **Performance:**
   - Usar debounce em buscas
   - Implementar paginação onde necessário
   - Cache de dados quando apropriado

4. **UX:**
   - Loading states em todas as operações
   - Mensagens de erro claras
   - Feedback visual em ações

5. **Dados Mockados:**
   - Remover todos os dados mockados após migração
   - Manter apenas fallbacks para estados vazios

---

## Checklist Final

- [ ] Todas as páginas usando dados reais
- [ ] Todos os endpoints criados e testados
- [ ] Tratamento de erros implementado
- [ ] Loading states em todas as operações
- [ ] Validações de segurança implementadas
- [ ] Dados mockados removidos
- [ ] Testes básicos realizados
- [ ] Documentação atualizada



