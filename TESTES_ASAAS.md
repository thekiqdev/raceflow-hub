# Guia de Testes - Integração Asaas

Este documento descreve como testar a integração com o Asaas no ambiente sandbox.

## Pré-requisitos

1. **Conta Asaas Sandbox criada**
2. **API Key configurada** no arquivo `.env` do backend:
   ```env
   ASAAS_API_KEY=your_sandbox_api_key
   ASAAS_ENVIRONMENT=sandbox
   ASAAS_API_URL=https://sandbox.asaas.com/api/v3
   ASAAS_WEBHOOK_TOKEN=  # Pode ficar vazio para desenvolvimento
   ```

3. **Backend rodando** em `http://localhost:3001`
4. **Frontend rodando** em `http://localhost:8080`

## Testes Manuais

### 1. Teste de Criação de Cliente

**Objetivo:** Verificar se o sistema cria corretamente um cliente no Asaas.

**Passos:**
1. Fazer login no sistema
2. Criar uma nova inscrição em um evento
3. Verificar no console do backend se o cliente foi criado no Asaas
4. Verificar no banco de dados se o `asaas_customer_id` foi salvo na tabela `asaas_customers`

**Resultado Esperado:**
- Cliente criado no Asaas com sucesso
- `asaas_customer_id` salvo no banco de dados
- Logs no console mostrando sucesso

**Verificação no Banco:**
```sql
SELECT * FROM asaas_customers WHERE user_id = '<user_id>';
```

### 2. Teste de Criação de Pagamento PIX

**Objetivo:** Verificar se o sistema cria corretamente um pagamento PIX no Asaas e retorna o QR Code.

**Passos:**
1. Fazer login no sistema
2. Criar uma nova inscrição em um evento (com valor > 0)
3. Verificar no console do backend se o pagamento foi criado
4. Verificar se o QR Code PIX foi retornado na resposta
5. Verificar no frontend se o QR Code é exibido corretamente

**Resultado Esperado:**
- Pagamento criado no Asaas com status `PENDING`
- QR Code PIX retornado na resposta
- QR Code exibido no frontend
- Dados salvos na tabela `asaas_payments`

**Verificação no Banco:**
```sql
SELECT * FROM asaas_payments WHERE registration_id = '<registration_id>';
```

**Verificação no Console:**
- Logs mostrando: `✅ Pagamento criado no Asaas`
- QR Code presente na resposta

### 3. Teste de Exibição de QR Code no Frontend

**Objetivo:** Verificar se o QR Code PIX é exibido corretamente no frontend.

**Passos:**
1. Criar uma inscrição
2. Verificar se o componente `PixQrCode` é renderizado
3. Verificar se o QR Code é gerado corretamente
4. Testar o botão "Copiar código PIX"
5. Verificar se o código é copiado para o clipboard

**Resultado Esperado:**
- QR Code exibido em tamanho adequado (256x256px)
- Valor e data de vencimento exibidos corretamente
- Botão de copiar funciona
- Toast de sucesso ao copiar

### 4. Teste de Polling de Status

**Objetivo:** Verificar se o sistema faz polling corretamente para verificar o status do pagamento.

**Passos:**
1. Criar uma inscrição com pagamento PIX
2. Abrir o console do navegador
3. Verificar se as requisições de polling são feitas a cada 5 segundos
4. Verificar se o status é atualizado quando o pagamento é confirmado

**Resultado Esperado:**
- Requisições `GET /api/registrations/:id/payment-status` a cada 5 segundos
- Status atualizado quando pagamento confirmado
- Mensagem de sucesso exibida no frontend

**Verificação no Console do Navegador:**
- Network tab mostrando requisições periódicas
- Status mudando de `pending` para `paid`

### 5. Teste de Webhook (Simulação)

**Objetivo:** Verificar se o webhook processa corretamente os eventos do Asaas.

**Como testar sem webhook real:**
1. Criar uma inscrição e obter o `asaas_payment_id`
2. Simular um webhook manualmente usando curl ou Postman:

```bash
curl -X POST http://localhost:3001/api/webhooks/asaas \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: <webhook_token>" \
  -d '{
    "event": "PAYMENT_CONFIRMED",
    "payment": {
      "id": "<asaas_payment_id>",
      "status": "CONFIRMED",
      "paymentDate": "2024-01-01T10:00:00Z"
    }
  }'
```

**Resultado Esperado:**
- Webhook recebido com sucesso (status 200)
- Evento salvo na tabela `asaas_webhook_events`
- Status da inscrição atualizado para `confirmed`
- `payment_status` atualizado para `paid`

