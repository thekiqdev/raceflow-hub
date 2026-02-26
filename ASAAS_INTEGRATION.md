# Integração Asaas - Documentação Técnica

## Visão Geral

Esta documentação descreve a integração do gateway de pagamento Asaas no sistema de inscrições de eventos. A integração permite que os usuários paguem suas inscrições através de múltiplos métodos de pagamento (PIX, Boleto, Cartão de Crédito) e confirma automaticamente as inscrições quando o pagamento é confirmado.

## Referências

- [Documentação Oficial Asaas](https://docs.asaas.com/)
- [API Reference v3](https://docs.asaas.com/reference)

## Arquitetura da Integração

### Fluxo de Pagamento

```
1. Usuário finaliza inscrição
   ↓
2. Sistema cria registro com status 'pending' e payment_status 'pending'
   ↓
3. Sistema cria cliente no Asaas (se não existir)
   ↓
4. Sistema cria cobrança no Asaas
   ↓
5. Sistema retorna o qrcode de pix ao usuário
   ↓
6. Usuário faz o pagamento na plataforma
   ↓
7. Asaas processa pagamento
   ↓
8. Asaas envia webhook para nosso sistema
   ↓
9. Sistema atualiza payment_status da inscrição
   ↓
10. Sistema confirma inscrição (status = 'confirmed')
```

## Endpoints da API Asaas

### 1. Criar Cliente

**Endpoint:** `POST https://sandbox.asaas.com/api/v3/customers` (Sandbox)
**Endpoint:** `POST https://www.asaas.com/api/v3/customers` (Produção)

**Headers:**
```
access_token: {ASAAS_API_KEY}
Content-Type: application/json
```

**Body:**
```json
{
  "name": "Nome Completo",
  "email": "email@exemplo.com",
  "cpfCnpj": "12345678900",
  "phone": "11999999999",
  "mobilePhone": "11999999999",
  "postalCode": "01310-100",
  "address": "Rua Exemplo",
  "addressNumber": "123",
  "complement": "Apto 45",
  "province": "Centro",
  "city": "São Paulo",
  "state": "SP"
}
```

**Response:**
```json
{
  "object": "customer",
  "id": "cus_000005814069",
  "dateCreated": "2023-12-01",
  "name": "Nome Completo",
  "email": "email@exemplo.com",
  "phone": "11999999999",
  "mobilePhone": "11999999999",
  "cpfCnpj": "12345678900",
  "postalCode": "01310-100",
  "address": "Rua Exemplo",
  "addressNumber": "123",
  "complement": "Apto 45",
  "province": "Centro",
  "city": "São Paulo",
  "state": "SP",
  "country": "Brasil",
  "externalReference": null,
  "notificationDisabled": false,
  "additionalEmails": null,
  "canDelete": true,
  "cannotBeDeletedReason": null,
  "canEdit": true,
  "cannotEditReason": null,
  "personType": "FISICA",
  "observations": null
}
```

### 2. Criar Cobrança (Payment)

**Endpoint:** `POST https://sandbox.asaas.com/api/v3/payments` (Sandbox)
**Endpoint:** `POST https://www.asaas.com/api/v3/payments` (Produção)

**Headers:**
```
access_token: {ASAAS_API_KEY}
Content-Type: application/json
```

**Body:**
```json
{
  "customer": "cus_000005814069",
  "billingType": "PIX",
  "value": 100.00,
  "dueDate": "2025-12-31",
  "description": "Inscrição - Evento XYZ",
  "externalReference": "REG-123456789",
  "installmentCount": 1,
  "installmentValue": 100.00
}
```

**Tipos de BillingType:**
- `PIX` - Pagamento via PIX
- `BOLETO` - Boleto bancário
- `CREDIT_CARD` - Cartão de crédito
- `DEBIT_CARD` - Cartão de débito

**Response:**
```json
{
  "object": "payment",
  "id": "pay_123456789",
  "dateCreated": "2023-12-01",
  "customer": "cus_000005814069",
  "paymentLink": "https://www.asaas.com/c/123456789",
  "value": 100.00,
  "netValue": 95.00,
  "originalValue": null,
  "interestValue": null,
  "description": "Inscrição - Evento XYZ",
  "billingType": "PIX",
  "status": "PENDING",
  "dueDate": "2025-12-31",
  "originalDueDate": "2025-12-31",
  "paymentDate": null,
  "clientPaymentDate": null,
  "installmentNumber": null,
  "invoiceUrl": "https://www.asaas.com/i/123456789",
  "bankSlipUrl": null,
  "transactionReceiptUrl": null,
  "invoiceNumber": null,
  "externalReference": "REG-123456789",
  "deleted": false,
  "anticipated": false,
  "refunds": null,
  "pixTransactionId": null,
  "pixQrCodeId": null,
  "pixQrCode": null
}
```

**Nota Importante para PIX:**
Para pagamentos PIX, após criar a cobrança, o QR Code pode não estar disponível imediatamente na resposta. É necessário consultar o pagamento novamente ou aguardar alguns segundos. O QR Code PIX estará disponível nos campos:
- `pixQrCodeId` - ID do QR Code no Asaas
- `pixQrCode` - String do QR Code PIX (código copia e cola - formato EMV)
- `pixTransactionId` - ID da transação PIX (preenchido quando o pagamento for confirmado)

**Recomendação:** Após criar a cobrança PIX, fazer uma consulta ao pagamento após 1-2 segundos para obter o QR Code, ou implementar um retry com polling.

### 3. Consultar Status de Pagamento

**Endpoint:** `GET https://sandbox.asaas.com/api/v3/payments/{paymentId}` (Sandbox)

**Headers:**
```
access_token: {ASAAS_API_KEY}
```

**Response:** Mesma estrutura do criar cobrança, com status atualizado e campos PIX preenchidos (se aplicável).

**Uso para PIX:**
Após criar uma cobrança PIX, use este endpoint para obter o QR Code. Faça a consulta após 1-2 segundos da criação, pois o QR Code pode não estar disponível imediatamente. A resposta incluirá os campos `pixQrCodeId`, `pixQrCode` e `pixTransactionId` (quando pago).

**Status possíveis:**
- `PENDING` - Aguardando pagamento
- `CONFIRMED` - Pagamento confirmado
- `RECEIVED` - Pagamento recebido
- `OVERDUE` - Vencido
- `REFUNDED` - Estornado
- `RECEIVED_IN_CASH_UNDONE` - Recebido em dinheiro desfeito
- `CHARGEBACK_REQUESTED` - Chargeback solicitado
- `CHARGEBACK_DISPUTE` - Chargeback em disputa
- `AWAITING_CHARGEBACK_REVERSAL` - Aguardando reversão de chargeback
- `DUNNING_REQUESTED` - Negativação solicitada
- `DUNNING_RECEIVED` - Negativação recebida
- `AWAITING_RISK_ANALYSIS` - Aguardando análise de risco

### 4. Webhook (Notificações)

O Asaas envia notificações via webhook quando há mudanças no status do pagamento.

**Endpoint no nosso sistema:** `POST /api/webhooks/asaas`

**Headers enviados pelo Asaas:**
```
asaas-access-token: {ASAAS_WEBHOOK_TOKEN}
Content-Type: application/json
```

**Body do Webhook:**
```json
{
  "event": "PAYMENT_CONFIRMED",
  "payment": {
    "object": "payment",
    "id": "pay_123456789",
    "dateCreated": "2023-12-01",
    "customer": "cus_000005814069",
    "value": 100.00,
    "netValue": 95.00,
    "description": "Inscrição - Evento XYZ",
    "billingType": "PIX",
    "status": "CONFIRMED",
    "dueDate": "2025-12-31",
    "paymentDate": "2023-12-01",
    "clientPaymentDate": "2023-12-01",
    "externalReference": "REG-123456789",
    "deleted": false
  }
}
```

**Eventos possíveis:**
- `PAYMENT_CREATED` - Pagamento criado
- `PAYMENT_UPDATED` - Pagamento atualizado
- `PAYMENT_CONFIRMED` - Pagamento confirmado
- `PAYMENT_RECEIVED` - Pagamento recebido
- `PAYMENT_OVERDUE` - Pagamento vencido
- `PAYMENT_DELETED` - Pagamento deletado
- `PAYMENT_RESTORED` - Pagamento restaurado
- `PAYMENT_REFUNDED` - Pagamento estornado
- `PAYMENT_CHARGEBACK_REQUESTED` - Chargeback solicitado
- `PAYMENT_CHARGEBACK_DISPUTE` - Chargeback em disputa
- `PAYMENT_AWAITING_CHARGEBACK_REVERSAL` - Aguardando reversão de chargeback

## Estrutura de Dados

### Tabela: `asaas_customers`

Armazena os clientes criados no Asaas para evitar criar duplicados.

```sql
CREATE TABLE asaas_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  asaas_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_asaas_customers_user_id ON asaas_customers(user_id);
CREATE INDEX idx_asaas_customers_asaas_id ON asaas_customers(asaas_customer_id);
```

### Tabela: `asaas_payments`

Armazena as cobranças criadas no Asaas vinculadas às inscrições.

```sql
CREATE TABLE asaas_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE NOT NULL,
  asaas_payment_id TEXT NOT NULL UNIQUE,
  asaas_customer_id TEXT NOT NULL,
  value DECIMAL(10,2) NOT NULL,
  net_value DECIMAL(10,2),
  billing_type TEXT NOT NULL,
  status TEXT NOT NULL,
  due_date DATE NOT NULL,
  payment_date DATE,
  payment_link TEXT,
  invoice_url TEXT,
  bank_slip_url TEXT,
  external_reference TEXT,
  pix_qr_code_id TEXT,
  pix_qr_code TEXT,
  pix_transaction_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_asaas_payments_registration_id ON asaas_payments(registration_id);
CREATE INDEX idx_asaas_payments_asaas_id ON asaas_payments(asaas_payment_id);
CREATE INDEX idx_asaas_payments_status ON asaas_payments(status);
```

**Campos adicionais para PIX:**
- `pix_qr_code_id` - ID do QR Code PIX no Asaas
- `pix_qr_code` - String do QR Code PIX (código copia e cola)
- `pix_transaction_id` - ID da transação PIX quando o pagamento for confirmado

### Tabela: `asaas_webhook_events`

Armazena os eventos recebidos via webhook para auditoria e debug.

```sql
CREATE TABLE asaas_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  asaas_payment_id TEXT,
  registration_id UUID REFERENCES registrations(id),
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_asaas_webhook_events_payment_id ON asaas_webhook_events(asaas_payment_id);
CREATE INDEX idx_asaas_webhook_events_registration_id ON asaas_webhook_events(registration_id);
CREATE INDEX idx_asaas_webhook_events_processed ON asaas_webhook_events(processed);
```

## Variáveis de Ambiente

```env
# Asaas Configuration
ASAAS_API_KEY=your_api_key_here
ASAAS_WEBHOOK_TOKEN=your_webhook_token_here
ASAAS_ENVIRONMENT=sandbox  # ou 'production'
ASAAS_API_URL=https://sandbox.asaas.com/api/v3  # ou https://www.asaas.com/api/v3
```

## Segurança

1. **Autenticação:** Todas as requisições ao Asaas devem incluir o header `access_token` com a API key.
2. **Webhook Token:** Validar o token enviado no header `asaas-access-token` em todas as requisições de webhook.
3. **HTTPS:** Sempre usar HTTPS em produção.
4. **Validação:** Validar todos os dados recebidos via webhook antes de processar.

## Tratamento de Erros

### Erros Comuns

1. **Cliente já existe:** Retornar o ID do cliente existente.
2. **Pagamento duplicado:** Verificar se já existe pagamento para a inscrição.
3. **Webhook duplicado:** Implementar idempotência usando o ID do evento.
4. **Timeout:** Implementar retry com backoff exponencial.

## Testes

### Ambiente Sandbox

- URL: `https://sandbox.asaas.com/api/v3`
- Use cartões de teste para pagamentos com cartão
- PIX de teste: Use o QR Code gerado no ambiente sandbox

### Cartões de Teste

- **Aprovado:** `4000 0000 0000 0010`
- **Recusado:** `4000 0000 0000 0002`
- **CVV:** Qualquer 3 dígitos
- **Validade:** Qualquer data futura

