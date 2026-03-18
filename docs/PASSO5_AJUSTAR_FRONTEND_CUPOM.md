# Passo 5: Ajustar Frontend para Mostrar Cupom Usado

## ✅ Concluído

## Modificações Realizadas

### 1. Interface TypeScript Atualizada

**Arquivo:** `src/lib/api/leaderEventCommissions.ts`

Adicionado campo `type` ao objeto `coupon`:

```typescript
coupon?: {
  id: string;
  code: string;
  link: string;
  discount_value?: number;
  type?: 'percentage' | 'fixed'; // NOVO
} | null;
```

### 2. Backend Atualizado

**Arquivo:** `backend/src/services/leaderEventCommissionsService.ts`

Modificado para incluir o tipo do cupom na resposta:

```typescript
enriched.coupon = {
  id: coupon.id,
  code: coupon.code,
  link: `${baseUrl}/events/${commission.event_id}?ref=${leader.referral_code}&cupom=${coupon.code}`,
  discount_value: coupon.discount_value,
  type: coupon.type, // NOVO: inclui tipo do cupom
};
```

### 3. Frontend - Dialog de Inscrição

**Arquivo:** `src/components/runner/leader/LeaderDashboard.tsx`

#### 3.1. Exibição do Cupom

Adicionado card informativo mostrando:
- Código do cupom que será aplicado
- Tipo e valor do desconto (percentual ou fixo)

```typescript
{/* Coupon info */}
{selectedEventForRegistration && (() => {
  const eventCommission = eventCommissions.find(c => c.event_id === selectedEventForRegistration);
  const coupon = eventCommission?.coupon;
  
  if (coupon) {
    return (
      <div className="p-4 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <div className="flex items-start gap-2">
          <div className="flex-1">
            <div className="text-sm font-semibold text-blue-900 dark:text-blue-100 mb-1">
              Cupom que será aplicado:
            </div>
            <div className="text-lg font-mono font-bold text-blue-700 dark:text-blue-300">
              {coupon.code}
            </div>
            {coupon.discount_value !== undefined && (
              <div className="text-xs text-blue-700 dark:text-blue-400 mt-1">
                Desconto: {coupon.type === 'fixed' 
                  ? `R$ ${coupon.discount_value.toFixed(2).replace('.', ',')}` 
                  : `${coupon.discount_value}%`}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }
  return null;
})()}
```

#### 3.2. Preview do Total com Desconto

Modificado o preview do total para mostrar:
- Subtotal (antes do desconto)
- Desconto aplicado (com tipo e valor)
- Total final (após desconto)

```typescript
{(() => {
  const eventCommission = eventCommissions.find(c => c.event_id === selectedEventForRegistration);
  const coupon = eventCommission?.coupon;
  if (coupon && coupon.discount_value !== undefined) {
    const baseAmount = (categories.find(c => c.id === selectedCategoryId)?.price || 0) +
      (selectedKitId ? (kits.find(k => k.id === selectedKitId)?.price || 0) : 0);
    
    // Calculate discount based on coupon type
    const discountAmount = coupon.type === 'fixed' 
      ? coupon.discount_value 
      : baseAmount * (coupon.discount_value / 100);
    const finalAmount = Math.max(0, baseAmount - discountAmount);
    
    return (
      <div className="mt-2 pt-2 border-t border-muted-foreground/20">
        <div className="flex justify-between text-sm text-muted-foreground">
          <span>Subtotal:</span>
          <span>R$ {baseAmount.toFixed(2).replace('.', ',')}</span>
        </div>
        <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
          <span>Desconto {coupon.type === 'fixed' 
            ? `(R$ ${coupon.discount_value.toFixed(2).replace('.', ',')})` 
            : `(${coupon.discount_value}%)`}:</span>
          <span>- R$ {discountAmount.toFixed(2).replace('.', ',')}</span>
        </div>
        <div className="flex justify-between items-center mt-2 pt-2 border-t border-muted-foreground/20">
          <span className="font-semibold">Total com desconto:</span>
          <span className="text-lg font-bold text-green-600 dark:text-green-400">
            R$ {finalAmount.toFixed(2).replace('.', ',')}
          </span>
        </div>
      </div>
    );
  }
  return null;
})()}
```

---

## Funcionalidades Implementadas

### ✅ Exibição do Cupom
- Mostra o código do cupom que será aplicado
- Exibe o tipo e valor do desconto
- Card visual destacado (azul) para fácil identificação

### ✅ Cálculo do Desconto
- **Cupom percentual:** Calcula desconto como porcentagem do subtotal
- **Cupom fixo:** Aplica valor fixo de desconto
- Garante que o total não fique negativo (`Math.max(0, finalAmount)`)

### ✅ Preview Detalhado
- Mostra subtotal (antes do desconto)
- Mostra desconto aplicado (com tipo e valor)
- Mostra total final (após desconto)
- Formatação em reais (R$) com vírgula como separador decimal

### ✅ Suporte a Ambos os Tipos
- **Percentage:** Exibe como "Desconto: X%"
- **Fixed:** Exibe como "Desconto: R$ X,XX"

---

## Experiência do Usuário

### Antes
- Líder não sabia qual cupom seria usado
- Não via o desconto que seria aplicado
- Não sabia o valor final da inscrição

### Depois
- ✅ Líder vê claramente qual cupom será aplicado
- ✅ Vê o tipo e valor do desconto
- ✅ Vê o cálculo completo: subtotal → desconto → total final
- ✅ Interface clara e informativa

---

## Exemplo Visual

### Card do Cupom:
```
┌─────────────────────────────────────┐
│ Cupom que será aplicado:            │
│ KIQ025ABC12345                      │
│ Desconto: 10%                       │
└─────────────────────────────────────┘
```

### Preview do Total:
```
┌─────────────────────────────────────┐
│ Total: R$ 100,00                    │
│ ─────────────────────────────────   │
│ Subtotal: R$ 100,00                 │
│ Desconto (10%): - R$ 10,00         │
│ ─────────────────────────────────   │
│ Total com desconto: R$ 90,00       │
└─────────────────────────────────────┘
```

---

## Próximo Passo

**Passo 6:** Testar Fluxo Completo

Agora que todas as funcionalidades estão implementadas, precisamos testar:
- Inscrição com cupom percentual
- Inscrição com cupom fixo
- Verificação de comissão gerada corretamente
- Validação de todos os cenários

**Para continuar, diga: "ok passo 6"**



