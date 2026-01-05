# Passo 1: Estrutura de Dados - Cupom e Comissão

## ✅ Concluído

## Resumo da Investigação

### 1. Estrutura da Tabela `leader_event_commissions`

**Campos principais:**
- `id` (UUID): Identificador único da comissão
- `leader_id` (UUID): Referência ao líder de grupo
- `event_id` (UUID): Referência ao evento
- `commission_percentage` (DECIMAL 5,2): Percentual de comissão (0-100)
- `bonus_type` (ENUM): Tipo de bônus ('commission', 'invitation', 'both')
- `required_purchases` (INTEGER): Número de compras necessárias para ganhar convite (quando bonus_type inclui 'invitation')
- `name` (VARCHAR): Nome da comissão (opcional)
- `created_at`, `updated_at`: Timestamps

**Constraints:**
- `UNIQUE(leader_id, event_id)`: Apenas uma comissão por líder por evento
- Foreign keys com `ON DELETE CASCADE`

**Arquivo:** `backend/migrations/039_add_leader_event_commissions.sql`

---

### 2. Estrutura da Tabela `coupons`

**Campos principais:**
- `id` (UUID): Identificador único do cupom
- `organizer_id` (UUID): Organizador que criou o cupom
- `leader_id` (UUID, nullable): Líder de grupo dono do cupom (adicionado na migration 040)
- `code` (VARCHAR 50): Código único do cupom (único por organizador)
- `name` (VARCHAR 255): Nome descritivo do cupom
- `type` (ENUM): Tipo de desconto ('percentage' ou 'fixed')
- `discount_value` (DECIMAL 10,2): Valor do desconto
- `expiration_date` (TIMESTAMP, nullable): Data de expiração
- `max_uses` (INTEGER, nullable): Máximo de usos (NULL = infinito)
- `current_uses` (INTEGER): Usos atuais
- `is_active` (BOOLEAN): Se o cupom está ativo
- `created_at`, `updated_at`: Timestamps

**Constraints:**
- `UNIQUE(code, organizer_id)`: Código único por organizador
- Foreign keys com `ON DELETE CASCADE`

**Arquivo:** `backend/migrations/031_create_coupons.sql`
**Arquivo:** `backend/migrations/040_add_leader_id_to_coupons.sql`

---

### 3. Tabela de Relacionamento `coupon_events`

**Campos:**
- `id` (UUID): Identificador único
- `coupon_id` (UUID): Referência ao cupom
- `event_id` (UUID): Referência ao evento
- `created_at`: Timestamp

**Constraints:**
- `UNIQUE(coupon_id, event_id)`: Relacionamento many-to-many
- Foreign keys com `ON DELETE CASCADE`

**Arquivo:** `backend/migrations/033_create_coupon_events_relation.sql`

**Nota:** A coluna `event_id` na tabela `coupons` foi mantida para compatibilidade, mas o relacionamento oficial é através de `coupon_events`.

---

### 4. Como o Cupom é Vinculado à Comissão

**IMPORTANTE:** Não há um campo direto `coupon_id` na tabela `leader_event_commissions`. A vinculação é feita através do **código do cupom**.

#### Formato do Código do Cupom

Quando uma comissão é criada, um cupom é gerado automaticamente com o seguinte formato:

```
REFERRAL_CODE + COMMISSION_ID_SHORT + TIMESTAMP + RANDOM
```

**Exemplo:**
- Referral code: `KIQ025`
- Commission ID: `3ef8ce31-eb18-4c4b-9ac3-bd49b62793b9`
- Commission ID (primeiros 8 chars sem hífen): `3EF8CE31`
- Timestamp (últimos 6 dígitos): `456789`
- Random (4 dígitos): `1234`
- **Código final:** `KIQ0253EF8CE314567891234`

**Código fonte:** `backend/src/controllers/leaderEventCommissionsController.ts` (linhas 127-130)

---

### 5. Fluxo de Criação de Cupom Quando Comissão é Criada

**Localização:** `backend/src/controllers/leaderEventCommissionsController.ts` (função `createLeaderEventCommissionController`)

**Passos:**

1. **Comissão é criada** na tabela `leader_event_commissions`
2. **Cupom é gerado automaticamente:**
   - Gera código único baseado em: `referral_code + commission_id_short + timestamp + random`
   - Nome do cupom: `Cupom {referral_code} - {commission_name}` ou `Cupom {referral_code} - {event_title}`
   - Tipo: `percentage`
   - Desconto padrão: `10%` (ou valor especificado em `coupon_discount`)
   - `leader_id`: ID do líder
   - `event_ids`: Array com o `event_id` da comissão
   - `is_active`: `true`

3. **Cupom é salvo** na tabela `coupons`
4. **Relacionamento** é criado na tabela `coupon_events`

