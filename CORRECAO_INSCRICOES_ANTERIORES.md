# Correção: Valores de Inscrições Anteriores

## Problema Identificado

Algumas inscrições anteriores estavam sendo exibidas com o valor incluindo a taxa da plataforma, mesmo após as correções implementadas.

## Causa Raiz

O `total_amount` armazenado no banco de dados **sempre inclui a taxa da plataforma**, independente de quando a inscrição foi criada. A lógica anterior só aplicava o cálculo de remoção da taxa para registros com `payment_status === "paid"`, mas deveria aplicar para **todos os registros com `total_amount > 0`**.

## Correções Aplicadas

### 1. OrganizerRegistrations.tsx
**Alteração:** Mudança na condição de cálculo de `payment_status === "paid"` para `total_amount > 0`

**Locais corrigidos:**
- Linha 666: Tabela de inscrições - agora calcula para todos os registros com valor > 0
- Linha 1207: Dialog de detalhes - agora calcula para todos os registros com valor > 0

**Antes:**
```typescript
registration.payment_status === "paid"
  ? calculateValueWithoutFee(...)
  : parseFloat(String(registration.total_amount || 0))
```

**Depois:**
```typescript
(registration.total_amount || 0) > 0
  ? calculateValueWithoutFee(...)
  : parseFloat(String(registration.total_amount || 0))
```

### 2. EventDetailedReport.tsx
**Alteração:** Mudança na condição de cálculo e inclusão de registros "convidado" nos cálculos de revenue

**Locais corrigidos:**
- Linha 784: Tabela de inscrições - agora calcula para todos os registros com valor > 0
- Linha 174-217: Cálculos de revenue - agora inclui registros "convidado" com valor > 0
- Linha 317: Revenue por modalidade - agora inclui registros "convidado" com valor > 0

**Antes:**
```typescript
if (reg.payment_status === "paid") {
  // cálculos...
}
```

**Depois:**
```typescript
if (reg.payment_status === "paid" || reg.payment_status === "convidado" || (reg.total_amount && Number(reg.total_amount) > 0)) {
  if (regAmount > 0) {
    // cálculos com amountWithoutFee...
  }
}
```

## Lógica Corrigida

### Regra de Cálculo
- **Se `total_amount > 0`**: Sempre calcular valor sem taxa (pois o valor armazenado já inclui a taxa)
- **Se `total_amount = 0`**: Mostrar valor zero (não precisa de cálculo)

### Status de Pagamento Considerados
- `paid`: Sempre calcular se `total_amount > 0`
- `convidado`: Calcular se `total_amount > 0` (pode ter kit ou outros custos)
- `pending`: Calcular se `total_amount > 0` (valor já inclui taxa, mesmo pendente)
- Outros status: Calcular se `total_amount > 0`

## Impacto

### Inscrições Anteriores
✅ Agora todas as inscrições anteriores com `total_amount > 0` terão o valor exibido sem a taxa da plataforma

### Inscrições Futuras
✅ Continuarão funcionando corretamente, já que a lógica agora é baseada no valor, não no status

### Registros com Valor Zero
✅ Registros gratuitos (`total_amount = 0`) continuam mostrando zero, sem necessidade de cálculo

## Validação

Para validar a correção:
1. Verificar inscrições antigas com `payment_status = "paid"` - devem mostrar valor sem taxa
2. Verificar inscrições antigas com `payment_status = "convidado"` e `total_amount > 0` - devem mostrar valor sem taxa
3. Verificar inscrições antigas com `payment_status = "pending"` e `total_amount > 0` - devem mostrar valor sem taxa
4. Verificar registros com `total_amount = 0` - devem mostrar zero

## Observações

1. **Registros Pendentes**: Mesmo registros pendentes que têm `total_amount > 0` (por exemplo, com kit selecionado) agora terão o valor calculado sem a taxa, pois o valor armazenado já inclui a taxa.

2. **Registros Convidado**: Registros com status "convidado" podem ter `total_amount > 0` se houver kit ou outros custos associados. Esses também terão o valor calculado corretamente.

3. **Cálculo em Tempo Real**: O cálculo é feito em tempo real com base nas configurações atuais de taxa. Se a taxa mudar, todos os valores serão recalculados com a nova taxa.
