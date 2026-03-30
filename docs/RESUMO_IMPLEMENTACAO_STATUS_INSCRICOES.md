# Resumo da Implementação: Status de Inscrições para Eventos

## 📋 Visão Geral

Foi implementado um sistema completo de controle de status de inscrições que permite aos organizadores gerenciar quando as inscrições estão abertas, mesmo quando o evento está publicado. O sistema suporta controle manual e automático baseado em datas.

## ✅ Status Implementados

1. **Inscrições em Breve (`not_open`)**
   - Evento visível para todos
   - Inscrições ainda não estão abertas
   - Botão de inscrição mostra "Inscrições em Breve"

2. **Inscrições Abertas (`open`)**
   - Evento visível para todos
   - Inscrições abertas e aceitando novos participantes
   - Botão de inscrição habilitado

3. **Inscrições Encerradas (`closed`)**
   - Evento visível para todos
   - Inscrições não estão mais aceitando novos participantes
   - Botão de inscrição desabilitado ou mostra "Inscrições encerradas"

## 🗄️ Mudanças no Banco de Dados

### Migration 063: Adição de Campos
- `registration_status` (TEXT): Status manual das inscrições
- `registration_start_date` (TIMESTAMP WITH TIME ZONE): Data/hora de abertura
- `registration_end_date` (TIMESTAMP WITH TIME ZONE): Data/hora de encerramento
- `registration_auto_mode` (BOOLEAN): Flag para modo automático

### Migration 064: Migração de Dados Existentes
- Eventos publicados → `registration_status = 'open'`
- Eventos finalizados/cancelados → `registration_status = 'closed'`
- Eventos em rascunho → `registration_status = NULL` (mantém lógica antiga)
- Todos os eventos existentes → `registration_auto_mode = false` (modo manual)

## 🔧 Backend

### Serviços Criados
- **`registrationStatusService.ts`**: 
  - `updateRegistrationStatuses()`: Atualiza todos os eventos automaticamente
  - `updateEventRegistrationStatus(eventId)`: Atualiza um evento específico

### Controllers Criados
- **`registrationStatusController.ts`**:
  - `POST /api/admin/update-registration-statuses`: Atualização manual de todos
  - `POST /api/admin/events/:eventId/update-registration-status`: Atualização manual de um evento

### Job Agendado
- Configurado no `server.ts` para executar a cada 5 minutos
- Intervalo configurável via `REGISTRATION_STATUS_UPDATE_INTERVAL_MS`
- Executa atualização imediatamente ao iniciar o servidor

### Validações
- Quando `registration_auto_mode = true`, datas são obrigatórias
- `registration_end_date` deve ser >= `registration_start_date`
- Validação no backend e frontend

## 🎨 Frontend

### Componentes Atualizados

1. **EventFormDialog.tsx** (Organizador)
   - Seção "Controle de Inscrições" na aba "Publicação"
   - Checkbox "Modo Automático"
   - Campos de data/hora quando modo automático ativado
   - Select de status manual quando modo automático desativado

2. **EventViewEditDialog.tsx** (Admin)
   - Mesma seção na aba "Detalhes"
   - Visualização e edição dos campos

3. **EventDetails.tsx** (Página Pública)
   - Badge de status de inscrições
   - Datas contextuais quando modo automático ativado
   - Botão de inscrição desabilitado quando necessário
   - Tooltips explicativos

4. **RegistrationFlow.tsx** (Fluxo de Inscrição)
   - Verificação do status efetivo antes de permitir inscrição
   - Mensagens contextuais
   - Bloqueio de inscrição quando status não permite

5. **Events.tsx** (Listagem Pública)
   - Badge de status em cada card de evento

6. **EventManagement.tsx** (Admin)
   - Coluna "Status Inscrições" na tabela

7. **OrganizerEvents.tsx** (Organizador)
   - Coluna "Status Inscrições" na tabela

### Funções Utilitárias
- **`eventRegistration.ts`**:
  - `getEffectiveRegistrationStatus()`: Calcula status efetivo
  - `getRegistrationStatusMessage()`: Obtém mensagem para exibição
  - `getRegistrationStatusLabel()`: Obtém label do status
  - `getRegistrationStatusVariant()`: Obtém variante de cor para badge
  - `isRegistrationOpen()`, `isRegistrationNotOpen()`, `isRegistrationClosed()`

