# Correção do Relatório Detalhado (EventDetailedReport)

**Objetivo:** Garantir que todos os valores exibidos no Relatório Detalhado coincidam com a lógica de pagamento ao organizador e com as taxas da plataforma (admin), evitando divergências que causem prejuízo ao admin ou pagamento incorreto ao organizador.

**Componente:** `src/components/organizer/EventDetailedReport.tsx`  
**Uso:** Organizador (Meus Eventos → Relatório) e Admin (Gestão de Eventos → Relatório do evento).

**Fonte da verdade para valores:**
- **Backend:** `organizerService.getOrganizerFinancialOverview`, `organizerEventRevenues`, e `eventsService.getEvents` (revenue por evento) usam **valor líquido** por inscrição:  
  `valor_liquido = total_amount - platform_fee_amount - registration_edit_fee_amount`  
  Quando `platform_fee_amount` ou `registration_edit_fee_amount` estão preenchidos; caso contrário, fallback para `calculateValueWithoutFee(total_amount, platform_fee, platform_fee_type)`.
- **Receita:** Apenas inscrições com `payment_status === 'paid'`. Inscrições com `payment_status === 'convidado'` **não** geram receita (são cortesias).

---

## 1. Resumo dos problemas encontrados

| # | Ponto do relatório | Problema atual | Impacto |
|---|--------------------|----------------|---------|
| 1 | Receita Total / Total de Inscrições pagas | Inclui **convidado** na receita e na contagem de "pagas"; usa só `calculateValueWithoutFee` (taxa atual) | Receita e ticket médio **maiores** que o real; organizador pode esperar valor que não será pago |
| 2 | Receita PIX / Receita Cartão | PIX/Cartão já consideram só "paid", mas valor usa taxa atual em vez de valor líquido armazenado | Pode divergir do backend se taxa mudou ou há backfill |
| 3 | Receita por Categoria | Inclui convidado; usa taxa atual | Receita por categoria inflada e inconsistente com backend |
| 4 | Receita por Kit / Inscrições com Kit | Inclui convidado; usa taxa atual; **kit_name** não vem do backend (sempre "Kit") | Receita por kit errada; nomes dos kits não aparecem |
| 5 | Modalidades – Receita Total / Ticket médio | Inclui convidado; usa taxa atual | Receita por modalidade inflada |
| 6 | Tabela "Todas as Inscrições" – coluna Valor | Usa `calculateValueWithoutFee(total_amount, platformFee, platformFeeType)`; não usa `platform_fee_amount` / `registration_edit_fee_amount` | Valor por linha pode divergir do que o backend considera líquido para o organizador |
| 7 | Ticket médio (card Receita Total) | `totalRevenue / paidCount` com paidCount incluindo convidado e totalRevenue incluindo convidado | Ticket médio inconsistente com backend |
| 8 | Dados da API não utilizados | `platform_fee_amount`, `registration_edit_fee_amount` e `kit_name` vêm em `getRegistrations` mas não são mapeados/usados | Relatório ignora fonte da verdade e nomes de kits |

---

## 2. Detalhamento por ponto

### 2.1 Receita Total e Total de Inscrições “pagas”

- **Comportamento atual (incorreto):**
  - Considera `payment_status === 'paid' || payment_status === 'convidado'` para receita e contagem.
  - Valor “sem taxa” = `calculateValueWithoutFee(total_amount, platformFee, platformFeeType)` (taxa **atual** da plataforma).
- **Comportamento correto (alinhado ao backend):**
  - **Só** `payment_status === 'paid'` deve entrar na receita e na contagem de “inscrições pagas” para fins financeiros.
  - Valor líquido por inscrição:
    - Se `(platform_fee_amount ?? 0) + (registration_edit_fee_amount ?? 0) > 0`:  
      `valor_liquido = total_amount - platform_fee_amount - registration_edit_fee_amount`
    - Senão:  
      `valor_liquido = calculateValueWithoutFee(total_amount, platformFee, platformFeeType)`
  - **Receita Total** = soma do valor líquido apenas das inscrições **paid**.
  - **Total de Inscrições pagas** (para o card e para ticket médio) = quantidade de **paid** (excluir convidado da conta de “pagas” para valor).

