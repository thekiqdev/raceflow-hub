# Plano de Implementação - Integração Asaas

## Objetivo

Implementar integração completa com o gateway de pagamento Asaas para processar pagamentos de inscrições em eventos, incluindo criação de clientes, geração de cobranças e processamento de webhooks.

---

## OK Etapa 1: Configuração Inicial e Ambiente

### 1.1 Criar conta no Asaas
- [ ] Criar conta no [Asaas Sandbox](https://sandbox.asaas.com) para testes
- [ ] Criar conta no [Asaas Produção](https://www.asaas.com) para ambiente real
- [ ] Obter API Key de cada ambiente
- [ ] Configurar webhook no painel do Asaas (URL será definida na Etapa 4)

### 1.2 Configurar Variáveis de Ambiente
- [ ] Adicionar variáveis no `.env` do backend:
  ```env
  ASAAS_API_KEY=your_sandbox_api_key
  ASAAS_WEBHOOK_TOKEN=your_webhook_token
  ASAAS_ENVIRONMENT=sandbox
  ASAAS_API_URL=https://sandbox.asaas.com/api/v3
  ```
- [ ] Criar arquivo `.env.example` com as variáveis documentadas

### 1.3 Instalar Dependências
- [ ] Instalar biblioteca HTTP client (axios já está instalado)
- [ ] Verificar se todas as dependências necessárias estão presentes

**Arquivos a modificar:**
- `backend/.env`
- `backend/.env.example`

---

## OK Etapa 2: Criar Migrations do Banco de Dados

### 2.1 Migration: Tabela `asaas_customers`
- [ ] Criar migration `020_create_asaas_customers.sql`
- [ ] Criar tabela `asaas_customers` com campos:
  - `id` (UUID, PK)
  - `user_id` (UUID, FK para profiles)
  - `asaas_customer_id` (TEXT, UNIQUE)
  - `created_at`, `updated_at`
- [ ] Criar índices necessários

### 2.2 Migration: Tabela `asaas_payments`
- [ ] Criar migration `021_create_asaas_payments.sql`
- [ ] Criar tabela `asaas_payments` com campos:
  - `id` (UUID, PK)
  - `registration_id` (UUID, FK para registrations)
  - `asaas_payment_id` (TEXT, UNIQUE)
  - `asaas_customer_id` (TEXT)
  - `value`, `net_value` (DECIMAL)
  - `billing_type`, `status` (TEXT)
  - `due_date`, `payment_date` (DATE)
  - `payment_link`, `invoice_url`, `bank_slip_url` (TEXT)
  - `external_reference` (TEXT)
  - `pix_qr_code_id`, `pix_qr_code`, `pix_transaction_id` (TEXT) - Para pagamentos PIX
  - `created_at`, `updated_at`
- [ ] Criar índices necessários

### 2.3 Migration: Tabela `asaas_webhook_events`
- [ ] Criar migration `022_create_asaas_webhook_events.sql`
- [ ] Criar tabela `asaas_webhook_events` com campos:
  - `id` (UUID, PK)
  - `event_type` (TEXT)
  - `asaas_payment_id` (TEXT)
  - `registration_id` (UUID, FK para registrations)
  - `payload` (JSONB)
  - `processed` (BOOLEAN)
  - `error_message` (TEXT)
  - `created_at`
- [ ] Criar índices necessários

### 2.4 Migration: Atualizar tabela `registrations`
- [ ] Verificar se campo `asaas_payment_id` é necessário (já temos `payment_status`)
- [ ] Adicionar campo `asaas_payment_id` se necessário para referência rápida

**Arquivos a criar:**
- `backend/migrations/020_create_asaas_customers.sql`
- `backend/migrations/021_create_asaas_payments.sql`
- `backend/migrations/022_create_asaas_webhook_events.sql`
- `backend/migrations/023_add_asaas_payment_id_to_registrations.sql` (se necessário)

---

## OK Etapa 3: Criar Serviço de Integração com Asaas

### 3.1 Criar Service: `asaasService.ts`
- [ ] Criar arquivo `backend/src/services/asaasService.ts`
- [ ] Implementar função `createCustomer()`:
  - Receber dados do usuário (nome, email, CPF, telefone, endereço)
  - Verificar se cliente já existe no banco local
  - Se não existir, criar no Asaas
  - Salvar no banco local
  - Retornar `asaas_customer_id`
- [ ] Implementar função `createPayment()`:
  - Receber `customer_id`, `value`, `dueDate`, `description`, `billingType`
  - Criar cobrança no Asaas
  - Se `billingType` for `PIX`:
    - Aguardar 1-2 segundos após criar cobrança
    - Consultar pagamento novamente para obter QR Code
    - Implementar retry (até 3 tentativas) se QR Code não estiver disponível
  - Salvar no banco local vinculado à inscrição (incluindo QR Code PIX se disponível)
  - Retornar dados do pagamento (incluindo `pix_qr_code` para PIX)
  - Se QR Code não estiver disponível imediatamente, retornar `pix_qr_code: null` e implementar polling no frontend
- [ ] Implementar função `getPaymentStatus()`:
  - Consultar status do pagamento no Asaas
  - Atualizar no banco local
  - Retornar status atualizado
- [ ] Implementar função `getCustomerByUserId()`:
  - Buscar cliente Asaas pelo `user_id` no banco local

### 3.2 Configurar Cliente HTTP
- [ ] Criar instância do axios configurada com:
  - Base URL do Asaas (sandbox ou produção)
  - Header `access_token` com API key
  - Timeout adequado
  - Interceptors para logging e tratamento de erros

### 3.3 Tratamento de Erros
- [ ] Implementar tratamento para erros comuns:
  - Cliente já existe (retornar ID existente)
  - API key inválida
  - Timeout
  - Rate limiting
- [ ] Criar tipos TypeScript para respostas do Asaas

**Arquivos a criar:**
- `backend/src/services/asaasService.ts`
- `backend/src/types/asaas.ts` (tipos TypeScript)

---

## OK Etapa 4: Criar Controller e Rotas de Webhook

### 4.1 Criar Controller: `asaasWebhookController.ts`
- [ ] Criar arquivo `backend/src/controllers/asaasWebhookController.ts`
- [ ] Implementar função `handleWebhook()`:
  - Validar token do webhook (header `asaas-access-token`)
  - Salvar evento na tabela `asaas_webhook_events`
  - Processar evento baseado no tipo:
    - `PAYMENT_CONFIRMED` → Atualizar `payment_status` para `paid` e `status` para `confirmed`
    - `PAYMENT_RECEIVED` → Atualizar `payment_status` para `paid`
    - `PAYMENT_OVERDUE` → Atualizar `payment_status` para `overdue`
    - `PAYMENT_REFUNDED` → Atualizar `payment_status` para `refunded` e `status` para `cancelled`
  - Atualizar tabela `asaas_payments` com novo status
  - Marcar evento como processado
  - Retornar 200 OK para o Asaas

### 4.2 Criar Rota de Webhook
- [ ] Criar arquivo `backend/src/routes/webhooks.ts`
- [ ] Definir rota `POST /api/webhooks/asaas`
- [ ] Aplicar middleware de validação de token (não usar autenticação JWT normal)
- [ ] Conectar ao controller

### 4.3 Registrar Rota no Server
- [ ] Importar rota de webhook em `backend/src/server.ts`
- [ ] Registrar antes das rotas autenticadas (webhooks não usam JWT)

**Arquivos a criar:**
- `backend/src/controllers/asaasWebhookController.ts`
- `backend/src/routes/webhooks.ts`

**Arquivos a modificar:**
- `backend/src/server.ts`

---

## OK Etapa 5: Integrar Criação de Pagamento no Fluxo de Inscrição

### 5.1 Modificar Controller de Registrations
- [ ] Modificar `createRegistrationController` em `backend/src/controllers/registrationsController.ts`:
  - Após criar registro, criar cliente no Asaas (se necessário)
  - Criar cobrança no Asaas
  - Salvar dados do pagamento no banco
  - Retornar `payment_link` junto com dados da inscrição

### 5.2 Modificar Service de Registrations
- [ ] Modificar `createRegistration` em `backend/src/services/registrationsService.ts`:
  - Manter lógica atual de criação
  - Adicionar chamada para criar pagamento no Asaas
  - Tratar erros de criação de pagamento (inscrição pode ser criada mesmo se pagamento falhar)

### 5.3 Atualizar Tipos e Interfaces
- [ ] Adicionar `payment_link` e `asaas_payment_id` na resposta de criação de inscrição
- [ ] Atualizar interface `CreateRegistrationResponse`

**Arquivos a modificar:**
- `backend/src/controllers/registrationsController.ts`
- `backend/src/services/registrationsService.ts`
- `backend/src/types/index.ts`

---

## OK Etapa 6: Atualizar Frontend - Fluxo de Pagamento

### 6.1 Modificar RegistrationFlow
- [ ] Modificar `src/components/event/RegistrationFlow.tsx`:
  - Após criar inscrição, verificar se há `pix_qr_code` na resposta
  - Se não houver QR Code imediatamente, implementar polling para buscar o QR Code (consultar pagamento após 1-2 segundos)
  - Quando QR Code estiver disponível, exibir componente `PixQrCode` na tela
  - Adicionar botão "Copiar código PIX" para copiar o código copia e cola
  - Adicionar estado de loading durante criação do pagamento e busca do QR Code
  - Mostrar mensagem informando que inscrição está pendente de pagamento
  - Implementar polling para verificar status do pagamento automaticamente (a cada 5-10 segundos)
  - Quando pagamento for confirmado, mostrar mensagem de sucesso e atualizar status da inscrição

### 6.2 Criar Componente de QR Code PIX
- [ ] Instalar biblioteca para gerar QR Code:
  - `npm install qrcode.react` ou `npm install react-qr-code`
- [ ] Criar componente `PixQrCode.tsx`:
  - Receber props: `pixQrCode` (string), `value` (valor), `dueDate` (data vencimento)
  - Gerar imagem do QR Code usando a biblioteca instalada
  - Exibir QR Code em tamanho adequado (recomendado: 256x256px ou 300x300px)
  - Adicionar botão "Copiar código PIX" que copia a string do QR Code para clipboard
  - Mostrar valor formatado (R$ X,XX) e data de vencimento formatada
  - Adicionar instruções de pagamento:
    - "Escaneie o QR Code com o app do seu banco"
    - "Ou copie o código e cole no app do banco"
  - Adicionar loading state enquanto QR Code está sendo gerado
  - Tratar erros na geração do QR Code

### 6.3 Criar Componente de Status de Pagamento
- [ ] Criar componente `PaymentStatus.tsx`:
  - Mostrar status atual do pagamento
  - Exibir QR Code PIX quando disponível
  - Atualizar status periodicamente (polling)
  - Mostrar confirmação quando pagamento for confirmado
  - Exibir mensagem de sucesso após confirmação

### 6.3 Atualizar API Client
- [ ] Adicionar função `getPaymentStatus(registrationId)` em `src/lib/api/registrations.ts`
- [ ] Adicionar polling para verificar status do pagamento

**Arquivos a modificar:**
- `src/components/event/RegistrationFlow.tsx`
- `src/lib/api/registrations.ts`

**Arquivos a criar:**
- `src/components/payment/PaymentStatus.tsx`

---

## OK Etapa 7: Testes e Validação

### 7.1 Criar Documentação de Testes
- [x] Criar guia de testes (`TESTES_ASAAS.md`)
- [x] Criar checklist de validação (`CHECKLIST_TESTES_ASAAS.md`)
- [x] Criar script de teste automatizado (`backend/scripts/test-asaas-integration.ts`)

### 7.2 Endpoint de Consulta (Já implementado na Etapa 6)
- [x] Rota `GET /api/registrations/:id/payment-status` criada
- [x] Controller implementado em `registrationsController.ts`
- [x] Validação de permissões implementada

### 7.3 Scripts e Ferramentas de Teste
- [x] Script de teste automatizado criado
- [x] Comando npm `test:asaas` adicionado
- [x] Documentação de comandos SQL para validação

**Arquivos criados:**
- `TESTES_ASAAS.md` - Guia completo de testes
- `CHECKLIST_TESTES_ASAAS.md` - Checklist para validação
- `backend/scripts/test-asaas-integration.ts` - Script de teste automatizado

**Arquivos modificados:**
- `backend/package.json` - Adicionado script `test:asaas`

---

## OK Etapa 8: Testes e Validação

### 8.1 Testes no Sandbox
- [ ] Testar criação de cliente
- [ ] Testar criação de cobrança (PIX, Boleto, Cartão)
- [ ] Testar webhook com diferentes eventos
- [ ] Testar consulta de status
- [ ] Testar tratamento de erros

### 8.2 Testes de Integração
- [ ] Testar fluxo completo:
  1. Usuário cria inscrição
  2. Sistema cria pagamento no Asaas
  3. Usuário acessa link de pagamento
  4. Simular pagamento no sandbox
  5. Verificar webhook recebido
  6. Verificar atualização de status
  7. Verificar confirmação da inscrição

### 8.3 Testes de Segurança
- [ ] Validar token do webhook
- [ ] Testar webhook com token inválido
- [ ] Testar idempotência (webhook duplicado)
- [ ] Testar rate limiting

**Arquivos a criar:**
- `backend/tests/asaas.test.ts` (opcional)

---

## OK Etapa 9: Documentação e Deploy

### 9.1 Documentação
- [ ] Documentar variáveis de ambiente necessárias
- [ ] Criar guia de configuração do webhook no painel Asaas
- [ ] Documentar fluxo de pagamento para usuários finais
- [ ] Criar troubleshooting guide

### 9.2 Configuração de Produção
- [ ] Atualizar variáveis de ambiente para produção
- [ ] Configurar webhook no painel Asaas (produção)
- [ ] Testar webhook em produção
- [ ] Configurar monitoramento e alertas

### 9.3 Deploy
- [ ] Fazer deploy das migrations
- [ ] Fazer deploy do código
- [ ] Verificar logs após deploy
- [ ] Testar em produção com valor baixo

**Arquivos a criar/modificar:**
- `README.md` (adicionar seção sobre Asaas)
- `DEPLOY_ASAAS.md` (guia de deploy)

---

## OK Etapa 10: Melhorias e Otimizações (Pós-Deploy)

### 10.1 Melhorias de UX
- [ ] Adicionar notificações quando pagamento for confirmado
- [ ] Enviar email de confirmação após pagamento
- [ ] Adicionar página de status de pagamento dedicada
- [ ] Implementar retry automático para webhooks falhados

### 10.2 Monitoramento
- [ ] Adicionar métricas de pagamentos:
  - Taxa de conversão (inscrições pagas / criadas)
  - Tempo médio de pagamento
  - Taxa de pagamentos vencidos
- [ ] Criar dashboard de pagamentos
- [ ] Configurar alertas para webhooks falhados

### 10.3 Otimizações
- [ ] Implementar cache para consultas de status
- [ ] Otimizar queries do banco de dados
- [ ] Implementar fila para processamento de webhooks (se necessário)

---

## Checklist Final

- [ ] Todas as migrations executadas
- [ ] Variáveis de ambiente configuradas
- [ ] Webhook configurado no painel Asaas
- [ ] Testes no sandbox concluídos
- [ ] Testes em produção concluídos
- [ ] Documentação completa
- [ ] Monitoramento configurado
- [ ] Equipe treinada

---

## Notas Importantes

1. **Ambiente Sandbox vs Produção:**
   - Sempre testar no sandbox antes de produção
   - Cada ambiente tem sua própria API key
   - Webhooks devem ser configurados separadamente

2. **Segurança:**
   - Nunca expor API keys no frontend
   - Validar sempre o token do webhook
   - Usar HTTPS em produção

3. **Idempotência:**
   - Webhooks podem ser enviados múltiplas vezes
   - Implementar verificação de duplicidade
   - Usar `asaas_payment_id` como chave única

4. **Tratamento de Erros:**
   - Inscrição pode ser criada mesmo se pagamento falhar
   - Implementar retry para operações críticas
   - Logar todos os erros para debug

