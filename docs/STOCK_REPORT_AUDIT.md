# Auditoria — Estrutura de Estoque no Relatório do Evento

**Data:** 2026-06-03  
**Escopo:** investigação read-only do fluxo de dados da seção **📦 Estoque dos Produtos** (`EventDetailedReport.tsx`).  
**Restrição:** nenhuma alteração de código ou comportamento foi feita para este documento.

---

## Decisão (objetiva)

**SIM, os dados permitem agrupamento por kit.**

Os vínculos `kit_id` → `product_id` → `variation_id` → `registration_id` existem de forma **direta e persistida** no banco. O relatório atual **não expõe** kit na API/UI, mas o agrupamento por kit é possível **enriquecendo a projeção SQL** do serviço existente — **sem migration** e **sem inferência frágil por nome**.

> **Nota importante sobre a pergunta “Camisa G → 57”:** no relatório **atual**, cada linha corresponde a **um `variation_id` único**, que pertence a **um único kit**. Se a UI mostra **uma** linha com Utilizado = 57, **não há divisão multi-kit dentro dessa linha** — as 57 unidades consumiram aquela variante específica daquele kit. A decomposição “KIT COMPLETO → X, KIT VIP → Y…” só faz sentido quando se **agrega semanticamente** o mesmo nome de produto/variação **entre kits diferentes** (vários `variation_id`); nesse caso os dados também permitem o breakdown, mas o backend precisa expor `kit_id` / `kit_name` ou um subagrupamento.

---

## 1. Fluxo atual

```
events (evento)
  └── event_kits (kit cadastrado no evento)
        └── kit_products (produto do kit: Camisa, Boné…)
              └── product_variants (variação: G, M, P… + available_quantity = estoque inicial)
                    
registrations (inscrição: kit_id escolhido)
  └── registration_product_selections (escolha persistida: product_id, variant_id, atributos)
        └── consumo de estoque = COUNT(DISTINCT registration_id) por variant_id
              (somente inscrições que passam na política variantStockPolicyService)
```

### Caminho ponta a ponta (relatório)

| Etapa | Componente | O que faz |
|-------|------------|-----------|
| 1 | `EventDetailedReport.tsx` | Chama `GET .../reports/events/:eventId/product-stock` (admin ou organizer) |
| 2 | `reportsController.getEventProductStockReportController` | Valida permissão (organizador do evento ou admin) |
| 3 | `eventProductStockReportService.getEventProductStockReport` | Executa SQL de catálogo + uso; calcula `stock_available`, `status`, resumo e alertas |
| 4 | Frontend | **Somente exibe** valores retornados; não recalcula estoque |

### Política de “estoque utilizado” (mesma do checkout)

Definida em `backend/src/services/variantStockPolicyService.ts`:

- **Consomem estoque:** `pending`, `confirmed`, `refund_requested`, e `transferred` **somente** quando `transferred_to_registration_id IS NULL` (legado sem split).
- **Não consomem:** `cancelled`, `refunded`, e casca `transferred` com split (`transferred_to_registration_id` preenchido).

Referência idêntica em `eventKitsService.getEventKits` (saldo exibido no checkout).

---

## 2. Tabelas utilizadas

| Tabela | Papel no relatório |
|--------|-------------------|
| `events` | Filtro raiz (`event_id`) |
| `event_kits` | Catálogo de kits do evento (inclui kits soft-deleted se ainda existirem na tabela) |
| `kit_products` | Produto vinculado a **um** kit (`kit_id` NOT NULL) |
| `product_variants` | Variação vinculada a **um** produto; `available_quantity` = **estoque inicial** (`NULL` = ilimitado) |
| `registrations` | Inscrição do evento; `kit_id` = kit escolhido |
| `registration_product_selections` | Fonte do **estoque utilizado**; liga `registration_id`, `product_id`, `variant_id` |

Tabelas **não** usadas pelo relatório de estoque: `kit_categories`, `asaas_payments`, `leader_invitations`, tabelas financeiras.

---

## 3. Queries principais

### 3.1 CTE de uso (estoque utilizado)

Arquivo: `backend/src/services/eventProductStockReportService.ts`