**Risco se não corrigir:** Organizador vê receita maior que a que será paga; admin pode ter expectativa errada de repasse.

---

### 2.2 Receita PIX e Receita Cartão

- **Comportamento atual:** Considera só "paid" para PIX/Cartão (correto), mas usa `calculateValueWithoutFee(...)` com taxa atual.
- **Comportamento correto:** Mesmo critério de valor líquido do item 2.1 (usar `platform_fee_amount` e `registration_edit_fee_amount` quando existirem). Somar apenas inscrições **paid** por método.

**Risco se não corrigir:** Divergência com dashboard/serviços do backend se a taxa foi alterada ou há backfill.

---

### 2.3 Receita por Categoria

- **Comportamento atual:** Inclui **convidado** na receita e na contagem por categoria; valor com taxa atual.
- **Comportamento correto:**
  - Incluir **apenas** inscrições **paid**.
  - Usar valor líquido (como em 2.1) por inscrição.
  - Manter agrupamento por `category_name` (já vem da API).

---

### 2.4 Receita por Kit e card “Inscrições com Kit”

- **Comportamento atual:**
  - Inclui convidado; usa taxa atual.
  - `event_kits` é sempre `null` no mapeamento; usa `reg.event_kits?.name || "Kit"`, então todos os kits aparecem como “Kit”.
- **Comportamento correto:**
  - Só **paid**; valor líquido como em 2.1.
  - Usar **kit_name** retornado pela API (`reg.kit_name` em `getRegistrations`) no mapeamento e no agrupamento (nome real do kit).
  - No componente: mapear `reg.kit_name` para o objeto de detalhe (ex.: `event_kits: reg.kit_name ? { name: reg.kit_name } : null`) e usar para chave e exibição.

**Risco se não corrigir:** Receita por kit errada; impossível distinguir kits por nome.

---

### 2.5 Modalidades – Receita Total e Ticket médio

- **Comportamento atual:** Filtra “paid/convidado” e usa `calculateValueWithoutFee` com taxa atual.
- **Comportamento correto:**
  - Considerar **apenas** inscrições **paid**.
  - Usar valor líquido (como em 2.1) por inscrição para receita e ticket médio.

---

### 2.6 Tabela “Todas as Inscrições” – coluna Valor

- **Comportamento atual:**  
  Para cada linha: `calculateValueWithoutFee(Number(reg.total_amount), platformFee, platformFeeType)` (e 0 quando total 0).
- **Comportamento correto:**
  - Para **paid** (e opcionalmente **convidado** para exibição):  
    - Se existir `platform_fee_amount` ou `registration_edit_fee_amount`:  
      exibir `total_amount - platform_fee_amount - registration_edit_fee_amount`.
    - Senão:  
      exibir `calculateValueWithoutFee(total_amount, platformFee, platformFeeType)`.
  - Para **convidado**: exibir R$ 0,00 (cortesia) ou manter valor líquido apenas informativo, conforme regra de produto (recomendação: R$ 0,00 para não confundir com valor a receber).
  - Para **pending/failed**: exibir o valor que seria pago (total_amount ou valor calculado), sem alterar lógica de “receita”.

Assim a coluna “Valor” fica alinhada ao que o backend considera valor líquido do organizador.

---

### 2.7 Ticket médio (card “Receita Total”)

- **Comportamento atual:** `totalRevenue / paidCount` com ambos incluindo convidado.
- **Comportamento correto:**  
  `totalRevenue / paidCount` onde **totalRevenue** e **paidCount** consideram **apenas** inscrições **paid** e o mesmo valor líquido usado no backend.

---

### 2.8 Dados da API não utilizados

- **API `getRegistrations`** (backend usa `r.*` e joins): já retorna `platform_fee_amount`, `registration_edit_fee_amount` e `kit_name` (ek.name).
- **Frontend:** O tipo `Registration` já tem `platform_fee_amount` e `registration_edit_fee_amount`; o mapeamento em `EventDetailedReport` não repassa esses campos nem `kit_name` para o estado/local dos cálculos.
- **Correção:** Incluir no mapeamento e na interface/local de cálculo:
  - `platform_fee_amount`
  - `registration_edit_fee_amount`
  - `kit_name` (e usar em Receita por Kit e na tabela, se for exibir nome do kit).

