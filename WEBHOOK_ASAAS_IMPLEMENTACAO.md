# 📋 Passo a Passo: Implementação do Webhook Asaas para Confirmação de Inscrições

## 🔍 Investigação do Código Existente

### ✅ O que já está implementado:

1. **Controller de Webhook** (`backend/src/controllers/asaasWebhookController.ts`)
   - ✅ Função `handleWebhook` que recebe eventos do Asaas
   - ✅ Função `processWebhookEvent` que processa eventos e atualiza status
   - ✅ Salva eventos no banco de dados (`asaas_webhook_events`)
   - ✅ Atualiza tabela `asaas_payments` com status do pagamento

2. **Rota de Webhook** (`backend/src/routes/webhooks.ts`)
   - ✅ Rota `POST /api/webhooks/asaas` configurada
   - ✅ Middleware de autenticação aplicado

3. **Middleware de Autenticação** (`backend/src/middleware/asaasWebhookAuth.ts`)
   - ✅ Validação do token `asaas-access-token` no header
   - ✅ Permite desenvolvimento sem token configurado

4. **Processamento de Eventos**
   - ✅ `PAYMENT_CONFIRMED` → Atualiza `payment_status = 'paid'` e `status = 'confirmed'`
   - ✅ `PAYMENT_RECEIVED` → Atualiza `payment_status = 'paid'` e `status = 'confirmed'`
   - ✅ `PAYMENT_OVERDUE` → Atualiza `payment_status = 'failed'`
   - ✅ `PAYMENT_REFUNDED` → Atualiza `payment_status = 'refunded'` e `status = 'cancelled'`
   - ✅ `PAYMENT_UPDATED` → Atualiza baseado no status atual do pagamento

### ⚠️ Problemas Identificados:

1. **No evento `PAYMENT_UPDATED`**: 
   - ❌ Quando o status é `CONFIRMED` ou `RECEIVED`, atualiza apenas `payment_status`, mas **não atualiza `status = 'confirmed'`**
   - ✅ **CORREÇÃO NECESSÁRIA**: Adicionar atualização de `status = 'confirmed'` quando pagamento for confirmado

2. **Busca de Inscrição**:
   - ✅ Busca por `asaas_payment_id` na tabela `asaas_payments`
   - ⚠️ Não busca por `external_reference` (código da inscrição) como fallback
   - ✅ **MELHORIA SUGERIDA**: Adicionar busca por `external_reference` como fallback

3. **Validação de Payload**:
   - ✅ Valida se `event` e `payment` existem
   - ⚠️ Não valida se `payment.id` existe
   - ✅ **MELHORIA SUGERIDA**: Adicionar validação de `payment.id`

---

## 🚀 Passo a Passo para Implementação/Correção

### **PASSO 1: Corrigir lógica do evento PAYMENT_UPDATED**

**Arquivo**: `backend/src/controllers/asaasWebhookController.ts`

**Problema**: Quando `PAYMENT_UPDATED` é recebido com status `CONFIRMED` ou `RECEIVED`, apenas `payment_status` é atualizado, mas `status` da inscrição não é atualizado para `'confirmed'`.

**Solução**: Atualizar também o `status` da inscrição quando o pagamento for confirmado.

```typescript
case 'PAYMENT_UPDATED':
  let newPaymentStatus: string;
  let newStatus: string | null = null; // Novo: status da inscrição
  
  if (paymentStatus === 'CONFIRMED' || paymentStatus === 'RECEIVED') {
    newPaymentStatus = 'paid';
    newStatus = 'confirmed'; // ✅ Adicionar esta linha
  } else if (paymentStatus === 'OVERDUE') {
    newPaymentStatus = 'failed';
    // Status permanece como está (não altera para cancelled automaticamente)
  } else if (paymentStatus === 'REFUNDED') {
    newPaymentStatus = 'refunded';
    newStatus = 'cancelled'; // ✅ Adicionar esta linha
  } else {
    newPaymentStatus = 'pending';
  }

  // Atualizar com status da inscrição se necessário
  if (newStatus) {
    await query(
      `UPDATE registrations 
       SET payment_status = $1,
           status = $2,
           updated_at = NOW()
       WHERE id = $3`,
      [newPaymentStatus, newStatus, registrationId]
    );
  } else {
    await query(
      `UPDATE registrations 
       SET payment_status = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [newPaymentStatus, registrationId]
    );
  }
  break;
