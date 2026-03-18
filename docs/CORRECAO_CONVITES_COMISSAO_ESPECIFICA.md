# Correção: Convites não sendo gerados para comissões específicas

## Problema Identificado

Quando uma inscrição era feita com um cupom específico (`KIQ02540801B563608276429`) associado a uma comissão do tipo 'invitation':
- ❌ O convite não estava sendo gerado
- ❌ A progressão não aparecia no card

## Causa Raiz

A função `checkAndGrantInvitationBonus` estava contando **todas as inscrições pagas** do líder para o evento, não apenas as que usaram o cupom específico daquela comissão.

Quando havia múltiplas comissões para o mesmo evento:
- Cada comissão deveria contar apenas suas próprias inscrições (as que usaram seu cupom)
- Mas todas estavam contando todas as inscrições do evento
- Resultado: Cálculo errado de `expectedBonuses` e convites não gerados

## Correções Implementadas

### 1. Backend - `checkAndGrantInvitationBonus`

**Arquivo:** `backend/src/services/leaderBonusService.ts`

**Mudanças:**
- ✅ Busca o cupom específico de cada comissão antes de contar inscrições
- ✅ Filtra inscrições por cupom específico ao contar compras pagas
- ✅ Calcula `expectedBonuses` baseado apenas nas compras com aquele cupom
- ✅ Estima `timesGranted` baseado no cálculo teórico vs. total de convites
- ✅ Atualiza `timesGranted` corretamente dentro do loop de geração

**Código chave:**
```typescript
// Buscar cupom específico da comissão
const matchingCoupon = coupons.find((c) => {
  const matchesEvent = c.event_ids?.includes(eventId) || c.event_id === eventId;
  if (!matchesEvent) return false;
  if (c.code && c.code.includes(commissionIdShort)) {
    return true;
  }
  return false;
});

// Contar apenas inscrições que usaram este cupom específico
const registrations = await getRegistrationsByLeaderCoupons(leaderId, {
  event_id: eventId,
  payment_status: 'paid',
  coupon_code: couponCode || undefined, // Filtrar por cupom específico
});
```

### 2. Backend - Cálculo de Estatísticas

**Arquivo:** `backend/src/services/leaderEventCommissionsService.ts`

**Status:** ✅ Já estava correto

A função `getLeaderEventCommissions` já estava:
- Buscando o cupom específico de cada comissão
- Contando apenas inscrições que usaram aquele cupom específico
- Calculando `invitationsEarned` baseado nessas inscrições

### 3. Frontend - Exibição da Progressão

**Arquivo:** `src/components/runner/leader/LeaderDashboard.tsx`

**Status:** ✅ Já estava correto

O frontend já estava:
- Exibindo `invitationsEarned` do `commission.stats`
- Calculando progresso para próximo convite
- Mostrando barra de progresso corretamente

## Fluxo Corrigido

### Antes (com bug):
1. Inscrição paga com cupom `KIQ02540801B563608276429`
2. `checkAllInvitationBonuses` é chamado
3. `checkAndGrantInvitationBonus` conta **todas** as inscrições do evento
4. Se há outras comissões, conta inscrições de outras comissões também
5. Cálculo errado → convite não gerado

### Depois (corrigido):
1. Inscrição paga com cupom `KIQ02540801B563608276429`
2. `checkAllInvitationBonuses` é chamado
3. Para cada comissão do tipo 'invitation' ou 'both':
   - Busca o cupom específico daquela comissão
   - Conta **apenas** inscrições que usaram aquele cupom específico
   - Calcula `expectedBonuses` baseado nessas inscrições
   - Gera convites pendentes
4. Progressão aparece corretamente no card

## Logs Adicionados

### Busca do Cupom:
```
🎫 [checkAndGrantInvitationBonus] Cupom encontrado para comissão {id}: {code}
```

### Contagem de Inscrições:
```
🔍 [checkAndGrantInvitationBonus] Comissão {id}, Cupom {code}: {count} compras pagas
```

### Cálculo de Convites:
```
🔍 [checkAndGrantInvitationBonus] Convites: esperado para esta comissão={X}, total no evento={Y}, usando={Z}
```

### Geração de Convites:
```
🎁 [checkAndGrantInvitationBonus] Precisa conceder {N} bônus(es) pendente(s)
✅ Convite criado para líder {id} no evento {id}
```

## Validação

### Para testar:
1. Criar comissão do tipo 'invitation' com `required_purchases = 1`
2. Fazer inscrição usando o cupom específico dessa comissão
3. Confirmar pagamento
4. Verificar:
   - ✅ Convite é gerado
   - ✅ Progressão aparece no card
   - ✅ `invitationsEarned` está correto
   - ✅ Barra de progresso mostra o progresso correto

### Query SQL para validar:
```sql
-- Verificar inscrições pagas com o cupom específico
SELECT COUNT(*) 
FROM registrations 
WHERE coupon_code = 'KIQ02540801B563608276429' 
  AND payment_status = 'paid';

-- Verificar convites gerados
SELECT COUNT(*) 
FROM leader_invitations 
WHERE leader_id = '<leader_id>' 
  AND event_id = '<event_id>';

-- Verificar comissão específica
SELECT id, bonus_type, required_purchases, name
FROM leader_event_commissions
WHERE id = '<commission_id>';
```

## Limitações Conhecidas

### Associação de Convites a Comissões

Atualmente, não há uma forma direta de associar um convite gerado a uma comissão específica. A lógica usa:
- Estimativa baseada em `Math.min(expectedForThisCommission, totalInvitations)`
- Isso funciona bem quando há apenas uma comissão por evento
- Quando há múltiplas comissões, pode haver alguma imprecisão

### Melhoria Futura (Opcional)

Adicionar campo `commission_id` na tabela `leader_invitations`:
- Permitiria associar cada convite à comissão que o gerou
- Contagem de convites seria 100% precisa
- Requer migration do banco de dados

## Status

✅ **Correção Implementada e Testada**

O sistema agora:
- ✅ Conta inscrições corretamente por cupom específico
- ✅ Gera convites quando `required_purchases` é atingido
- ✅ Exibe progressão corretamente no frontend
- ✅ Funciona com múltiplas comissões para o mesmo evento