---

## 3. Correção por etapas

As etapas devem ser feitas **na ordem**, para que cada uma use o que foi implementado na anterior. Ao concluir uma etapa, marque como **OK Etapa N** e valide antes de seguir.

**Visão geral:**

| Etapa | Nome | Depende de |
|-------|------|------------|
| 1 | Dados da API e tipo | — |
| 2 | Função getValorLiquido | Etapa 1 |
| 3 | Receita só "paid" + valor líquido (cards e totais) | Etapas 1 e 2 |
| 4 | Receita por Kit com nome real | Etapas 1–3 |
| 5 | Coluna Valor na tabela "Todas as Inscrições" | Etapas 1 e 2 |
| 6 | Validação final | Etapas 1–5 |

---

### Etapa 1 – Dados da API e tipo (base para as demais)

**Objetivo:** Garantir que o componente receba e use `platform_fee_amount`, `registration_edit_fee_amount` e `kit_name` da API.

**O que fazer:**

1. Em `EventDetailedReport.tsx`, na interface `RegistrationDetail` (ou equivalente), adicionar:
   - `platform_fee_amount?: number`
   - `registration_edit_fee_amount?: number`
   - `kit_name?: string | null`
2. No mapeamento de `regsResponse.data` (dentro de `loadEventDetails`), preencher:
   - `platform_fee_amount: reg.platform_fee_amount`
   - `registration_edit_fee_amount: reg.registration_edit_fee_amount`
   - `kit_name: reg.kit_name`
   - `event_kits: reg.kit_name ? { name: reg.kit_name } : null` (para manter compatibilidade onde se usa `event_kits?.name`)

**Arquivo:** `src/components/organizer/EventDetailedReport.tsx` (interface + bloco do `map` em `loadEventDetails`).

**Critério de aceite:**

- [ ] Tipo/interface inclui os três campos.
- [ ] Mapeamento preenche os três campos a partir de `reg`.
- [ ] Nenhum erro de TypeScript; relatório continua carregando.

---

### Etapa 2 – Função auxiliar de valor líquido

**Objetivo:** Centralizar o cálculo de valor líquido (igual ao backend) em uma única função reutilizável.

**O que fazer:**

1. Criar no componente a função:
   - `getValorLiquido(reg: RegistrationDetail, platformFee: number, platformFeeType: 'fixed' | 'percentage'): number`
   - Retorno: se `(reg.platform_fee_amount ?? 0) + (reg.registration_edit_fee_amount ?? 0) > 0` → `total_amount - platform_fee_amount - registration_edit_fee_amount` (arredondado 2 casas); senão → `calculateValueWithoutFee(reg.total_amount, platformFee, platformFeeType)`.
2. **Ainda não** trocar os cálculos existentes; só deixar a função disponível para as próximas etapas.

**Arquivo:** `src/components/organizer/EventDetailedReport.tsx` (função no corpo do componente, antes do `return`).

**Critério de aceite:**

- [ ] Função implementada e tipada.
- [ ] Com um `reg` com `platform_fee_amount` preenchido, o retorno é `total_amount - platform_fee_amount - registration_edit_fee_amount`.
- [ ] Com `platform_fee_amount` e `registration_edit_fee_amount` zerados/null, o retorno é igual a `calculateValueWithoutFee(...)`.

---

### Etapa 3 – Receita só com “paid” e valor líquido (cards e totais)

**Objetivo:** Receita Total, contagem de “pagas”, ticket médio, PIX e Cartão alinhados ao backend (apenas **paid**, valor líquido).

**O que fazer:**

1. No bloco que percorre `regs` para calcular totais (em `loadEventDetails`):
   - Trocar o critério de “entra na receita” de `isPaidOrConvidado` para `reg.payment_status === 'paid'`.
   - Trocar `calculateValueWithoutFee(regAmount, ...)` por `getValorLiquido(reg, currentPlatformFee, currentPlatformFeeType)` em todas as somas de valor (totalRevenue, pixTotal, creditCardTotal, categoryMap, kitMap).