## 🔄 Fluxo de Funcionamento

### Modo Automático (`registration_auto_mode = true`)
1. Organizador define `registration_start_date` e `registration_end_date`
2. Sistema calcula status automaticamente:
   - Antes de `start_date` → `not_open`
   - Entre `start_date` e `end_date` → `open`
   - Após `end_date` → `closed`
3. Job agendado atualiza status a cada 5 minutos
4. Status também é calculado em tempo real no frontend

### Modo Manual (`registration_auto_mode = false`)
1. Organizador define `registration_status` manualmente
2. Status permanece fixo até ser alterado manualmente
3. Sistema usa o valor definido diretamente

### Retrocompatibilidade (`registration_status = NULL`)
1. Eventos sem status configurado usam lógica antiga
2. Baseado apenas no `status` do evento:
   - `published` ou `ongoing` → permite inscrições
   - Outros status → bloqueia inscrições

## 📝 Testes Recomendados

### Testes Manuais
1. **Criar evento com modo automático:**
   - Definir datas futuras → verificar status "em breve"
   - Aguardar data de abertura → verificar status "aberto"
   - Aguardar data de encerramento → verificar status "encerrado"

2. **Criar evento com modo manual:**
   - Definir status manualmente → verificar comportamento
   - Alterar status → verificar atualização

3. **Testar inscrições:**
   - Tentar inscrever quando status = "em breve" → deve bloquear
   - Tentar inscrever quando status = "aberto" → deve permitir
   - Tentar inscrever quando status = "encerrado" → deve bloquear

4. **Testar retrocompatibilidade:**
   - Eventos existentes sem status → devem funcionar normalmente
   - Eventos com status NULL → devem usar lógica antiga

### Testes de Integração
1. Verificar atualização automática do job agendado
2. Verificar endpoints administrativos de atualização manual
3. Verificar validações no backend e frontend
4. Verificar mensagens de erro apropriadas

## 🚀 Como Usar

### Para Organizadores

1. **Criar evento com controle de inscrições:**
   - Na aba "Publicação", configure a seção "Controle de Inscrições"
   - Escolha entre modo automático (baseado em datas) ou manual
   - Se modo automático: defina data/hora de abertura e encerramento
   - Se modo manual: selecione o status desejado

2. **Editar status de inscrições:**
   - Acesse o evento e edite os campos de controle de inscrições
   - Alterações são salvas imediatamente

### Para Administradores

1. **Atualização manual:**
   - Use o endpoint `POST /api/admin/update-registration-statuses` para atualizar todos os eventos
   - Use o endpoint `POST /api/admin/events/:eventId/update-registration-status` para atualizar um evento específico

2. **Monitoramento:**
   - Verifique logs do servidor para acompanhar atualizações automáticas
   - A coluna "Status Inscrições" na tabela de eventos mostra o status atual

## 📚 Documentação Adicional

- **Decisão de Arquitetura:** `docs/DECISAO_ARQUITETURA_STATUS_INSCRICOES.md`
- **Plano Completo:** `docs/PLANO_STATUS_INSCRICOES.md`
- **Localização dos Componentes:** `docs/LOCALIZACAO_CAMPOS_INSCRICOES.md`
- **API Documentation:** `backend/API_DOCUMENTATION.md`

## 🔧 Configuração

### Variáveis de Ambiente
- `REGISTRATION_STATUS_UPDATE_INTERVAL_MS`: Intervalo de atualização automática em milissegundos (padrão: 300000 = 5 minutos)

### Executar Migrações
```bash
cd backend
npm run migrate
```

## ✨ Funcionalidades Principais

- ✅ Controle manual e automático de status de inscrições
- ✅ Atualização automática via job agendado
- ✅ Validações completas no backend e frontend
- ✅ Retrocompatibilidade com eventos existentes
- ✅ Interface intuitiva para organizadores
- ✅ Visualização clara para corredores
- ✅ Endpoints administrativos para controle manual
- ✅ Logs e monitoramento

## 🎯 Próximos Passos (Opcional)

- Adicionar notificações quando status muda automaticamente
- Adicionar histórico de mudanças de status
- Adicionar relatórios de eventos por status de inscrições
- Adicionar filtros por status de inscrições nas listagens
