# Checklist de Testes - Integração Asaas

Use este checklist para validar que a integração com Asaas está funcionando corretamente.

## ✅ Configuração Inicial

- [ ] API Key do Asaas configurada no `.env`
- [ ] Ambiente configurado (sandbox ou production)
- [ ] URL da API configurada corretamente
- [ ] Webhook token configurado (opcional para desenvolvimento)
- [ ] Migrations executadas com sucesso
- [ ] Backend rodando sem erros
- [ ] Frontend rodando sem erros

## ✅ Teste 1: Criação de Cliente

**Passos:**
1. Fazer login no sistema
2. Criar uma nova inscrição

**Validações:**
- [ ] Cliente criado no Asaas (verificar logs do backend)
- [ ] `asaas_customer_id` salvo na tabela `asaas_customers`
- [ ] Dados do cliente corretos (nome, email, CPF)

**Comando SQL para verificar:**
```sql
SELECT * FROM asaas_customers WHERE user_id = '<user_id>';
```

## ✅ Teste 2: Criação de Pagamento PIX

**Passos:**
1. Criar inscrição com valor > 0
2. Verificar resposta da API

**Validações:**
- [ ] Pagamento criado no Asaas (verificar logs)
- [ ] QR Code PIX retornado na resposta
- [ ] Dados salvos na tabela `asaas_payments`
- [ ] `asaas_payment_id` salvo na tabela `registrations`

**Comando SQL para verificar:**
```sql
SELECT 
  ap.*,
  r.status as registration_status,
  r.payment_status
FROM asaas_payments ap
JOIN registrations r ON ap.registration_id = r.id
WHERE r.id = '<registration_id>';
```

## ✅ Teste 3: Exibição de QR Code no Frontend

**Passos:**
1. Criar inscrição
2. Verificar tela de confirmação

**Validações:**
- [ ] QR Code PIX exibido corretamente
- [ ] Valor formatado corretamente (R$ X,XX)
- [ ] Data de vencimento exibida
- [ ] Botão "Copiar código PIX" funciona
- [ ] Código copiado para clipboard
- [ ] Toast de sucesso ao copiar

## ✅ Teste 4: Polling de Status

**Passos:**
1. Criar inscrição com pagamento
2. Abrir console do navegador
3. Verificar requisições de polling

**Validações:**
- [ ] Requisições `GET /api/registrations/:id/payment-status` a cada 5 segundos
- [ ] Status retornado corretamente
- [ ] Polling para após 10 minutos ou quando pagamento confirmado

**Verificar no Network tab:**
- Requisições periódicas aparecendo
- Status correto nas respostas

## ✅ Teste 5: Webhook (Simulação)

**Passos:**
1. Obter `asaas_payment_id` de uma inscrição
2. Simular webhook usando curl ou Postman

**Comando curl:**
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

**Validações:**
- [ ] Webhook recebido com status 200
- [ ] Evento salvo na tabela `asaas_webhook_events`
- [ ] Status da inscrição atualizado para `confirmed`
- [ ] `payment_status` atualizado para `paid`

**Comando SQL para verificar:**
```sql
-- Verificar webhook
SELECT * FROM asaas_webhook_events ORDER BY created_at DESC LIMIT 1;

-- Verificar status da inscrição
SELECT id, status, payment_status FROM registrations WHERE id = '<registration_id>';
```

## ✅ Teste 6: Fluxo Completo End-to-End

**Passos:**
1. Criar inscrição completa
2. Verificar QR Code exibido
3. Simular pagamento (via webhook)
4. Verificar confirmação

**Validações:**
- [ ] Inscrição criada com sucesso
- [ ] QR Code exibido
- [ ] Polling iniciado
- [ ] Webhook processado
- [ ] Status atualizado para `confirmed`
- [ ] Mensagem de sucesso exibida no frontend
- [ ] Inscrição confirmada no banco

## ✅ Teste 7: Tratamento de Erros

### 7.1 Erro na Criação de Cliente

**Cenário:** API Key inválida

**Validações:**
- [ ] Erro capturado e logado
- [ ] Inscrição ainda é criada
- [ ] Mensagem de aviso exibida

### 7.2 Erro na Criação de Pagamento

**Cenário:** Erro na API do Asaas

**Validações:**
- [ ] Erro capturado e logado
- [ ] Inscrição criada com status `pending`
- [ ] Dados de pagamento com `error` ou `warning`
- [ ] Mensagem de aviso exibida ao usuário

### 7.3 Webhook Inválido

**Cenário:** Webhook sem token ou token inválido

**Validações:**
- [ ] Requisição rejeitada com status 401
- [ ] Erro logado no console
- [ ] Evento não processado

## ✅ Validações Finais

### Backend
- [ ] Todos os logs aparecendo corretamente
- [ ] Erros sendo tratados adequadamente
- [ ] Dados sendo salvos corretamente no banco
- [ ] Endpoints respondendo corretamente

### Frontend
- [ ] QR Code renderizando corretamente
- [ ] Estados sendo atualizados corretamente
- [ ] Mensagens de erro/sucesso sendo exibidas
- [ ] Polling funcionando corretamente

### Banco de Dados
- [ ] Tabelas populadas corretamente
- [ ] Relacionamentos corretos
- [ ] Status atualizados corretamente
- [ ] Índices criados (verificar performance)

## 📊 Métricas de Sucesso

Após todos os testes, verificar:

- [ ] Taxa de sucesso na criação de clientes: > 95%
- [ ] Taxa de sucesso na criação de pagamentos: > 95%
- [ ] Tempo médio de resposta da API: < 2s
- [ ] Webhooks processados com sucesso: > 99%
- [ ] Sem erros críticos nos logs

## 🐛 Problemas Conhecidos

Liste aqui problemas encontrados durante os testes:

1. 
2. 
3. 

## 📝 Notas

Adicione aqui observações importantes:

- 
- 
- 

---

**Data dos Testes:** _______________

**Testado por:** _______________

**Ambiente:** [ ] Sandbox [ ] Production

**Status Geral:** [ ] ✅ Aprovado [ ] ⚠️ Aprovado com ressalvas [ ] ❌ Reprovado