2. No mesmo bloco, garantir que **paid** (contagem de “pagas”) seja só `payment_status === 'paid'` (já feito se você só somar receita quando `payment_status === 'paid'`; a variável `paid` deve contar apenas essas).
3. Ajustar o card “Total de Inscrições”: texto “X pagas” deve refletir apenas inscrições **paid** (a variável `paidCount` já deve vir desse novo critério).
4. Na seção de modalidades (cálculo de `modalityStatsMap`), usar o mesmo critério: só `payment_status === 'paid'` e `getValorLiquido(reg, ...)` para a receita por modalidade.

**Arquivos:** `src/components/organizer/EventDetailedReport.tsx` (um único bloco de cálculo em `loadEventDetails` + bloco de modalidades).

**Critério de aceite:**

- [ ] Receita Total não inclui valor de inscrições com `convidado`.
- [ ] “X pagas” no card = quantidade de inscrições com `payment_status === 'paid'`.
- [ ] Ticket médio = Receita Total / X pagas (e X pagas sem convidado).
- [ ] Receita PIX e Receita Cartão usam `getValorLiquido` e só **paid**.
- [ ] Receita por Categoria e por Kit usam **paid** e `getValorLiquido`.
- [ ] Receita por Modalidade usa **paid** e `getValorLiquido`.

---

### Etapa 4 – Receita por Kit com nome real (kit_name)

**Objetivo:** Agrupar e exibir receita por kit usando o nome retornado pela API.

**O que fazer:**

1. No agrupamento de kit (dentro do mesmo loop de `regs`), usar como chave:
   - `reg.kit_name || reg.event_kits?.name || (reg.kit_id ? 'Kit' : null)`.
   - Só incluir no `kitMap` quando houver kit (ex.: `reg.kit_id` ou `reg.kit_name`); não somar inscrições sem kit na “Receita por Kit”.
2. Garantir que o card “Inscrições com Kit” e a tabela “Receita por Kit” usem esse mesmo agrupamento (já usa `kitMap`/`kitRevenues`; só garantir que a chave seja o nome real).
3. Na tabela “Todas as Inscrições”, na coluna Kit, exibir `reg.kit_name || reg.event_kits?.name || (reg.kit_id ? 'Kit' : '-')`.

**Arquivo:** `src/components/organizer/EventDetailedReport.tsx` (agrupamento kit + célula Kit na tabela de inscrições).

**Critério de aceite:**

- [ ] Kits aparecem com o nome retornado pela API (ex.: “Kit Premium”), não todos como “Kit”.
- [ ] Receita por Kit e “Inscrições com Kit” continuam só com **paid** e valor líquido (já garantido na Etapa 3).

---

### Etapa 5 – Tabela “Todas as Inscrições” – coluna Valor

**Objetivo:** Coluna Valor da tabela alinhada ao valor líquido do organizador; convidado com R$ 0,00.

**O que fazer:**

1. Na célula da coluna “Valor” (por registro):
   - Se `reg.payment_status === 'convidado'`: exibir `formatCurrency(0)` (R$ 0,00).
   - Se `reg.payment_status === 'paid'` ou outro (ex.: pending): exibir `formatCurrency(getValorLiquido(reg, platformFee, platformFeeType))`.
   - Tratar `total_amount` 0 ou inexistente para não quebrar (ex.: 0).
2. Remover o uso direto de `calculateValueWithoutFee(Number(reg.total_amount), ...)` nessa coluna.

**Arquivo:** `src/components/organizer/EventDetailedReport.tsx` (TableBody da tabela “Todas as Inscrições”, célula do Valor).

**Critério de aceite:**

- [ ] Inscrições **paid** mostram valor líquido (igual ao usado no backend).
- [ ] Inscrições **convidado** mostram R$ 0,00.
- [ ] Pendentes/falhas mostram valor esperado (líquido ou total conforme regra de produto).

---

### Etapa 6 – Validação final

