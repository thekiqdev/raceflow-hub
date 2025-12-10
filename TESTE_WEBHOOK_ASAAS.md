# 🧪 Guia de Teste do Webhook Asaas

## ⚠️ IMPORTANTE: URL Correta do Webhook

**URL CORRETA (Backend):**
```
https://cronoteam-crono-back.e758qe.easypanel.host/api/webhooks/asaas
```

**URL INCORRETA (Frontend - não funciona):**
```
https://cronoteam-crono-front.e758qe.easypanel.host/api/webhooks/asaas
```

---

## 📋 Pré-requisitos

1. ✅ Webhook configurado no painel Asaas com a URL correta do **backend**
2. ✅ Token do webhook configurado no backend (`ASAAS_WEBHOOK_TOKEN`)
3. ✅ Backend rodando e acessível publicamente
4. ✅ Ambiente sandbox do Asaas configurado

---

## 🧪 Métodos de Teste

### **MÉTODO 1: Teste Real com Pagamento PIX (Recomendado)**

Este é o método mais realista e recomendado para validar o webhook completo.

#### **Passo 1: Criar uma Inscrição de Teste**

1. Acesse o frontend: `https://cronoteam-crono-front.e758qe.easypanel.host`
2. Faça login como runner
3. Selecione um evento
4. Complete o processo de inscrição
5. Anote o **código da inscrição** (ex: `REG-1234567890-ABC123`)

#### **Passo 2: Obter o QR Code PIX**

1. Após criar a inscrição, você verá o QR Code PIX
2. Ou acesse "Minhas Inscrições" → "Visualizar PIX"
3. Anote o **ID do pagamento Asaas** (se disponível nos logs)

#### **Passo 3: Simular Pagamento no Asaas Sandbox**

**Opção A: Usar o App do Banco (Sandbox)**

1. Abra o app do seu banco
2. Escaneie o QR Code PIX gerado
3. No ambiente **sandbox**, o pagamento pode ser simulado automaticamente
4. Ou use um app de teste PIX

**Opção B: Confirmar Manualmente no Painel Asaas**

1. Acesse o painel Asaas: https://sandbox.asaas.com
2. Vá em **Cobranças** → **PIX**
3. Encontre a cobrança criada
4. Clique em **Confirmar Pagamento** ou **Simular Pagamento**
5. O Asaas enviará o webhook automaticamente

#### **Passo 4: Verificar se o Webhook Foi Recebido**

**4.1. Verificar Logs do Backend**

Acesse os logs do backend no Easypanel:
- Vá em **Logs** do serviço `crono-back`
- Procure por mensagens como:
  ```
  📥 Webhook recebido do Asaas: { event: 'PAYMENT_CONFIRMED', ... }
  ✅ Inscrição {id} confirmada após pagamento
  ```

**4.2. Verificar no Banco de Dados**

Execute estas queries:

```sql
-- Ver últimos eventos de webhook recebidos
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
LIMIT 10;

-- Verificar se a inscrição foi atualizada
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
WHERE r.registration_code = 'REG-1234567890-ABC123' -- Substitua pelo código da sua inscrição
ORDER BY r.updated_at DESC;
```

**4.3. Verificar no Frontend**

1. Acesse "Minhas Inscrições"
2. A inscrição deve aparecer como **"Confirmada"** (não mais "Pendente")
3. O status de pagamento deve ser **"Pago"**

---

### **MÉTODO 2: Teste Manual com cURL (Para Debug)**

Use este comando para simular um webhook manualmente:

```bash
curl -X POST https://cronoteam-crono-back.e758qe.easypanel.host/api/webhooks/asaas \
  -H "Content-Type: application/json" \
  -H "asaas-access-token: SEU_WEBHOOK_TOKEN_AQUI" \
  -d '{
    "event": "PAYMENT_CONFIRMED",
    "payment": {
      "object": "payment",
      "id": "pay_123456789",
      "dateCreated": "2025-12-10",
      "customer": "cus_000005814069",
      "value": 100.00,
      "netValue": 95.00,
      "description": "Inscrição - Evento Teste",
      "billingType": "PIX",
      "status": "CONFIRMED",
      "dueDate": "2025-12-31",
      "paymentDate": "2025-12-10",
      "clientPaymentDate": "2025-12-10",
      "externalReference": "REG-1234567890-ABC123",
      "deleted": false
    }
  }'
```

**⚠️ IMPORTANTE:**
- Substitua `SEU_WEBHOOK_TOKEN_AQUI` pelo token real do webhook
- Substitua `pay_123456789` por um ID de pagamento real do seu banco
- Substitua `REG-1234567890-ABC123` por um código de inscrição real