```

---

### **PASSO 2: Melhorar busca de inscrição (Fallback por external_reference)**

**Arquivo**: `backend/src/controllers/asaasWebhookController.ts`

**Problema**: Se a busca por `asaas_payment_id` falhar, não há fallback para buscar por `external_reference`.

**Solução**: Adicionar busca por `external_reference` como fallback.

```typescript
// Find registration by external_reference or asaas_payment_id
let registrationId: string | null = null;

// Try to find by asaas_payment_id in asaas_payments table
const paymentResult = await query(
  'SELECT registration_id FROM asaas_payments WHERE asaas_payment_id = $1',
  [asaasPaymentId]
);

if (paymentResult.rows.length > 0) {
  registrationId = paymentResult.rows[0].registration_id;
} else {
  // ✅ ADICIONAR: Fallback - buscar por external_reference
  if (payment.externalReference) {
    // external_reference geralmente tem formato "REG-{timestamp}-{code}"
    // ou pode ser o ID da inscrição diretamente
    const externalRef = payment.externalReference;
    
    // Tentar buscar diretamente pelo ID se external_reference for UUID
    const regResult = await query(
      'SELECT id FROM registrations WHERE id = $1 OR registration_code = $2',
      [externalRef, externalRef]
    );
    
    if (regResult.rows.length > 0) {
      registrationId = regResult.rows[0].id;
      console.log(`✅ Inscrição encontrada por external_reference: ${externalRef}`);
    }
  }
}
```

---

### **PASSO 3: Adicionar validação de payment.id**

**Arquivo**: `backend/src/controllers/asaasWebhookController.ts`

**Problema**: Não valida se `payment.id` existe antes de usar.

**Solução**: Adicionar validação.

```typescript
// Validate payload
if (!payload.event || !payload.payment) {
  console.error('❌ Payload inválido do webhook');
  res.status(400).json({
    success: false,
    error: 'Invalid payload',
    message: 'Event and payment are required',
  });
  return;
}

// ✅ ADICIONAR: Validar payment.id
if (!payload.payment.id) {
  console.error('❌ payment.id não fornecido no webhook');
  res.status(400).json({
    success: false,
    error: 'Invalid payload',
    message: 'Payment ID is required',
  });
  return;
}
```

---

### **PASSO 4: Adicionar logs mais detalhados**

**Arquivo**: `backend/src/controllers/asaasWebhookController.ts`

**Melhoria**: Adicionar logs mais detalhados para facilitar debug.

```typescript
console.log('📥 Webhook recebido do Asaas:', {
  event: payload.event,
  paymentId: payload.payment?.id,
  paymentStatus: payload.payment?.status,
  externalReference: payload.payment?.externalReference,
  value: payload.payment?.value,
});
```

---

### **PASSO 5: Adicionar tratamento de erro para atualização de status**

**Arquivo**: `backend/src/controllers/asaasWebhookController.ts`

**Melhoria**: Adicionar try-catch específico para atualização de status da inscrição.

```typescript
// Process event based on type
if (registrationId) {
  try {
    await processWebhookEvent(event, payment.status, registrationId);
    
    // ✅ ADICIONAR: Verificar se a atualização foi bem-sucedida
    const verifyResult = await query(
      'SELECT status, payment_status FROM registrations WHERE id = $1',
      [registrationId]
    );
    
    if (verifyResult.rows.length > 0) {
      console.log(`✅ Status verificado - Inscrição ${registrationId}:`, {
        status: verifyResult.rows[0].status,
        payment_status: verifyResult.rows[0].payment_status,
      });
    }
  } catch (error: any) {
    console.error(`❌ Erro ao processar evento ${event}:`, error);
    
    // Mark webhook event as failed
    if (webhookEventId) {
      await query(
        'UPDATE asaas_webhook_events SET processed = false, error_message = $1 WHERE id = $2',
        [error.message, webhookEventId]
      );
    }
  }
} else {
  console.warn(`⚠️ Inscrição não encontrada para payment: ${asaasPaymentId}`);
  
  // ✅ ADICIONAR: Tentar salvar evento mesmo sem registrationId para análise posterior
  if (webhookEventId) {
    await query(
      'UPDATE asaas_webhook_events SET processed = false, error_message = $1 WHERE id = $2',
      ['Registration not found', webhookEventId]
    );
  }
}
```

---

### **PASSO 6: Configurar Webhook no Painel Asaas**

**Ação Manual Necessária**:

1. Acessar o painel do Asaas (sandbox ou produção)
2. Ir em **Configurações** → **Webhooks**
3. Adicionar nova URL de webhook:
   - **URL**: `https://seu-dominio.com/api/webhooks/asaas`
   - **Eventos**: Selecionar os eventos desejados:
     - ✅ `PAYMENT_CONFIRMED`
     - ✅ `PAYMENT_RECEIVED`
     - ✅ `PAYMENT_UPDATED`
     - ✅ `PAYMENT_OVERDUE`
     - ✅ `PAYMENT_REFUNDED`