**Objetivo:** Garantir que o relatório bate com o backend para o mesmo evento.

**O que fazer:**

1. Escolher um evento que tenha:
   - Inscrições com `payment_status === 'paid'` (com e, se possível, sem `platform_fee_amount` preenchido),
   - Pelo menos uma inscrição `payment_status === 'convidado'`.
2. No backend (Painel Financeiro do organizador ou endpoint que use `getOrganizerFinancialOverview` / receita por evento), anotar a **Receita Total** do evento.
3. No Relatório Detalhado do mesmo evento, conferir:
   - Receita Total = mesmo valor do backend.
   - Ticket médio = Receita Total / número de inscrições **paid**.
4. Opcional: para uma inscrição **paid** com `platform_fee_amount` preenchido, conferir que o valor na coluna “Valor” = `total_amount - platform_fee_amount - registration_edit_fee_amount`.

**Critério de aceite:**

- [ ] Receita Total do relatório = Receita Total do Painel Financeiro (ou serviço equivalente) para o mesmo evento.
- [ ] Nenhum valor de convidado entrando na receita.
- [ ] Coluna Valor da tabela consistente com valor líquido para **paid**.

*Validação Etapa 6:* Executar os 4 passos acima em homologação/produção; marcar os critérios de aceite quando conferido. O Painel Financeiro do organizador usa `getOrganizerFinancialOverview` (por organizador) e a lista de eventos usa receita por evento do backend — o Relatório Detalhado deve bater com a receita do **mesmo evento** nessa lista.

---

## 4. Resumo das etapas e checklist

| Etapa | Foco | Checklist rápido |
|-------|------|-------------------|
| **1** | Dados da API e tipo | `platform_fee_amount`, `registration_edit_fee_amount`, `kit_name` mapeados |
| **2** | Função valor líquido | `getValorLiquido(reg, fee, type)` implementada |
| **3** | Só “paid” + valor líquido em todos os totais | Receita, PIX, Cartão, Categoria, Kit, Modalidades e “X pagas” corretos |
| **4** | Nome real do kit | Receita por Kit e coluna Kit com `kit_name` |
| **5** | Coluna Valor na tabela | Valor líquido por linha; convidado R$ 0,00 |
| **6** | Validação | Relatório = Painel Financeiro para o mesmo evento |

- [x] **OK Etapa 1** – Dados e tipo
- [x] **OK Etapa 2** – Função getValorLiquido
- [x] **OK Etapa 3** – Receita só paid + valor líquido (cards e totais)
- [x] **OK Etapa 4** – Receita por Kit com nome real
- [x] **OK Etapa 5** – Tabela “Todas as Inscrições” – coluna Valor
- [x] **OK Etapa 6** – Validação final

---

## 5. Referências no código

| Onde | Arquivo / trecho |
|------|-------------------|
| Relatório Detalhado | `src/components/organizer/EventDetailedReport.tsx` |
| Cálculo receita organizador (backend) | `backend/src/services/organizerService.ts` (getOrganizerFinancialOverview, getOrganizerEventRevenues) – valor líquido com `platform_fee_amount` e `registration_edit_fee_amount` |
| Revenue por evento (backend) | `backend/src/services/eventsService.ts` – subquery com `revenue` e `platform_fee_revenue` |
| Convidado excluído da receita | `backend/src/controllers/registrationsController.ts` (comentário “exclude from revenue calculation”) |
| Listagem de inscrições (API) | `backend/src/services/registrationsService.ts` – `getRegistrations` com `r.*` e `ek.name as kit_name` |
| Tipo Registration (frontend) | `src/lib/api/registrations.ts` – `platform_fee_amount`, `registration_edit_fee_amount` |
| Cálculo sem taxa (fallback) | `src/lib/utils/feeCalculations.ts` – `calculateValueWithoutFee` |
| Plano de taxas | `docs/PLANO_TAXAS_ORGANIZADOR_ADMIN.md` (Etapas 1–4) |

---

*Documento gerado a partir da investigação do Relatório Detalhado para alinhar valores ao pagamento do organizador e às taxas da plataforma (admin).*