**Verificação no Banco:**
```sql
-- Verificar webhook recebido
SELECT * FROM asaas_webhook_events ORDER BY created_at DESC LIMIT 1;

-- Verificar status da inscrição
SELECT id, status, payment_status FROM registrations WHERE id = '<registration_id>';
```

### 6. Teste de Fluxo Completo End-to-End

**Objetivo:** Testar o fluxo completo desde a criação da inscrição até a confirmação do pagamento.

**Passos:**
1. **Criar Inscrição:**
   - Fazer login
   - Selecionar evento
   - Selecionar categoria
   - Selecionar kit (opcional)
   - Finalizar inscrição

2. **Verificar Pagamento:**
   - QR Code PIX exibido
   - Dados do pagamento corretos
   - Polling iniciado

3. **Simular Pagamento:**
   - Usar o QR Code no app do banco (sandbox)
   - OU simular webhook de confirmação

4. **Verificar Confirmação:**
   - Status atualizado para `confirmed`
   - Mensagem de sucesso exibida
   - Inscrição confirmada no banco

**Resultado Esperado:**
- Fluxo completo funcionando sem erros
- Todos os estados atualizados corretamente
- Usuário recebe feedback adequado em cada etapa

## Testes de Erro

### 1. Teste de Erro na Criação de Cliente

**Cenário:** API Key inválida ou erro na API do Asaas.

**Resultado Esperado:**
- Erro capturado e logado
- Inscrição ainda é criada (sem pagamento)
- Mensagem de aviso exibida ao usuário

### 2. Teste de Erro na Criação de Pagamento

**Cenário:** Erro ao criar pagamento no Asaas.

**Resultado Esperado:**
- Erro capturado e logado
- Inscrição criada com status `pending`
- Mensagem de aviso exibida
- Dados de pagamento com `error` ou `warning`

### 3. Teste de Webhook Inválido

**Cenário:** Webhook recebido sem token ou com token inválido.

**Resultado Esperado:**
- Requisição rejeitada com status 401
- Erro logado no console
- Evento não processado

## Checklist de Validação

### Backend
- [ ] API Key configurada corretamente
- [ ] Cliente criado no Asaas ao criar inscrição
- [ ] Pagamento criado no Asaas ao criar inscrição
- [ ] QR Code PIX retornado na resposta
- [ ] Dados salvos corretamente no banco de dados
- [ ] Webhook recebendo e processando eventos
- [ ] Status atualizado corretamente após webhook
- [ ] Endpoint de status de pagamento funcionando
- [ ] Logs adequados para debug

### Frontend
- [ ] QR Code PIX exibido corretamente
- [ ] Botão de copiar código funcionando
- [ ] Polling de status funcionando
- [ ] Mensagens de sucesso/erro exibidas
- [ ] Estado atualizado quando pagamento confirmado
- [ ] Loading states adequados

### Banco de Dados
- [ ] Tabela `asaas_customers` populada
- [ ] Tabela `asaas_payments` populada
- [ ] Tabela `asaas_webhook_events` populada
- [ ] Campo `asaas_payment_id` na tabela `registrations` preenchido
- [ ] Status e `payment_status` atualizados corretamente

## Comandos Úteis para Debug

### Verificar Clientes Criados
```sql
SELECT 
  ac.*,
  u.email,
  p.full_name
FROM asaas_customers ac
JOIN users u ON ac.user_id = u.id
JOIN profiles p ON ac.user_id = p.id
ORDER BY ac.created_at DESC;
```

### Verificar Pagamentos Criados
```sql
SELECT 
  ap.*,
  r.status as registration_status,
  r.payment_status
FROM asaas_payments ap
JOIN registrations r ON ap.registration_id = r.id
ORDER BY ap.created_at DESC;
```

### Verificar Webhooks Recebidos
```sql
SELECT 
  event_type,
  asaas_payment_id,
  processed,
  error_message,
  created_at
FROM asaas_webhook_events
ORDER BY created_at DESC
LIMIT 10;
```

### Verificar Inscrições com Pagamento
```sql
SELECT 
  r.id,
  r.status,
  r.payment_status,
  r.asaas_payment_id,
  ap.status as asaas_status,
  ap.pix_qr_code IS NOT NULL as has_qr_code
FROM registrations r
LEFT JOIN asaas_payments ap ON r.asaas_payment_id = ap.asaas_payment_id
WHERE r.asaas_payment_id IS NOT NULL
ORDER BY r.created_at DESC;
```

## Próximos Passos

Após validar todos os testes:

1. Configurar webhook real no painel do Asaas
2. Testar em ambiente de produção (com API key de produção)
3. Implementar notificações por email quando pagamento confirmado
4. Adicionar métricas e monitoramento
5. Documentar processo de troubleshooting