**Código relevante:**
```typescript
// Linha 127-130: Geração do código
const commissionIdShort = commission.id.replace(/-/g, '').substring(0, 8).toUpperCase();
const timestamp = Date.now();
const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
const baseCode = `${leader.referral_code}${commissionIdShort}${timestamp.toString().slice(-6)}${randomSuffix}`.toUpperCase();

// Linha 154-163: Criação do cupom
coupon = await createCoupon({
  organizer_id: req.user.id,
  leader_id: leaderId,
  event_ids: [validation.data.event_id],
  code: couponCode,
  name: couponName,
  type: 'percentage',
  discount_value: couponDiscount,
  is_active: true,
});
```

---

### 6. Como o Sistema Identifica o Cupom pela Comissão

**Localização:** `backend/src/services/leaderEventCommissionsService.ts` (função `getLeaderEventCommissions`)

**Estratégia de busca:**

1. **Busca por ID da comissão no código:**
   - Extrai os primeiros 8 caracteres do `commission.id` (sem hífens)
   - Busca cupons cujo `code` contém esse ID
   - Verifica se o cupom pertence ao evento correto

2. **Fallback por nome:**
   - Se não encontrar por ID, tenta buscar por nome
   - Verifica se o nome do cupom contém o nome da comissão

3. **Fallback por evento:**
   - Se houver apenas um cupom para o evento, usa esse
   - Se houver múltiplos, tenta fazer match por nome ou usa o primeiro

**Código relevante:**
```typescript
// Linha 87: Extração do ID curto
const commissionIdShort = commission.id.replace(/-/g, '').substring(0, 8).toUpperCase();

// Linha 90-105: Busca do cupom
let coupon = coupons.find((c) => {
  const matchesEvent = c.event_ids?.includes(commission.event_id) || c.event_id === commission.event_id;
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
```

---

### 7. Como a Comissão é Identificada pelo Cupom na Inscrição

**Localização:** `backend/src/services/commissionsService.ts` (função `createCommission`)

**Processo:**

1. **Busca o `coupon_code`** da inscrição
2. **Busca o cupom** pelo código
3. **Extrai o ID da comissão** do código do cupom:
   - O código contém o `commission_id_short` (primeiros 8 chars do ID)
   - Busca todas as comissões do líder para aquele evento
   - Compara o `commission_id_short` com o código do cupom
   - Quando encontra match, usa aquela comissão

4. **Usa a configuração da comissão** encontrada:
   - `commission_percentage`
   - `bonus_type`
   - `required_purchases`

**Código relevante:**
```typescript
// Linha 80-110: Busca da comissão pelo cupom
if (couponCode) {
  const coupon = await getCouponByCodeOnly(couponCode);
  if (coupon && coupon.leader_id === data.leader_id) {
    // Extract commission ID from coupon code
    const allCommissions = await query(
      `SELECT * FROM leader_event_commissions 
       WHERE leader_id = $1 AND event_id = $2
       ORDER BY created_at DESC`,
      [data.leader_id, data.event_id]
    );
    
    // Match commission by checking if coupon code contains commission ID
    for (const comm of allCommissions.rows) {
      const commissionIdShort = comm.id.replace(/-/g, '').substring(0, 8).toUpperCase();
      if (couponCode.includes(commissionIdShort)) {
        commissionConfig = comm;
        break;
      }
    }
  }
}
```

---

## Conclusões do Passo 1

### ✅ Relação Entre Cupom e Comissão

1. **Não há FK direta:** A relação é feita através do código do cupom que contém o ID da comissão
2. **Código do cupom contém ID da comissão:** Primeiros 8 caracteres do `commission.id` (sem hífens) estão no código
3. **Um cupom por comissão:** Cada comissão gera um cupom único automaticamente
4. **Busca reversa funciona:** É possível encontrar a comissão pelo código do cupom

### ✅ Estrutura de Dados

- `leader_event_commissions`: Armazena configuração da comissão (percentual, tipo, etc.)
- `coupons`: Armazena o cupom com `leader_id` e relacionamento com eventos
- `coupon_events`: Relacionamento many-to-many entre cupons e eventos
- `registrations`: Armazena `coupon_code` quando uma inscrição usa cupom

### ✅ Fluxo Atual

1. Organizador cria comissão → Cupom é gerado automaticamente
2. Cupom contém ID da comissão no código
3. Quando inscrição usa cupom → Sistema identifica comissão pelo código
4. Comissão é calculada usando configuração da `leader_event_commissions`

---

## Próximo Passo

**Passo 2:** Criar função para buscar o cupom associado à comissão do evento

Agora que entendemos a estrutura, podemos criar uma função que:
- Recebe `leaderId` e `eventId`
- Busca a comissão do líder para aquele evento
- Busca o cupom associado àquela comissão
- Retorna o código do cupom

**Para continuar, diga: "ok passo 2"**