4. Copiar o **Token de Webhook** gerado
5. Adicionar no `.env`:
   ```
   ASAAS_WEBHOOK_TOKEN=token_gerado_pelo_asaas
   ```

---

### **PASSO 7: Testar o Webhook**

#### **7.1. Teste Local (usando ngrok ou similar)**

1. Expor a aplicação local:
   ```bash
   ngrok http 3001
   ```

2. Usar a URL do ngrok no painel Asaas

3. Criar uma inscrição de teste

4. Simular pagamento no Asaas (sandbox)

5. Verificar logs do servidor

#### **7.2. Teste em Produção**

1. Verificar se a URL está acessível publicamente
2. Verificar se o token está configurado corretamente
3. Monitorar logs do servidor
4. Verificar se eventos estão sendo salvos no banco

---

### **PASSO 8: Monitoramento e Debug**

#### **8.1. Consultar eventos processados**

```sql
SELECT 
  id,
  event_type,
  asaas_payment_id,
  registration_id,
  processed,
  error_message,
  created_at
FROM asaas_webhook_events
ORDER BY created_at DESC
LIMIT 50;
```

#### **8.2. Verificar inscrições atualizadas**

```sql
SELECT 
  r.id,
  r.registration_code,
  r.status,
  r.payment_status,
  ap.status as asaas_status,
  ap.payment_date,
  r.updated_at
FROM registrations r
LEFT JOIN asaas_payments ap ON ap.registration_id = r.id
WHERE r.payment_status = 'paid'
ORDER BY r.updated_at DESC
LIMIT 20;
```

---

## 📝 Resumo das Alterações Necessárias

1. ✅ **Corrigir `PAYMENT_UPDATED`**: Atualizar `status = 'confirmed'` quando pagamento confirmado
2. ✅ **Adicionar fallback**: Buscar inscrição por `external_reference` se não encontrar por `asaas_payment_id`
3. ✅ **Validação**: Validar `payment.id` antes de processar
4. ✅ **Logs**: Adicionar logs mais detalhados
5. ✅ **Tratamento de erro**: Melhorar tratamento de erros
6. ✅ **Configuração**: Configurar webhook no painel Asaas
7. ✅ **Testes**: Testar webhook localmente e em produção
8. ✅ **Monitoramento**: Criar queries para monitorar eventos

---

## 🎯 Próximos Passos

1. Implementar as correções identificadas
2. Testar localmente
3. Configurar webhook no Asaas
4. Fazer deploy
5. Monitorar logs e eventos

