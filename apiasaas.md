# Guia Completo da API Asaas

Este documento contém instruções detalhadas sobre como integrar e usar a API do Asaas em um novo sistema, baseado nas melhores práticas aprendidas durante a implementação no projeto Cronoteam.

## 📋 Índice

1. [Visão Geral](#visão-geral)
2. [Configuração Inicial](#configuração-inicial)
3. [Autenticação](#autenticação)
4. [Endpoints da API](#endpoints-da-api)
   - [Clientes (Customers)](#clientes-customers)
   - [Pagamentos (Payments)](#pagamentos-payments)
   - [Webhooks](#webhooks)
5. [Tipos de Pagamento](#tipos-de-pagamento)
6. [Tratamento de Erros](#tratamento-de-erros)
7. [Boas Práticas](#boas-práticas)
8. [Estrutura de Banco de Dados](#estrutura-de-banco-de-dados)

---

## Visão Geral

O Asaas é um gateway de pagamento brasileiro que oferece integração via API REST para processar pagamentos através de múltiplos métodos: PIX, Boleto, Cartão de Crédito e Cartão de Débito.

**URLs Base:**
- **Sandbox (Testes):** `https://sandbox.asaas.com/api/v3`
- **Produção:** `https://www.asaas.com/api/v3`

**Documentação Oficial:**
- [Documentação Completa](https://docs.asaas.com/)
- [Referência da API v3](https://docs.asaas.com/reference)

---

## Configuração Inicial

### 1. Criar Conta no Asaas

1. **Sandbox (Testes):**
   - Acesse: https://sandbox.asaas.com
   - Crie uma conta gratuita
   - Use dados fictícios para testes

2. **Produção:**
   - Acesse: https://www.asaas.com
   - Crie uma conta empresarial
   - Complete a verificação de documentos

### 2. Obter Chaves de API

**API Key:**
1. Acesse: "Minha Conta" > "Integrações" > "Chaves de API"
2. Clique em "Gerar Nova Chave"
3. Copie a chave gerada (ela só será exibida uma vez)

**Webhook Token:**
1. Acesse: "Configurações" > "Webhooks"
2. Configure a URL do webhook (ex: `https://seudominio.com/api/webhooks/asaas`)
3. Copie o token de autenticação do webhook

### 3. Variáveis de Ambiente

Configure as seguintes variáveis no seu arquivo `.env`:

```env
# Asaas Configuration
ASAAS_API_KEY=your_api_key_here
ASAAS_WEBHOOK_TOKEN=your_webhook_token_here
ASAAS_ENVIRONMENT=sandbox  # ou 'production'
ASAAS_API_URL=https://sandbox.asaas.com/api/v3  # ou https://www.asaas.com/api/v3
```

---

## Autenticação

Todas as requisições à API do Asaas devem incluir o header `access_token` com sua API Key.

### Headers Obrigatórios

```http
access_token: {ASAAS_API_KEY}
Content-Type: application/json
```

### Exemplo de Cliente HTTP (Axios)

```typescript
import axios, { AxiosInstance } from 'axios';

const createAsaasClient = (): AxiosInstance => {
  const apiKey = process.env.ASAAS_API_KEY;
  const apiUrl = process.env.ASAAS_API_URL || 'https://sandbox.asaas.com/api/v3';

  if (!apiKey) {
    throw new Error('ASAAS_API_KEY não configurada');
  }

  const client = axios.create({
    baseURL: apiUrl,
    timeout: 30000, // 30 segundos
    headers: {
      'access_token': apiKey,
      'Content-Type': 'application/json',
    },
  });

  return client;
};
```

---

## Endpoints da API

## Clientes (Customers)

### 1. Criar Cliente

**Endpoint:** `POST /customers`

**Descrição:** Cria um novo cliente no Asaas. Um cliente é necessário para criar pagamentos.

**Request Body:**

```json
{
  "name": "Nome Completo do Cliente",
  "email": "cliente@exemplo.com",
  "cpfCnpj": "12345678900",
  "phone": "11999999999",
  "mobilePhone": "11999999999",
  "postalCode": "01310-100",
  "address": "Rua Exemplo",
  "addressNumber": "123",
  "complement": "Apto 45",
  "province": "Centro",
  "city": "São Paulo",
  "state": "SP",
  "externalReference": "USER-123",
  "notificationDisabled": true
}
```

**Campos Obrigatórios:**
- `name`: Nome completo do cliente
- `email`: E-mail válido
- `cpfCnpj`: CPF (11 dígitos) ou CNPJ (14 dígitos), apenas números

**Campos Opcionais:**
- `phone`: Telefone fixo (apenas números)
- `mobilePhone`: Telefone celular (apenas números)
- `postalCode`: CEP (formato: 00000-000 ou 00000000)
- `address`: Endereço completo
- `addressNumber`: Número do endereço
- `complement`: Complemento do endereço
- `province`: Bairro
- `city`: Cidade
- `state`: Estado (sigla de 2 letras: SP, RJ, etc.)
- `externalReference`: Referência externa (ID do usuário no seu sistema)
- `notificationDisabled`: Desabilita notificações de faturas do Asaas (padrão: `false`)

**Response (200 OK):**

```json
{
  "object": "customer",
  "id": "cus_000005814069",
  "dateCreated": "2023-12-01",
  "name": "Nome Completo do Cliente",
  "email": "cliente@exemplo.com",
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
  "externalReference": "USER-123",
  "notificationDisabled": true,
  "additionalEmails": null,
  "canDelete": true,
  "cannotBeDeletedReason": null,
  "canEdit": true,
  "cannotEditReason": null,
  "personType": "FISICA",
  "observations": null
}
```

**Exemplo de Implementação:**

```typescript
export const createCustomer = async (
  customerData: {
    name: string;
    email: string;
    cpfCnpj: string;
    phone?: string;
    mobilePhone?: string;
    postalCode?: string;
    address?: string;
    addressNumber?: string;
    complement?: string;
    province?: string;
    city?: string;
    state?: string;
    externalReference?: string;
    notificationDisabled?: boolean;
  }
): Promise<{ id: string; created: boolean }> => {
  const asaasClient = createAsaasClient();

  // Verificar se cliente já existe por CPF/CNPJ
  try {
    const searchResponse = await asaasClient.get('/customers', {
      params: { cpfCnpj: customerData.cpfCnpj },
    });

    if (searchResponse.data?.data && searchResponse.data.data.length > 0) {
      const existingCustomer = searchResponse.data.data[0];
      return {
        id: existingCustomer.id,
        created: false,
      };
    }
  } catch (error) {
    // Cliente não existe, continuar para criar
  }

  // Criar novo cliente
  const response = await asaasClient.post('/customers', {
    ...customerData,
    notificationDisabled: customerData.notificationDisabled ?? true,
  });

  return {
    id: response.data.id,
    created: true,
  };
};
```

### 2. Buscar Cliente por CPF/CNPJ

**Endpoint:** `GET /customers?cpfCnpj={cpfCnpj}`

**Descrição:** Busca um cliente existente pelo CPF/CNPJ.

**Query Parameters:**
- `cpfCnpj`: CPF ou CNPJ do cliente (apenas números)

**Response (200 OK):**

```json
{
  "object": "list",
  "hasMore": false,
  "totalCount": 1,
  "data": [
    {
      "object": "customer",
      "id": "cus_000005814069",
      "dateCreated": "2023-12-01",
      "name": "Nome Completo",
      "email": "cliente@exemplo.com",
      ...
    }
  ]
}
```

### 3. Buscar Cliente por ID

**Endpoint:** `GET /customers/{customerId}`

**Descrição:** Busca um cliente específico pelo ID do Asaas.

**Response (200 OK):**

```json
{
  "object": "customer",
  "id": "cus_000005814069",
  "dateCreated": "2023-12-01",
  "name": "Nome Completo",
  ...
}
```

### 4. Atualizar Cliente

**Endpoint:** `PUT /customers/{customerId}`

**Descrição:** Atualiza dados de um cliente existente.

**Request Body:** Mesmos campos do criar cliente (todos opcionais, apenas os campos enviados serão atualizados).

**Exemplo:**

```typescript
// Desabilitar notificações de faturas
await asaasClient.put(`/customers/${customerId}`, {
  notificationDisabled: true,
});
```

---

## Pagamentos (Payments)

### 1. Criar Pagamento

**Endpoint:** `POST /payments`

**Descrição:** Cria uma nova cobrança no Asaas.

**Request Body:**

```json
{
  "customer": "cus_000005814069",
  "billingType": "PIX",
  "value": 100.00,
  "dueDate": "2025-12-31",
  "description": "Descrição do pagamento",
  "externalReference": "REG-123456789",
  "installmentCount": 1,
  "installmentValue": 100.00
}
```

**Campos Obrigatórios:**
- `customer`: ID do cliente no Asaas (formato: `cus_xxxxx`)
- `billingType`: Tipo de pagamento (`PIX`, `BOLETO`, `CREDIT_CARD`, `DEBIT_CARD`)
- `value`: Valor do pagamento (número decimal, ex: 100.00)
- `dueDate`: Data de vencimento (formato: `YYYY-MM-DD`)

**Campos Opcionais:**
- `description`: Descrição do pagamento
- `externalReference`: Referência externa (ID da inscrição/pedido no seu sistema)
- `installmentCount`: Número de parcelas (padrão: 1)
- `installmentValue`: Valor de cada parcela (padrão: igual ao valor total)

**Response (200 OK):**

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
  "description": "Descrição do pagamento",
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
  "invoiceNumber": "000001234",
  "externalReference": "REG-123456789",
  "deleted": false,
  "anticipated": false,
  "refunds": null,
  "pixTransactionId": null,
  "pixQrCodeId": null,
  "pixQrCode": null
}
```

**Exemplo de Implementação:**

```typescript
export const createPayment = async (
  customerId: string,
  paymentData: {
    value: number;
    dueDate: string; // YYYY-MM-DD
    description: string;
    billingType: 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'DEBIT_CARD';
    externalReference?: string;
  }
): Promise<{
  id: string;
  status: string;
  pixQrCode?: string;
  pixQrCodeId?: string;
  paymentLink?: string;
}> => {
  const asaasClient = createAsaasClient();

  const paymentRequest = {
    customer: customerId,
    billingType: paymentData.billingType,
    value: paymentData.value,
    dueDate: paymentData.dueDate,
    description: paymentData.description,
    externalReference: paymentData.externalReference,
    installmentCount: 1,
    installmentValue: paymentData.value,
  };

  const response = await asaasClient.post('/payments', paymentRequest);
  const payment = response.data;

  // Para PIX, o QR Code pode não estar disponível imediatamente
  let pixQrCode: string | null = null;
  let pixQrCodeId: string | null = null;

  if (paymentData.billingType === 'PIX') {
    // Aguardar 2 segundos para geração do QR Code
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Tentar obter QR Code via endpoint específico
    try {
      const qrCodeResponse = await asaasClient.get(
        `/payments/${payment.id}/pixQrCode`
      );

      if (qrCodeResponse.data?.payload) {
        pixQrCode = qrCodeResponse.data.payload;
        pixQrCodeId = qrCodeResponse.data.id || payment.pixQrCodeId;
      }
    } catch (error) {
      // Se endpoint específico falhar, tentar buscar no payment
      if (payment.pixQrCode) {
        pixQrCode = payment.pixQrCode;
        pixQrCodeId = payment.pixQrCodeId;
      }
    }
  }

  return {
    id: payment.id,
    status: payment.status,
    pixQrCode: pixQrCode || undefined,
    pixQrCodeId: pixQrCodeId || undefined,
    paymentLink: payment.paymentLink,
  };
};
```

### 2. Consultar Status de Pagamento

**Endpoint:** `GET /payments/{paymentId}`

**Descrição:** Consulta o status atual de um pagamento.

**Response (200 OK):**

```json
{
  "object": "payment",
  "id": "pay_123456789",
  "dateCreated": "2023-12-01",
  "customer": "cus_000005814069",
  "value": 100.00,
  "netValue": 95.00,
  "billingType": "PIX",
  "status": "CONFIRMED",
  "dueDate": "2025-12-31",
  "paymentDate": "2023-12-01",
  "externalReference": "REG-123456789",
  "pixTransactionId": "pix_transaction_123",
  "pixQrCodeId": "qr_code_123",
  "pixQrCode": "00020126580014br.gov.bcb.pix..."
}
```

**Status Possíveis:**
- `PENDING`: Aguardando pagamento
- `CONFIRMED`: Pagamento confirmado (cartão de crédito aprovado)
- `RECEIVED`: Pagamento recebido (PIX/Boleto pago)
- `OVERDUE`: Vencido
- `REFUNDED`: Estornado
- `RECEIVED_IN_CASH_UNDONE`: Recebido em dinheiro desfeito
- `CHARGEBACK_REQUESTED`: Chargeback solicitado
- `CHARGEBACK_DISPUTE`: Chargeback em disputa
- `AWAITING_CHARGEBACK_REVERSAL`: Aguardando reversão de chargeback
- `DUNNING_REQUESTED`: Negativação solicitada
- `DUNNING_RECEIVED`: Negativação recebida
- `AWAITING_RISK_ANALYSIS`: Aguardando análise de risco (cartão de crédito)

**Exemplo de Implementação:**

```typescript
export const getPaymentStatus = async (
  paymentId: string
): Promise<{
  status: string;
  paymentDate?: string;
  pixTransactionId?: string;
}> => {
  const asaasClient = createAsaasClient();

  const response = await asaasClient.get(`/payments/${paymentId}`);
  const payment = response.data;

  return {
    status: payment.status,
    paymentDate: payment.paymentDate || undefined,
    pixTransactionId: payment.pixTransactionId || undefined,
  };
};
```

### 3. Obter QR Code PIX

**Endpoint:** `GET /payments/{paymentId}/pixQrCode`

**Descrição:** Obtém o QR Code PIX de um pagamento. Este endpoint é específico para pagamentos PIX e retorna o código copia e cola.

**Response (200 OK):**

```json
{
  "id": "qr_code_123",
  "payload": "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D",
  "encodedImage": "iVBORw0KGgoAAAANSUhEUgAA...",
  "expirationDate": "2025-12-31T23:59:59Z"
}
```

**Campos:**
- `id`: ID do QR Code no Asaas
- `payload`: Código PIX copia e cola (formato EMV)
- `encodedImage`: Imagem do QR Code em Base64 (opcional)
- `expirationDate`: Data de expiração do QR Code

**Nota Importante:** O QR Code pode não estar disponível imediatamente após criar o pagamento. Recomenda-se:
1. Aguardar 1-2 segundos após criar o pagamento
2. Tentar obter via endpoint `/payments/{id}/pixQrCode`
3. Se não disponível, fazer polling com intervalo de 2-5 segundos (máximo 5 tentativas)

### 4. Cancelar Pagamento

**Endpoint:** `DELETE /payments/{paymentId}`

**Descrição:** Cancela um pagamento pendente. Pagamentos já pagos não podem ser cancelados.

**Response (200 OK):**

```json
{
  "deleted": true,
  "id": "pay_123456789"
}
```

**Restrições:**
- Apenas pagamentos com status `PENDING` ou `OVERDUE` podem ser cancelados
- Pagamentos com status `CONFIRMED`, `RECEIVED` ou `RECEIVED_IN_CASH` não podem ser cancelados

**Exemplo de Implementação:**

```typescript
export const cancelPayment = async (
  paymentId: string
): Promise<void> => {
  const asaasClient = createAsaasClient();

  // Verificar status antes de cancelar
  const paymentResponse = await asaasClient.get(`/payments/${paymentId}`);
  const payment = paymentResponse.data;

  if (payment.status === 'CONFIRMED' || payment.status === 'RECEIVED') {
    throw new Error('Pagamento já foi pago e não pode ser cancelado');
  }

  // Cancelar pagamento
  await asaasClient.delete(`/payments/${paymentId}`);
};
```

---

## Pagamento com Cartão de Crédito

### Criar Pagamento com Cartão

**Endpoint:** `POST /payments`

**Request Body:**

```json
{
  "customer": "cus_000005814069",
  "billingType": "CREDIT_CARD",
  "value": 100.00,
  "dueDate": "2025-12-31",
  "description": "Pagamento com cartão",
  "externalReference": "REG-123456789",
  "installmentCount": 1,
  "installmentValue": 100.00,
  "creditCard": {
    "holderName": "NOME DO PORTADOR",
    "number": "4111111111111111",
    "expiryMonth": "12",
    "expiryYear": "2025",
    "ccv": "123"
  },
  "creditCardHolderInfo": {
    "name": "Nome Completo",
    "email": "cliente@exemplo.com",
    "cpfCnpj": "12345678900",
    "postalCode": "01310100",
    "addressNumber": "123",
    "addressComplement": "Apto 45",
    "phone": "11999999999",
    "mobilePhone": "11999999999"
  }
}
```

**Campos do Cartão:**
- `holderName`: Nome do portador (como está no cartão)
- `number`: Número do cartão (apenas números, sem espaços)
- `expiryMonth`: Mês de expiração (formato: `MM`, ex: `01` a `12`)
- `expiryYear`: Ano de expiração (formato: `YYYY`, ex: `2025`)
- `ccv`: Código de segurança (3 ou 4 dígitos)

**Campos do Portador:**
- `name`: Nome completo
- `email`: E-mail
- `cpfCnpj`: CPF/CNPJ (apenas números)
- `postalCode`: CEP (apenas números)
- `addressNumber`: Número do endereço
- `addressComplement`: Complemento (opcional)
- `phone`: Telefone fixo (apenas números)
- `mobilePhone`: Telefone celular (apenas números)

**Response:**

```json
{
  "object": "payment",
  "id": "pay_123456789",
  "status": "CONFIRMED",
  "billingType": "CREDIT_CARD",
  "value": 100.00,
  "netValue": 97.00,
  "paymentDate": "2023-12-01",
  ...
}
```

**Status Possíveis para Cartão:**
- `CONFIRMED`: Pagamento aprovado imediatamente
- `PENDING`: Pagamento pendente de análise
- `AWAITING_RISK_ANALYSIS`: Aguardando análise de risco
- `REFUNDED`: Estornado

**Cartões de Teste (Sandbox):**
- **Aprovado:** `4000 0000 0000 0010`
- **Recusado:** `4000 0000 0000 0002`
- **CVV:** Qualquer 3 dígitos
- **Validade:** Qualquer data futura

---

## Webhooks

### Configuração do Webhook

1. Acesse: "Configurações" > "Webhooks" no painel do Asaas
2. Configure a URL do webhook: `https://seudominio.com/api/webhooks/asaas`
3. Selecione os eventos que deseja receber:
   - `PAYMENT_CREATED`
   - `PAYMENT_UPDATED`
   - `PAYMENT_CONFIRMED`
   - `PAYMENT_RECEIVED`
   - `PAYMENT_OVERDUE`
   - `PAYMENT_DELETED`
   - `PAYMENT_REFUNDED`
   - etc.
4. Copie o token de autenticação

### Endpoint do Webhook

**Endpoint no seu sistema:** `POST /api/webhooks/asaas`

**Headers enviados pelo Asaas:**
```
asaas-access-token: {ASAAS_WEBHOOK_TOKEN}
Content-Type: application/json
```

**Request Body:**

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
    "description": "Descrição do pagamento",
    "billingType": "PIX",
    "status": "CONFIRMED",
    "dueDate": "2025-12-31",
    "paymentDate": "2023-12-01",
    "clientPaymentDate": "2023-12-01",
    "externalReference": "REG-123456789",
    "invoiceNumber": "000001234",
    "deleted": false,
    "pixTransactionId": "pix_transaction_123"
  }
}
```

**Eventos Possíveis:**
- `PAYMENT_CREATED`: Pagamento criado
- `PAYMENT_UPDATED`: Pagamento atualizado
- `PAYMENT_CONFIRMED`: Pagamento confirmado (cartão aprovado)
- `PAYMENT_RECEIVED`: Pagamento recebido (PIX/Boleto pago)
- `PAYMENT_OVERDUE`: Pagamento vencido
- `PAYMENT_DELETED`: Pagamento deletado
- `PAYMENT_RESTORED`: Pagamento restaurado
- `PAYMENT_REFUNDED`: Pagamento estornado
- `PAYMENT_CHARGEBACK_REQUESTED`: Chargeback solicitado
- `PAYMENT_CHARGEBACK_DISPUTE`: Chargeback em disputa
- `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`: Aguardando reversão de chargeback

### Validação do Webhook

**Middleware de Autenticação:**

```typescript
import { Request, Response, NextFunction } from 'express';

export const validateAsaasWebhookToken = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const webhookToken = req.headers['asaas-access-token'] as string;
  const expectedToken = process.env.ASAAS_WEBHOOK_TOKEN;

  if (!expectedToken) {
    console.warn('⚠️ ASAAS_WEBHOOK_TOKEN não configurado');
    next();
    return;
  }

  if (!webhookToken || webhookToken !== expectedToken) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid webhook token',
    });
    return;
  }

  next();
};
```

### Processamento do Webhook

**Exemplo de Handler:**

```typescript
export const handleWebhook = async (req: Request, res: Response) => {
  const payload = req.body;

  // Validar payload
  if (!payload.event || !payload.payment) {
    return res.status(400).json({
      success: false,
      error: 'Invalid payload',
    });
  }

  const { event, payment } = payload;
  const paymentId = payment.id;
  const externalReference = payment.externalReference;

  // Salvar evento no banco para auditoria
  await saveWebhookEvent(event, paymentId, externalReference, payload);

  // Processar evento
  switch (event) {
    case 'PAYMENT_CONFIRMED':
    case 'PAYMENT_RECEIVED':
      // Atualizar status do pagamento para 'paid'
      // Confirmar inscrição/pedido
      await updatePaymentStatus(externalReference, 'paid');
      await confirmRegistration(externalReference);
      break;

    case 'PAYMENT_OVERDUE':
      // Marcar pagamento como vencido
      await updatePaymentStatus(externalReference, 'overdue');
      break;

    case 'PAYMENT_REFUNDED':
      // Marcar pagamento como estornado
      // Cancelar inscrição/pedido
      await updatePaymentStatus(externalReference, 'refunded');
      await cancelRegistration(externalReference);
      break;

    case 'PAYMENT_UPDATED':
      // Atualizar status baseado no status atual do pagamento
      const status = mapAsaasStatusToInternal(payment.status);
      await updatePaymentStatus(externalReference, status);
      break;
  }

  // Sempre retornar 200 OK para o Asaas
  return res.status(200).json({
    success: true,
    message: 'Webhook received',
  });
};
```

**Importante:** Sempre retorne `200 OK` para o Asaas, mesmo em caso de erro interno. Trate os erros internamente e registre-os em logs.

---

## Tipos de Pagamento

### PIX

**Características:**
- Pagamento instantâneo
- QR Code gerado automaticamente
- Pode não estar disponível imediatamente (aguardar 1-2 segundos)
- Use o endpoint `/payments/{id}/pixQrCode` para obter o QR Code

**Fluxo:**
1. Criar pagamento com `billingType: "PIX"`
2. Aguardar 1-2 segundos
3. Consultar `/payments/{id}/pixQrCode` para obter QR Code
4. Exibir QR Code para o usuário
5. Aguardar webhook `PAYMENT_RECEIVED` ou `PAYMENT_CONFIRMED`

### Boleto

**Características:**
- Pagamento com vencimento
- URL do boleto disponível em `bankSlipUrl`
- Pode ser pago até a data de vencimento
- Após vencimento, status muda para `OVERDUE`

**Fluxo:**
1. Criar pagamento com `billingType: "BOLETO"`
2. Retornar `bankSlipUrl` para o usuário
3. Usuário paga o boleto
4. Aguardar webhook `PAYMENT_RECEIVED` ou consultar status periodicamente

### Cartão de Crédito

**Características:**
- Pagamento pode ser aprovado imediatamente ou pendente de análise
- Requer dados do cartão e do portador
- Taxa de processamento aplicada (`netValue` < `value`)
- Pode ter status `AWAITING_RISK_ANALYSIS` para análise de risco

**Fluxo:**
1. Coletar dados do cartão e portador
2. Criar pagamento com `billingType: "CREDIT_CARD"` e dados do cartão
3. Verificar status na resposta:
   - `CONFIRMED`: Pagamento aprovado
   - `PENDING` ou `AWAITING_RISK_ANALYSIS`: Aguardar webhook
4. Aguardar webhook `PAYMENT_CONFIRMED` para confirmação final

---

## Tratamento de Erros

### Erros Comuns

**1. Cliente já existe:**
```json
{
  "errors": [
    {
      "code": "CUSTOMER_ALREADY_EXISTS",
      "description": "Cliente já cadastrado",
      "field": "cpfCnpj"
    }
  ]
}
```
**Solução:** Buscar cliente existente por CPF/CNPJ antes de criar.

**2. CPF/CNPJ inválido:**
```json
{
  "errors": [
    {
      "code": "INVALID_CPF_CNPJ",
      "description": "CPF/CNPJ informado é inválido",
      "field": "cpfCnpj"
    }
  ]
}
```
**Solução:** Validar CPF/CNPJ antes de enviar para o Asaas.

**3. Cliente não encontrado:**
```json
{
  "errors": [
    {
      "code": "CUSTOMER_NOT_FOUND",
      "description": "Cliente não encontrado",
      "field": "customer"
    }
  ]
}
```
**Solução:** Verificar se o cliente existe antes de criar pagamento.

**4. Valor inválido:**
```json
{
  "errors": [
    {
      "code": "INVALID_VALUE",
      "description": "Valor deve ser maior que zero",
      "field": "value"
    }
  ]
}
```
**Solução:** Validar valor mínimo antes de criar pagamento.

**5. Data de vencimento inválida:**
```json
{
  "errors": [
    {
      "code": "INVALID_DUE_DATE",
      "description": "Data de vencimento deve ser uma data futura",
      "field": "dueDate"
    }
  ]
}
```
**Solução:** Validar data de vencimento antes de criar pagamento.

### Tratamento de Erros na Implementação

```typescript
try {
  const response = await asaasClient.post('/payments', paymentRequest);
  return response.data;
} catch (error: any) {
  if (error.response?.data?.errors) {
    const errorData = error.response.data;
    const errorMessages = errorData.errors
      .map((e: any) => e.description)
      .join(', ');

    // Tratamento específico por tipo de erro
    if (errorMessages.includes('CPF/CNPJ informado é inválido')) {
      throw new Error('CPF/CNPJ inválido');
    }

    if (errorMessages.includes('Cliente não encontrado')) {
      throw new Error('Cliente não encontrado no Asaas');
    }

    throw new Error(`Erro ao criar pagamento: ${errorMessages}`);
  }

  throw new Error(`Erro ao criar pagamento: ${error.message}`);
}
```

---

## Boas Práticas

### 1. Cache de Clientes

Evite criar clientes duplicados verificando se já existe antes:

```typescript
// Verificar no banco de dados primeiro
const existingCustomer = await getCustomerByUserId(userId);
if (existingCustomer) {
  return existingCustomer.asaas_customer_id;
}

// Verificar no Asaas por CPF/CNPJ
const searchResponse = await asaasClient.get('/customers', {
  params: { cpfCnpj },
});

if (searchResponse.data?.data?.length > 0) {
  // Salvar no banco e retornar
  return searchResponse.data.data[0].id;
}

// Criar novo cliente
const newCustomer = await createCustomer(customerData);
return newCustomer.id;
```

### 2. Idempotência

Use `externalReference` para evitar pagamentos duplicados:

```typescript
const externalReference = `REG-${registrationId}`;

// Verificar se já existe pagamento com essa referência
const existingPayment = await getPaymentByExternalReference(externalReference);
if (existingPayment) {
  return existingPayment;
}

// Criar novo pagamento
const payment = await createPayment({
  ...paymentData,
  externalReference,
});
```

### 3. Retry para QR Code PIX

O QR Code PIX pode não estar disponível imediatamente:

```typescript
async function getPixQrCode(paymentId: string, maxAttempts = 5): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await asaasClient.get(`/payments/${paymentId}/pixQrCode`);
      if (response.data?.payload) {
        return response.data.payload;
      }
    } catch (error) {
      // QR Code ainda não disponível
    }

    if (attempt < maxAttempts) {
      const waitTime = attempt * 2000; // 2s, 4s, 6s, 8s
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('QR Code PIX não disponível após múltiplas tentativas');
}
```

### 4. Logging

Registre todas as requisições e respostas para debug:

```typescript
// Interceptor de requisições
asaasClient.interceptors.request.use((config) => {
  console.log(`🌐 Asaas API Request: ${config.method?.toUpperCase()} ${config.url}`);
  return config;
});

// Interceptor de respostas
asaasClient.interceptors.response.use(
  (response) => {
    console.log(`✅ Asaas API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error(`❌ Asaas API Error: ${error.response?.status}`, error.response?.data);
    return Promise.reject(error);
  }
);
```

### 5. Timeout

Configure timeout adequado para evitar requisições travadas:

```typescript
const client = axios.create({
  baseURL: apiUrl,
  timeout: 30000, // 30 segundos
  headers: {
    'access_token': apiKey,
    'Content-Type': 'application/json',
  },
});
```

### 6. Validação de Dados

Valide todos os dados antes de enviar para o Asaas:

```typescript
function validateCustomerData(data: CustomerData): void {
  if (!data.name || data.name.trim().length === 0) {
    throw new Error('Nome é obrigatório');
  }

  if (!data.email || !isValidEmail(data.email)) {
    throw new Error('E-mail inválido');
  }

  if (!data.cpfCnpj || !isValidCpfCnpj(data.cpfCnpj)) {
    throw new Error('CPF/CNPJ inválido');
  }
}

function validatePaymentData(data: PaymentData): void {
  if (!data.value || data.value <= 0) {
    throw new Error('Valor deve ser maior que zero');
  }

  if (!data.dueDate || !isValidDate(data.dueDate)) {
    throw new Error('Data de vencimento inválida');
  }

  const dueDate = new Date(data.dueDate);
  if (dueDate < new Date()) {
    throw new Error('Data de vencimento deve ser futura');
  }
}
```

---

## Estrutura de Banco de Dados

### Tabela: `asaas_customers`

Armazena a relação entre usuários do sistema e clientes no Asaas.

```sql
CREATE TABLE asaas_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  asaas_customer_id TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_asaas_customers_user_id ON asaas_customers(user_id);
CREATE INDEX idx_asaas_customers_asaas_id ON asaas_customers(asaas_customer_id);
```

### Tabela: `asaas_payments`

Armazena os pagamentos criados no Asaas vinculados a inscrições/pedidos.

```sql
CREATE TABLE asaas_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  registration_id UUID REFERENCES registrations(id) ON DELETE CASCADE,
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
CREATE INDEX idx_asaas_payments_external_ref ON asaas_payments(external_reference);
```

**Nota:** O campo `registration_id` pode ser `NULL` para pagamentos que não estão vinculados a uma inscrição (ex: taxas de transferência).

### Tabela: `asaas_webhook_events`

Armazena eventos recebidos via webhook para auditoria e reprocessamento.

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

---

## Exemplo Completo de Integração

### 1. Criar Cliente e Pagamento

```typescript
import axios from 'axios';

const asaasClient = axios.create({
  baseURL: process.env.ASAAS_API_URL,
  timeout: 30000,
  headers: {
    'access_token': process.env.ASAAS_API_KEY,
    'Content-Type': 'application/json',
  },
});

// 1. Criar ou buscar cliente
async function getOrCreateCustomer(userData: {
  userId: string;
  name: string;
  email: string;
  cpfCnpj: string;
}): Promise<string> {
  // Verificar no banco de dados
  const existing = await db.query(
    'SELECT asaas_customer_id FROM asaas_customers WHERE user_id = $1',
    [userData.userId]
  );

  if (existing.rows.length > 0) {
    return existing.rows[0].asaas_customer_id;
  }

  // Buscar no Asaas por CPF/CNPJ
  try {
    const searchResponse = await asaasClient.get('/customers', {
      params: { cpfCnpj: userData.cpfCnpj },
    });

    if (searchResponse.data?.data?.length > 0) {
      const customerId = searchResponse.data.data[0].id;
      await db.query(
        'INSERT INTO asaas_customers (user_id, asaas_customer_id) VALUES ($1, $2)',
        [userData.userId, customerId]
      );
      return customerId;
    }
  } catch (error) {
    // Cliente não existe, continuar para criar
  }

  // Criar novo cliente
  const response = await asaasClient.post('/customers', {
    name: userData.name,
    email: userData.email,
    cpfCnpj: userData.cpfCnpj,
    notificationDisabled: true, // Desabilitar notificações do Asaas
  });

  const customerId = response.data.id;

  // Salvar no banco
  await db.query(
    'INSERT INTO asaas_customers (user_id, asaas_customer_id) VALUES ($1, $2)',
    [userData.userId, customerId]
  );

  return customerId;
}

// 2. Criar pagamento PIX
async function createPixPayment(
  customerId: string,
  registrationId: string,
  amount: number,
  dueDate: string
): Promise<{
  paymentId: string;
  qrCode: string;
  status: string;
}> {
  // Criar pagamento
  const paymentResponse = await asaasClient.post('/payments', {
    customer: customerId,
    billingType: 'PIX',
    value: amount,
    dueDate: dueDate,
    description: `Inscrição ${registrationId}`,
    externalReference: `REG-${registrationId}`,
    installmentCount: 1,
    installmentValue: amount,
  });

  const payment = paymentResponse.data;

  // Aguardar QR Code
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Obter QR Code
  let qrCode: string | null = null;
  try {
    const qrCodeResponse = await asaasClient.get(
      `/payments/${payment.id}/pixQrCode`
    );
    qrCode = qrCodeResponse.data.payload;
  } catch (error) {
    // Tentar novamente após mais tempo
    await new Promise(resolve => setTimeout(resolve, 3000));
    const qrCodeResponse = await asaasClient.get(
      `/payments/${payment.id}/pixQrCode`
    );
    qrCode = qrCodeResponse.data.payload;
  }

  // Salvar no banco
  await db.query(
    `INSERT INTO asaas_payments (
      registration_id, asaas_payment_id, asaas_customer_id,
      value, billing_type, status, due_date, pix_qr_code
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      registrationId,
      payment.id,
      customerId,
      amount,
      'PIX',
      payment.status,
      dueDate,
      qrCode,
    ]
  );

  return {
    paymentId: payment.id,
    qrCode: qrCode!,
    status: payment.status,
  };
}

// 3. Fluxo completo
async function processRegistrationPayment(
  userId: string,
  registrationId: string,
  userData: { name: string; email: string; cpfCnpj: string },
  amount: number
) {
  // Criar ou buscar cliente
  const customerId = await getOrCreateCustomer({
    userId,
    ...userData,
  });

  // Criar pagamento
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + 7); // Vencimento em 7 dias

  const payment = await createPixPayment(
    customerId,
    registrationId,
    amount,
    dueDate.toISOString().split('T')[0]
  );

  return payment;
}
```

### 2. Processar Webhook

```typescript
import { Request, Response } from 'express';

export const handleAsaasWebhook = async (req: Request, res: Response) => {
  // Validar token
  const token = req.headers['asaas-access-token'];
  if (token !== process.env.ASAAS_WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { event, payment } = req.body;

  // Salvar evento
  await db.query(
    `INSERT INTO asaas_webhook_events (
      event_type, asaas_payment_id, payload, processed
    ) VALUES ($1, $2, $3, false)`,
    [event, payment.id, JSON.stringify(req.body)]
  );

  // Buscar registro por external_reference
  const externalRef = payment.externalReference;
  const registrationId = externalRef?.replace('REG-', '');

  if (!registrationId) {
    return res.status(200).json({ success: true });
  }

  // Atualizar pagamento no banco
  await db.query(
    `UPDATE asaas_payments 
     SET status = $1, payment_date = $2, updated_at = NOW()
     WHERE asaas_payment_id = $3`,
    [
      payment.status,
      payment.paymentDate ? new Date(payment.paymentDate) : null,
      payment.id,
    ]
  );

  // Processar evento
  if (event === 'PAYMENT_CONFIRMED' || event === 'PAYMENT_RECEIVED') {
    // Confirmar inscrição
    await db.query(
      `UPDATE registrations 
       SET payment_status = 'paid', status = 'confirmed', updated_at = NOW()
       WHERE id = $1`,
      [registrationId]
    );
  } else if (event === 'PAYMENT_OVERDUE') {
    // Marcar como vencido
    await db.query(
      `UPDATE registrations 
       SET payment_status = 'overdue', updated_at = NOW()
       WHERE id = $1`,
      [registrationId]
    );
  } else if (event === 'PAYMENT_REFUNDED') {
    // Cancelar inscrição
    await db.query(
      `UPDATE registrations 
       SET payment_status = 'refunded', status = 'cancelled', updated_at = NOW()
       WHERE id = $1`,
      [registrationId]
    );
  }

  // Marcar evento como processado
  await db.query(
    `UPDATE asaas_webhook_events 
     SET processed = true 
     WHERE asaas_payment_id = $1 AND event_type = $2`,
    [payment.id, event]
  );

  return res.status(200).json({ success: true });
};
```

---

## Checklist de Implementação

- [ ] Criar conta no Asaas (Sandbox e Produção)
- [ ] Obter API Key e Webhook Token
- [ ] Configurar variáveis de ambiente
- [ ] Criar cliente HTTP (Axios) com autenticação
- [ ] Implementar função de criar/buscar cliente
- [ ] Implementar função de criar pagamento
- [ ] Implementar função de consultar status
- [ ] Implementar função de obter QR Code PIX
- [ ] Implementar função de cancelar pagamento
- [ ] Criar tabelas no banco de dados
- [ ] Implementar endpoint de webhook
- [ ] Implementar validação de token do webhook
- [ ] Implementar processamento de eventos do webhook
- [ ] Implementar tratamento de erros
- [ ] Implementar logging
- [ ] Testar integração no ambiente Sandbox
- [ ] Configurar webhook no painel do Asaas
- [ ] Testar webhook com eventos reais
- [ ] Migrar para produção após testes

---

## Recursos Adicionais

- [Documentação Oficial do Asaas](https://docs.asaas.com/)
- [Referência da API v3](https://docs.asaas.com/reference)
- [Sandbox do Asaas](https://sandbox.asaas.com)
- [Painel de Produção](https://www.asaas.com)

---

**Última atualização:** Dezembro 2024
**Versão da API:** v3