---

### **MÉTODO 3: Usar Ferramenta de Teste de Webhook**

1. **Webhook.site** (https://webhook.site)
   - Gere uma URL temporária
   - Use para testar se o Asaas está enviando webhooks
   - Não testa seu backend, mas valida a configuração do Asaas

2. **Postman**
   - Crie uma requisição POST
   - Configure headers e body como no exemplo acima
   - Envie para testar o endpoint

---

## 🔍 O que Verificar Após o Teste

### ✅ Checklist de Sucesso

- [ ] Webhook foi recebido (aparece nos logs)
- [ ] Evento foi salvo no banco (`asaas_webhook_events`)
- [ ] Inscrição foi encontrada (`registration_id` não é null)
- [ ] Status da inscrição foi atualizado para `'confirmed'`
- [ ] `payment_status` foi atualizado para `'paid'`
- [ ] Tabela `asaas_payments` foi atualizada
- [ ] Evento foi marcado como `processed = true`
- [ ] Frontend mostra a inscrição como confirmada

### ❌ Problemas Comuns

#### **1. Webhook não é recebido**

**Possíveis causas:**
- URL incorreta (apontando para frontend em vez de backend)
- Backend não está acessível publicamente
- Firewall bloqueando requisições

**Solução:**
- Verificar URL no painel Asaas
- Verificar se backend está rodando
- Verificar logs do backend

#### **2. Webhook recebido mas inscrição não encontrada**

**Possíveis causas:**
- `asaas_payment_id` não corresponde
- `external_reference` não corresponde
- Inscrição não foi criada corretamente

**Solução:**
- Verificar logs: `⚠️ Inscrição não encontrada para payment: {id}`
- Verificar se `asaas_payments` tem o registro correto
- Verificar se `external_reference` está sendo salvo corretamente

#### **3. Webhook recebido mas status não atualizado**

**Possíveis causas:**
- Erro no processamento do evento
- Erro na query SQL
- Inscrição não existe

**Solução:**
- Verificar logs de erro: `❌ Erro ao processar evento`
- Verificar `error_message` na tabela `asaas_webhook_events`
- Verificar se a inscrição existe no banco

#### **4. Token inválido**

**Possíveis causas:**
- Token não configurado no backend
- Token diferente entre Asaas e backend

**Solução:**
- Verificar variável `ASAAS_WEBHOOK_TOKEN` no backend
- Verificar token no painel Asaas
- Verificar logs: `❌ Webhook token inválido`

---

## 📊 Queries Úteis para Monitoramento

### Ver eventos processados nas últimas 24h

```sql
SELECT 
  event_type,
  COUNT(*) as total,
  COUNT(CASE WHEN processed = true THEN 1 END) as processados,
  COUNT(CASE WHEN processed = false THEN 1 END) as falhas
FROM asaas_webhook_events
WHERE created_at >= NOW() - INTERVAL '24 hours'
GROUP BY event_type
ORDER BY total DESC;
```

### Ver inscrições confirmadas por webhook

```sql
SELECT 
  r.registration_code,
  r.status,
  r.payment_status,
  ap.status as asaas_status,
  ap.payment_date,
  r.updated_at,
  (SELECT COUNT(*) 
   FROM asaas_webhook_events 
   WHERE registration_id = r.id 
   AND event_type IN ('PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED')
  ) as webhooks_recebidos
FROM registrations r
LEFT JOIN asaas_payments ap ON ap.registration_id = r.id
WHERE r.status = 'confirmed'
  AND r.payment_status = 'paid'
  AND r.updated_at >= NOW() - INTERVAL '7 days'
ORDER BY r.updated_at DESC
LIMIT 20;
```

### Ver eventos com erro

```sql
SELECT 
  id,
  event_type,
  asaas_payment_id,
  registration_id,
  error_message,
  created_at
FROM asaas_webhook_events
WHERE processed = false
  AND error_message IS NOT NULL
ORDER BY created_at DESC
LIMIT 20;
```

---

## 🎯 Próximos Passos Após Teste Bem-Sucedido

1. ✅ Monitorar webhooks em produção
2. ✅ Configurar alertas para eventos com erro
3. ✅ Criar dashboard de monitoramento (opcional)
4. ✅ Documentar processo para a equipe

---

## 📝 Notas Importantes

- **Sandbox vs Produção**: Certifique-se de estar testando no ambiente correto
- **Token do Webhook**: Mantenha o token seguro e não compartilhe
- **Logs**: Monitore os logs regularmente para identificar problemas
- **Retry**: O Asaas tenta reenviar webhooks que falham (até 3 tentativas)