```sql
WITH usage AS (
  SELECT rps.variant_id, COUNT(DISTINCT rps.registration_id)::int AS usage_count
  FROM registration_product_selections rps
  INNER JOIN registrations r
    ON r.id = rps.registration_id
   AND (
     r.status IN ('pending', 'confirmed', 'refund_requested')
     OR (r.status = 'transferred' AND r.transferred_to_registration_id IS NULL)
   )
  WHERE r.event_id = $1
    AND rps.variant_id IS NOT NULL
  GROUP BY rps.variant_id
)
```

**Observações:**

- Agrupa **somente por `variant_id`**, não por kit.
- Ignora linhas com `variant_id IS NULL` (seleções só por atributo sem variante canônica).
- Usa `COUNT(DISTINCT registration_id)` — uma inscrição conta **no máximo 1** por variante, mesmo com várias linhas de atributo.

### 3.2 Query principal (catálogo + join de uso)

```sql
SELECT
  p.id AS product_id,
  p.name AS product_name,
  pv.id AS variation_id,
  pv.name AS variation_name,
  pv.available_quantity AS stock_initial,
  COALESCE(u.usage_count, 0) AS stock_used
FROM event_kits k
INNER JOIN kit_products p ON p.kit_id = k.id
INNER JOIN product_variants pv ON pv.product_id = p.id
LEFT JOIN usage u ON u.variant_id = pv.id
WHERE k.event_id = $1
ORDER BY p.name ASC, pv.name ASC
```

### 3.3 Cálculos pós-query (TypeScript, backend)

| Campo | Fórmula |
|-------|---------|
| `stock_available` | `stock_initial === null ? null : max(0, stock_initial - stock_used)` |
| `status` | `unlimited` se inicial null; `exhausted` se disponível ≤ 0; `low` se ≤ 10; senão `available` |
| `summary.stock_initial_total` | Soma de `stock_initial` apenas onde não é null |
| `summary.stock_used_total` | Soma de `stock_used` das variações rastreadas |
| `summary.products_count` | `COUNT(DISTINCT product_id)` |
| `low_stock_alerts` | Variações com `stock_available <= 10` |

### 3.4 Query equivalente para breakdown por kit (não implementada hoje)

Para uma variante específica (`variation_id = :variantId`):

```sql
SELECT
  k.id   AS kit_id,
  k.name AS kit_name,
  COUNT(DISTINCT rps.registration_id)::int AS stock_used
FROM registration_product_selections rps
INNER JOIN registrations r
  ON r.id = rps.registration_id
 AND ( /* mesma política registrationConsumesVariantStockSql */ )
INNER JOIN kit_products p ON p.id = rps.product_id
INNER JOIN event_kits k ON k.id = p.kit_id
WHERE r.event_id = :eventId
  AND rps.variant_id = :variantId
GROUP BY k.id, k.name;
```

Alternativa cruzando `registrations.kit_id`:

```sql
SELECT
  ek.id   AS kit_id,
  ek.name AS kit_name,
  COUNT(DISTINCT r.id)::int AS stock_used
FROM registration_product_selections rps
INNER JOIN registrations r ON r.id = rps.registration_id /* + política de status */
INNER JOIN event_kits ek ON ek.id = r.kit_id
WHERE r.event_id = :eventId
  AND rps.variant_id = :variantId
GROUP BY ek.id, ek.name;
```

Em dados consistentes, ambas devem coincidir. Divergência indica inscrição com `registrations.kit_id` desalinhado de `rps.product_id` (risco documentado na seção 6).

---

## 4. Estrutura dos vínculos

### 4.1 Diagrama de FKs relevantes

```
registrations
  ├── event_id  → events.id
  ├── kit_id    → event_kits.id          [DIRETO]
  └── id        ← registration_product_selections.registration_id

registration_product_selections
  ├── registration_id → registrations.id     [DIRETO]
  ├── product_id      → kit_products.id      [DIRETO]
  └── variant_id      → product_variants.id  [DIRETO, nullable]

kit_products
  ├── kit_id    → event_kits.id              [DIRETO]
  └── id        ← product_variants.product_id

product_variants
  ├── product_id → kit_products.id           [DIRETO]
  └── available_quantity                     [estoque inicial da variação]

event_kits
  └── event_id → events.id
```

### 4.2 O que é direto vs inferido

