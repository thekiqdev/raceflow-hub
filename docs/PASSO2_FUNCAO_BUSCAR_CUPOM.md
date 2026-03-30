# Passo 2: Função para Buscar Cupom por Comissão de Evento

## ✅ Concluído

## Função Criada

### `getCouponByEventCommission(leaderId: string, eventId: string): Promise<Coupon | null>`

**Localização:** `backend/src/services/couponsService.ts`

**Descrição:** Busca o cupom associado à comissão de um líder para um evento específico.

---

## Implementação

### Fluxo da Função

1. **Busca a comissão:**
   - Usa `getLeaderEventCommission(leaderId, eventId)` para buscar a comissão
   - Se não encontrar, retorna `null`

2. **Busca os cupons do líder:**
   - Usa `getCouponsByLeader(leaderId)` para buscar todos os cupons do líder
   - Se não houver cupons, retorna `null`

3. **Encontra o cupom correspondente:**
   - Extrai os primeiros 8 caracteres do `commission.id` (sem hífens) → `commissionIdShort`
   - Busca cupom cujo código contém `commissionIdShort`
   - Verifica se o cupom pertence ao evento correto

4. **Estratégias de busca (em ordem de prioridade):**
   - **Prioridade 1:** Busca por ID da comissão no código do cupom
   - **Prioridade 2:** Busca por nome (se o nome do cupom contém o nome da comissão)
   - **Prioridade 3:** Se houver apenas um cupom para o evento, usa esse
   - **Prioridade 4:** Se houver múltiplos cupons, tenta match por nome ou usa o primeiro

5. **Validação:**
   - Verifica se o cupom está ativo (gera warning se inativo, mas retorna mesmo assim)
   - Retorna o cupom encontrado ou `null`

---

## Código da Função

```typescript
/**
 * Get coupon associated with a leader event commission
 * This function finds the coupon that was created for a specific commission
 * by matching the commission ID in the coupon code
 */
export const getCouponByEventCommission = async (
  leaderId: string,
  eventId: string
): Promise<Coupon | null> => {
  // First, get the commission for this leader and event
  const { getLeaderEventCommission } = await import('./leaderEventCommissionsService.js');
  const commission = await getLeaderEventCommission(leaderId, eventId);
  
  if (!commission) {
    console.log(`ℹ️ [getCouponByEventCommission] Nenhuma comissão encontrada para líder ${leaderId} e evento ${eventId}`);
    return null;
  }
  
  // Get all coupons for this leader
  const coupons = await getCouponsByLeader(leaderId);
  
  if (coupons.length === 0) {
    console.log(`ℹ️ [getCouponByEventCommission] Nenhum cupom encontrado para líder ${leaderId}`);
    return null;
  }
  
  // Extract commission ID short (first 8 chars without dashes)
  const commissionIdShort = commission.id.replace(/-/g, '').substring(0, 8).toUpperCase();
  
  // Find coupon by matching commission ID in the code
  let coupon = coupons.find((c) => {
    // Check if coupon is for this event
    const matchesEvent = c.event_ids?.includes(eventId) || c.event_id === eventId;
    if (!matchesEvent) return false;
    
    // Check if coupon code contains the commission ID
    if (c.code && c.code.includes(commissionIdShort)) {
      return true;
    }
    
    // Fallback: check if coupon name contains commission name
    if (commission.name && c.name && c.name.includes(commission.name)) {
      return true;
    }
    
    return false;
  });
  
  // If not found by ID, try to find by event (if only one coupon for this event)
  if (!coupon) {
    const eventCoupons = coupons.filter((c) => 
      c.event_ids?.includes(eventId) || c.event_id === eventId
    );
    
    // If there's only one coupon for this event, use it
    if (eventCoupons.length === 1) {
      coupon = eventCoupons[0];
      console.log(`ℹ️ [getCouponByEventCommission] Usando único cupom encontrado para o evento: ${coupon.code}`);
    } else if (eventCoupons.length > 1) {
      // If multiple coupons, try to match by name or use the first one as fallback
      coupon = eventCoupons.find((c) => 
        commission.name && c.name && c.name.includes(commission.name)
      ) || eventCoupons[0];
      console.log(`⚠️ [getCouponByEventCommission] Múltiplos cupons encontrados, usando: ${coupon.code}`);
    }
  }
  
  if (coupon) {
    console.log(`✅ [getCouponByEventCommission] Cupom encontrado: ${coupon.code} para comissão ${commission.id}`);
    
    // Validate coupon is active
    if (!coupon.is_active) {
      console.log(`⚠️ [getCouponByEventCommission] Cupom ${coupon.code} está inativo`);
      // Return it anyway, but log warning
    }
    
    return coupon;
  }
  
  console.log(`❌ [getCouponByEventCommission] Nenhum cupom encontrado para comissão ${commission.id}`);
  return null;
};
```

---

## Estratégia de Seleção para Múltiplos Cupons

### Cenário 1: Um cupom por evento
- **Ação:** Usa o único cupom encontrado
- **Log:** Informação

### Cenário 2: Múltiplos cupons para o mesmo evento
- **Prioridade 1:** Tenta fazer match por nome da comissão
- **Prioridade 2:** Usa o primeiro cupom encontrado
- **Log:** Warning indicando que múltiplos cupons foram encontrados

### Cenário 3: Nenhum cupom encontrado
- **Ação:** Retorna `null`
- **Log:** Erro

---

## Logs de Debug

A função inclui logs detalhados para facilitar debug:

- `ℹ️` - Informações (comissão não encontrada, nenhum cupom, usando único cupom)
- `✅` - Sucesso (cupom encontrado)
- `⚠️` - Avisos (cupom inativo, múltiplos cupons)
- `❌` - Erro (nenhum cupom encontrado)

---

## Validações Implementadas

1. ✅ Verifica se comissão existe
2. ✅ Verifica se líder tem cupons
3. ✅ Verifica se cupom pertence ao evento
4. ✅ Verifica se cupom está ativo (warning, mas retorna)
5. ✅ Trata casos de múltiplos cupons

---

## Casos de Uso

### Caso 1: Cupom único e ativo
- **Entrada:** `leaderId`, `eventId`
- **Processo:** Encontra comissão → Encontra cupom por ID → Retorna cupom
- **Saída:** `Coupon` com código válido

### Caso 2: Múltiplos cupons para o mesmo evento
- **Entrada:** `leaderId`, `eventId`
- **Processo:** Encontra comissão → Encontra múltiplos cupons → Seleciona por nome ou primeiro
- **Saída:** `Coupon` (com warning no log)

### Caso 3: Cupom inativo
- **Entrada:** `leaderId`, `eventId`
- **Processo:** Encontra cupom → Verifica `is_active = false`
- **Saída:** `Coupon` (com warning no log, mas retorna mesmo assim)

### Caso 4: Nenhuma comissão configurada
- **Entrada:** `leaderId`, `eventId`
- **Processo:** Busca comissão → Não encontra
- **Saída:** `null`

### Caso 5: Nenhum cupom criado
- **Entrada:** `leaderId`, `eventId`
- **Processo:** Busca cupons → Não encontra
- **Saída:** `null`

---

## Próximo Passo

**Passo 3:** Modificar `createRegistrationByLeader` para usar o cupom

Agora que temos a função para buscar o cupom, podemos:
- Chamar `getCouponByEventCommission` antes de criar a inscrição
- Adicionar `coupon_code` no objeto `registrationData`
- Garantir que o cupom seja aplicado (desconto, se houver)

**Para continuar, diga: "ok passo 3"**



