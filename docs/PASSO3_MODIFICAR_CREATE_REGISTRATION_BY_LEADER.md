# Passo 3: Modificar createRegistrationByLeader para Usar Cupom

## ✅ Concluído

## Modificações Realizadas

### Arquivo: `backend/src/controllers/registrationsController.ts`

**Função:** `createRegistrationByLeaderController`

---

## Implementação

### 1. Busca do Cupom

Antes de calcular o total, o sistema agora:
- Chama `getCouponByEventCommission(leader.id, event_id)` para buscar o cupom
- Valida o cupom usando `validateCoupon` antes de usar
- Se o cupom for válido, aplica o desconto

### 2. Aplicação do Desconto

O desconto é aplicado ao `totalAmount` antes de criar a inscrição:

**Para cupom tipo 'percentage':**
```typescript
const discountAmount = totalAmount * (coupon.discount_value / 100);
totalAmount = totalAmount - discountAmount;
```

**Para cupom tipo 'fixed':**
```typescript
totalAmount = Math.max(0, totalAmount - coupon.discount_value);
```

**Proteção:**
- Garante que `totalAmount` não fique negativo: `Math.max(0, totalAmount)`

### 3. Inclusão do coupon_code

O `coupon_code` é adicionado ao objeto `registrationData`:

```typescript
const registrationData = {
  event_id,
  category_id,
  kit_id: kit_id || undefined,
  runner_id: athlete.id,
  registered_by: req.user.id,
  total_amount: totalAmount, // Já com desconto aplicado
  payment_method: 'pix' as const,
  coupon_code: couponCode, // NOVO: código do cupom
};
```

### 4. Validação do Cupom

O cupom é validado antes de ser usado:
- Verifica se está ativo
- Verifica se não expirou
- Verifica se não atingiu limite de usos
- Verifica se é válido para o evento

Se o cupom for inválido, o sistema continua sem cupom (não falha a inscrição).

---

## Fluxo Completo

1. **Validações iniciais:**
   - Verifica se usuário é líder ativo
   - Verifica se tem comissão configurada para o evento
   - Valida email, evento, categoria, etc.

2. **Cálculo do total (sem desconto):**
   - Soma preço da categoria
   - Adiciona preço do kit (se houver)

3. **Busca e aplicação do cupom:**
   - Busca cupom usando `getCouponByEventCommission`
   - Valida o cupom
   - Aplica desconto ao total
   - Armazena código do cupom

4. **Criação da referência:**
   - Cria referência do atleta ao líder (se não existir)

5. **Criação da inscrição:**
   - Chama `createRegistration` com `coupon_code` preenchido
   - O `createRegistration` valida novamente o cupom e incrementa uso

6. **Criação do pagamento:**
   - Gera pagamento PIX com valor já descontado

---

## Logs Adicionados

### Sucesso:
- `✅ [createRegistrationByLeader] Cupom encontrado e válido: {code}`
- `💰 [createRegistrationByLeader] Desconto de X% aplicado: R$ Y`
- `💰 [createRegistrationByLeader] Valor total após desconto: R$ X`

### Avisos:
- `⚠️ [createRegistrationByLeader] Cupom encontrado mas inválido: {erro}`
- `ℹ️ [createRegistrationByLeader] Nenhum cupom encontrado para comissão do evento`

### Erros:
- `⚠️ [createRegistrationByLeader] Erro ao buscar/validar cupom (continuando sem cupom): {erro}`

---

## Comportamento em Casos Especiais

### Caso 1: Cupom não encontrado
- **Ação:** Continua sem cupom
- **Log:** Informação
- **Resultado:** Inscrição criada sem desconto

### Caso 2: Cupom inválido (inativo, expirado, etc.)
- **Ação:** Continua sem cupom
- **Log:** Aviso
- **Resultado:** Inscrição criada sem desconto

### Caso 3: Cupom válido
- **Ação:** Aplica desconto e usa cupom
- **Log:** Sucesso
- **Resultado:** Inscrição criada com desconto e `coupon_code` preenchido

### Caso 4: Erro ao buscar cupom
- **Ação:** Continua sem cupom
- **Log:** Erro
- **Resultado:** Inscrição criada sem desconto (não falha)

---

## Validação Dupla

O cupom é validado duas vezes:

1. **No controller (`createRegistrationByLeaderController`):**
   - Valida antes de aplicar desconto
   - Se inválido, não aplica desconto mas continua

2. **No service (`createRegistration`):**
   - Valida novamente quando recebe `coupon_code`
   - Se inválido, remove `coupon_code` mas não falha a inscrição
   - Incrementa uso do cupom se válido

Isso garante robustez: mesmo se a primeira validação falhar, a segunda vai corrigir.

---

## Próximo Passo

**Passo 4:** Verificar Cálculo de Comissão com Cupom

Agora que o cupom está sendo usado na inscrição, precisamos garantir que:
- A comissão seja calculada usando a configuração correta do organizador
- O sistema identifique a comissão pelo cupom
- O percentual correto seja usado

**Para continuar, diga: "ok passo 4"**