| Informação | Origem | Inferido? |
|------------|--------|-----------|
| Produto | `kit_products.name` via join catálogo | **Não** — ID real em `product_id` |
| Variação | `product_variants.name` | **Não** — ID real em `variation_id` |
| Estoque inicial | `product_variants.available_quantity` | **Não** |
| Estoque utilizado | `COUNT(DISTINCT registration_id)` em `registration_product_selections` | **Não** — amarrado a `variant_id` |
| Estoque disponível | Calculado no backend | Derivado, não inferido |
| Kit da variação | `kit_products.kit_id` ou `registrations.kit_id` | **Não exposto** no relatório atual, mas **persistido** |
| Kit na linha do relatório | — | **Ausente** na resposta API (`EventProductStockVariationRow` não tem `kit_id`) |

### 4.3 Cardinalidade importante

- Cada `product_variants.id` pertence a **exatamente um** `kit_products.id` → **exatamente um** `event_kits.id`.
- Dois kits com produto “Camisa” tamanho “G” terão **`variation_id` diferentes** (cadastros independentes).
- O relatório atual lista **uma linha por `variation_id`**, não consolida por nome.

---

## 5. Possibilidade de agrupamento por kit

### 5.1 Resposta direta

| Pergunta | Resposta |
|----------|----------|
| Existe vínculo direto kit ↔ inscrição ↔ variação? | **Sim** (`registrations.kit_id`, `rps.product_id → kit_products.kit_id`, `rps.variant_id`) |
| O relatório atual agrupa por kit? | **Não** — agrupa uso por `variant_id` e omite `kit_name` na API |
| Dá para saber quais kits consumiram N unidades? | **Sim**, via SQL enriquecido; para **uma linha atual** (um `variation_id`), **100% do uso é de um único kit** |
| Precisa de nova tabela/migration? | **Não** |

### 5.2 Cenário ilustrativo: “Camisa / G / Utilizado: 57”

#### Cenário A — Uma linha no relatório (um `variation_id`)

A linha “Camisa / G / 57” corresponde a **uma** variante UUID específica, por exemplo `variation_id = v-aaa`, cadastrada no kit **KIT COMPLETO**.

Breakdown por kit:

| Kit | Utilizado |
|-----|-----------|
| KIT COMPLETO | **57** |
| KIT VIP | 0 |
| KIT BÁSICO | 0 |
| **Total** | **57** |

Não há split multi-kit **dentro dessa linha** — a variante pertence a um único kit.

#### Cenário B — Mesmo nome em kits diferentes (comum em eventos reais)

Se **KIT COMPLETO** e **KIT VIP** têm cada um sua “Camisa” com variante “G”:

| Kit | Produto | Variação | variation_id | Utilizado |
|-----|---------|----------|--------------|-----------|
| KIT COMPLETO | Camisa | G | v-aaa | 35 |
| KIT VIP | Camisa | G | v-bbb | 22 |

O relatório atual mostra **duas linhas** (mesmo texto Produto/Variação, kits ocultos). Soma = 57.

Breakdown por kit (dados existentes, kit oculto na UI):

| Kit | Utilizado |
|-----|-----------|
| KIT COMPLETO | 35 |
| KIT VIP | 22 |
| KIT BÁSICO | 0 |
| **Total** | **57** |

### 5.3 Exemplo real de query (executável em staging/produção)

Substituir `:eventId` e filtrar por nomes:

```sql
SELECT
  k.name AS kit_name,
  p.name AS product_name,
  pv.name AS variation_name,
  pv.id AS variation_id,
  COUNT(DISTINCT rps.registration_id)::int AS stock_used
FROM registration_product_selections rps
INNER JOIN registrations r
  ON r.id = rps.registration_id
 AND r.status IN ('pending', 'confirmed', 'refund_requested')
INNER JOIN kit_products p ON p.id = rps.product_id
INNER JOIN event_kits k ON k.id = p.kit_id
INNER JOIN product_variants pv ON pv.id = rps.variant_id
WHERE r.event_id = :eventId
  AND p.name ILIKE 'Camisa'
  AND pv.name ILIKE '%G%'
GROUP BY k.id, k.name, p.id, p.name, pv.id, pv.name
ORDER BY k.name;
```

Resultado esperado (formato):

```
KIT COMPLETO | Camisa | G | … | 35
KIT VIP      | Camisa | G | … | 22
```

---

## 6. Riscos

| # | Risco | Impacto no relatório / agrupamento por kit |
|---|-------|---------------------------------------------|
| 1 | **Linhas sem `variant_id`** | Seleções só por atributo não entram em `stock_used`; subcontagem vs expectativa operacional |
| 2 | **Inscrição sem `registration_product_selections`** | Inscrição com kit escolhido mas sem linhas persistidas → não consome estoque no relatório (mesmo gap do checkout) |
| 3 | **`registrations.kit_id` ≠ kit de `rps.product_id`** | Possível após troca de kit/categoria sem resincronizar seleções (`PUT /registrations/:id` não reescreve seleções); breakdown por `r.kit_id` vs `p.kit_id` pode divergir |
| 4 | **Nomes duplicados na UI** | Dois kits com “Camisa / G” geram linhas visualmente iguais **sem coluna Kit** — ambiguidade na UI, não nos dados |
| 5 | **Soma do resumo (`stock_initial_total`)** | Soma estoque de **todas** as variações de **todos** os kits; kits com produtos homônimos **não compartilham** estoque no modelo (cada variante tem seu `available_quantity`) — total pode parecer “inflado” operacionalmente se o organizador espera estoque global único |
| 6 | **Kits soft-deleted (`deleted_at`)** | Catálogo do relatório ainda inclui kits com `deleted_at` preenchido (query não filtra); uso histórico continua correto por `variant_id` |
| 7 | **Múltiplas linhas RPS por inscrição/variante** | Várias linhas de atributo com mesmo `variant_id` → `COUNT(DISTINCT registration_id)` evita double-count (correto) |

---

## 7. Recomendação técnica

### 7.1 Próximo passo (antes de UI por kit)

Enriquecer **`getEventProductStockReport`** (somente projeção; mesma política de estoque):

1. Incluir na resposta por variação:
   - `kit_id`
   - `kit_name`
2. Opcional: agrupar visualmente no frontend por kit **sem recalcular** estoque.
3. Opcional: endpoint ou campo `usage_by_kit` quando houver necessidade de consolidar nomes iguais entre kits.

**Não alterar:** checkout, `getVariantRemainingStock`, política `variantStockPolicyService`, estrutura de tabelas.

### 7.2 SQL sugerido para enriquecimento mínimo

Adicionar ao SELECT principal:

```sql
k.id   AS kit_id,
k.name AS kit_name,
```

Joins já existem (`event_kits k` → `kit_products p`). Nenhuma inferência adicional necessária.

### 7.3 O que **não** fazer

- Não agrupar estoque utilizado só por `product_name + variation_name` sem `kit_id` — colapsaria kits independentes.
- Não recalcular `stock_available` no frontend.
- Não usar `registrations.kit_id` sozinho sem validar coerência com `rps.product_id` (preferir `kit_products.kit_id` como fonte da variante consumida).

---

## Referências de código

| Arquivo | Responsabilidade |
|---------|------------------|
| `backend/src/services/eventProductStockReportService.ts` | Relatório de estoque (implementação atual) |
| `backend/src/services/variantStockPolicyService.ts` | Política de status que consomem estoque |
| `backend/src/services/eventKitsService.ts` | Mesma lógica de uso por `variant_id` no checkout |
| `backend/src/services/registrationsService.ts` | Persistência de `registration_product_selections` |
| `backend/migrations/074_create_registration_product_selections.sql` | Schema RPS |
| `backend/migrations/014_add_variant_quantity.sql` | `available_quantity` = estoque inicial |
| `src/components/organizer/EventDetailedReport.tsx` | UI da seção 📦 Estoque dos Produtos |
| `src/lib/api/reports.ts` | Tipos e client HTTP |
| `docs/investigations/investigacao-kits-produtos-variacoes-atributos-inscricao.md` | Modelo de domínio completo |

---

## Resumo executivo

O relatório de estoque lê **estoque inicial** de `product_variants.available_quantity` e **estoque utilizado** de `registration_product_selections` agregado por `variant_id`, com a mesma regra de status do checkout. A UI **não calcula** nada; apenas renderiza a API.

**Decisão:** **SIM, os dados permitem agrupamento por kit.** O backend atual precisa **enriquecer a resposta** (`kit_id`, `kit_name`) antes de uma UI agrupada por kit — mas **não** é necessária nova modelagem de dados.
