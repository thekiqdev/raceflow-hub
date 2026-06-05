# AUDIT_FINANCIAL_PDF_VALIDATION

**Data da auditoria:** 2026-06-05T22:52:38.116Z

## STATUS GERAL

| Métrica | Status |
|---------|--------|
| json_vs_pdf | **WARNING** |
| avg_ticket | **OK** |
| payment_methods | **WARNING** |
| encoding_pdf | **ERROR** |
| financial_recalc | **OK** |
| overall | **ERROR** |

---

## Evento: Evento teste 2026

- **event_id:** `8d88b8f3-453e-44c5-b6c9-6264bbad58e9`
- **overall:** ERROR

### Seções

- json_vs_pdf: **WARNING**
- avg_ticket: **OK**
- payment_methods: **WARNING**
- encoding_pdf: **ERROR**
- financial_recalc: **OK**

### Ticket médio

| Campo | Valor |
|-------|-------|
| paid_registrations (executive) | 5 |
| paid_registrations (receita > 0) | 1 |
| net_revenue | R$ 51.00 |
| avg_ticket (JSON) | R$ 51.00 |
| avg_ticket (recalculado) | R$ 51.00 |
| **Status** | **OK** |
| Nota | paid_registrations (executive) inclui pagas com receita líquida zero (convites/cortesia/transfer shell); ticket usa apenas pagas com liquid > 0 |

### payment_method banco (raw) × DTO (normalizado)

| payment_method (banco) | count | receita |
|------------------------|-------|---------|
| free_bonus | 2 | R$ 0.00 |
| credit_card | 1 | R$ 0.00 |
| admin_transfer | 3 | R$ 51.00 |

| payment_method (DTO norm) | count | receita |
|---------------------------|-------|---------|
| other | 1 | R$ 51.00 |

| payment_method (DTO report) | count | receita |
|-----------------------------|-------|---------|
| other | 1 | R$ 51.00 |

**Status métodos de pagamento:** WARNING

### JSON × PDF (admin — tabela completa)

| Campo | JSON | PDF | Igual? | Status |
|-------|------|-----|--------|--------|
| cover.event_title | Evento teste 2026 | Evento teste 2026 | Sim | OK |
| cover.city | português do Brasil | português do Brasil | Sim | OK |
| cover.state | SP | SP | Sim | OK |
| cover.organizer_name | Organizador Teste | Organizador Teste | Sim | OK |
| cover.status | published | published | Sim | OK |
| cover.net_revenue (capa) | 51 | R$ 51,00 | Sim | OK |
| executive.total_registrations | 6 | 6 | Sim | OK |
| executive.paid_registrations | 5 | 5 | Sim | OK |
| executive.invitation_registrations | 1 | 1 | Sim | OK |
| executive.courtesy_registrations | 1 | 1 | Sim | OK |
| executive.transferred_registrations | 3 | 3 | Sim | OK |
| executive.net_revenue | 51 | R$ 51,00 | Sim | OK |
| executive.avg_ticket | 51 | R$ 51,00 | Sim | OK |
| financial.net_revenue | 51 | R$ 51,00 | Sim | OK |
| financial.avg_ticket | 51 | R$ 51,00 | Sim | OK |
| financial.gross_revenue | 57 | R$ 57,00 | Sim | OK |
| financial.platform_fee_total | 6 | R$ 6,00 | Sim | OK |
| financial.edit_fee_total | 0 | R$ 0,00 | Sim | OK |
| financial.platform_revenue | 6 | R$ 6,00 | Sim | OK |
| payment.other.count | 1 | 1 | Sim | OK |
| payment.other.net_amount | 51 | R$ 51,00 | Sim | OK |
| payment.other.share_pct | 100.0% | 100.0% | Sim | OK |
| category.Geral.registrations | 1 | 1 | Sim | OK |
| category.Geral.net_revenue | 51 | R$ 51,00 | Sim | OK |
| modality.5k.registrations | 1 | 1 | Sim | OK |
| modality.5k.net_revenue | 51 | R$ 51,00 | Sim | OK |
| kit.teste 22222.registrations | 1 | 1 | Sim | OK |
| kit.teste 22222.net_revenue | 51 | R$ 51,00 | Sim | OK |
| stock.products_count | 2 | 2 | Sim | OK |
| stock.variations_count | 5 | 5 | Sim | OK |
| stock.exhausted_count | 1 | 1 | Sim | OK |
| stock.critical_count | 3 | 3 | Sim | OK |
| stock.low_stock_count | 1 | 1 | Sim | OK |
| invitations.granted | 0 | 0 | Sim | OK |
| invitations.available | 0 | 0 | Sim | OK |
| invitations.sent | 0 | 0 | Sim | OK |
| invitations.used | 0 | 0 | Sim | OK |
| invitations.expired | 1 | 1 | Sim | OK |
| audit.status | VALIDADO | VALIDADO | Sim | OK |
| audit.expected_net_revenue | 51 | R$ 51,00 | Sim | OK |
| audit.difference_payment_methods | 0 | (valor R$ 0,00 — rótulo Δ possivelmente corrompido) | Não | WARNING |

### JSON × PDF (admin — divergências)

| Campo | JSON | PDF | Status |
|-------|------|-----|--------|
| audit.difference_payment_methods | 0 | (valor R$ 0,00 — rótulo Δ possivelmente corrompido) | WARNING |

### JSON × PDF (organizer — divergências)

| Campo | JSON | PDF | Status |
|-------|------|-----|--------|
| audit.difference_payment_methods | 0 | (valor R$ 0,00 — rótulo Δ possivelmente corrompido) | WARNING |

### Encoding / caracteres corrompidos

| audience | snippet | reason |
|----------|---------|--------|
| admin | `Estoque crítico ("d5)3` | símbolo ≤ corrompido em WinAnsi/Helvetica |
| admin | `9B6FVv÷iasR$ 0,00
9` | rótulo Δ (delta) corrompido — bytes binários no lugar do caractere Unicode |
| organizer | `Estoque crítico ("d5)3` | símbolo ≤ corrompido em WinAnsi/Helvetica |
| organizer | `9B6FVv÷iasR$ 0,00
9` | rótulo Δ (delta) corrompido — bytes binários no lugar do caractere Unicode |

### Fontes PDF

- **admin:** Helvetica (default pdfkit)
- **organizer:** Helvetica (default pdfkit)

### Recálculo financeiro independente

| Métrica | DTO | Recalc | Status |
|---------|-----|--------|--------|
| net_revenue | R$ 51.00 | R$ 51.00 | OK |
| gross_revenue | R$ 57.00 | R$ 57.00 | OK |
| platform_fee_total | R$ 6.00 | R$ 6.00 | OK |
| edit_fee_total | R$ 0.00 | R$ 0.00 | OK |
| platform_revenue | R$ 6.00 | R$ 6.00 | OK |

---

## Evento: TESTE CORRIDA

- **event_id:** `977568dc-4557-4dc1-a505-9a251c46f5bd`
- **overall:** ERROR

### Seções

- json_vs_pdf: **WARNING**
- avg_ticket: **OK**
- payment_methods: **WARNING**
- encoding_pdf: **ERROR**
- financial_recalc: **OK**

### Ticket médio

| Campo | Valor |
|-------|-------|
| paid_registrations (executive) | 5 |
| paid_registrations (receita > 0) | 1 |
| net_revenue | R$ 150.00 |
| avg_ticket (JSON) | R$ 150.00 |
| avg_ticket (recalculado) | R$ 150.00 |
| **Status** | **OK** |
| Nota | paid_registrations (executive) inclui pagas com receita líquida zero (convites/cortesia/transfer shell); ticket usa apenas pagas com liquid > 0 |

### payment_method banco (raw) × DTO (normalizado)

| payment_method (banco) | count | receita |
|------------------------|-------|---------|
| pix | 2 | R$ 0.00 |
| admin_transfer | 4 | R$ 150.00 |

| payment_method (DTO norm) | count | receita |
|---------------------------|-------|---------|
| other | 1 | R$ 150.00 |

| payment_method (DTO report) | count | receita |
|-----------------------------|-------|---------|
| other | 1 | R$ 150.00 |

**Status métodos de pagamento:** WARNING

### JSON × PDF (admin — tabela completa)

| Campo | JSON | PDF | Igual? | Status |
|-------|------|-----|--------|--------|
| cover.event_title | TESTE CORRIDA | TESTE CORRIDA | Sim | OK |
| cover.city | São Paulo - Praia Grande | São Paulo - Praia Grande | Sim | OK |
| cover.state | SP | SP | Sim | OK |
| cover.organizer_name | Administrador Teste | Administrador Teste | Sim | OK |
| cover.status | published | published | Sim | OK |
| cover.net_revenue (capa) | 150 | R$ 150,00 | Sim | OK |
| executive.total_registrations | 6 | 6 | Sim | OK |
| executive.paid_registrations | 5 | 5 | Sim | OK |
| executive.invitation_registrations | 0 | 0 | Sim | OK |
| executive.courtesy_registrations | 0 | 0 | Sim | OK |
| executive.transferred_registrations | 4 | 4 | Sim | OK |
| executive.net_revenue | 150 | R$ 150,00 | Sim | OK |
| executive.avg_ticket | 150 | R$ 150,00 | Sim | OK |
| financial.net_revenue | 150 | R$ 150,00 | Sim | OK |
| financial.avg_ticket | 150 | R$ 150,00 | Sim | OK |
| financial.gross_revenue | 168 | R$ 168,00 | Sim | OK |
| financial.platform_fee_total | 8 | R$ 8,00 | Sim | OK |
| financial.edit_fee_total | 10 | R$ 10,00 | Sim | OK |
| financial.platform_revenue | 18 | R$ 18,00 | Sim | OK |
| payment.other.count | 1 | 1 | Sim | OK |
| payment.other.net_amount | 150 | R$ 150,00 | Sim | OK |
| payment.other.share_pct | 100.0% | 100.0% | Sim | OK |
| category.Geral 2 .registrations | 1 | 1 | Sim | OK |
| category.Geral 2 .net_revenue | 150 | R$ 150,00 | Sim | OK |
| modality.5K.registrations | 1 | 1 | Sim | OK |
| modality.5K.net_revenue | 150 | R$ 150,00 | Sim | OK |
| kit.Básico.registrations | 1 | 1 | Sim | OK |
| kit.Básico.net_revenue | 150 | R$ 150,00 | Sim | OK |
| stock.products_count | 2 | 2 | Sim | OK |
| stock.variations_count | 6 | 6 | Sim | OK |
| stock.exhausted_count | 1 | 1 | Sim | OK |
| stock.critical_count | 2 | 2 | Sim | OK |
| stock.low_stock_count | 0 | 0 | Sim | OK |
| invitations.granted | 0 | 0 | Sim | OK |
| invitations.available | 0 | 0 | Sim | OK |
| invitations.sent | 0 | 0 | Sim | OK |
| invitations.used | 0 | 0 | Sim | OK |
| invitations.expired | 0 | 0 | Sim | OK |
| audit.status | VALIDADO | VALIDADO | Sim | OK |
| audit.expected_net_revenue | 150 | R$ 150,00 | Sim | OK |
| audit.difference_payment_methods | 0 | (valor R$ 0,00 — rótulo Δ possivelmente corrompido) | Não | WARNING |

### JSON × PDF (admin — divergências)

| Campo | JSON | PDF | Status |
|-------|------|-----|--------|
| audit.difference_payment_methods | 0 | (valor R$ 0,00 — rótulo Δ possivelmente corrompido) | WARNING |

### JSON × PDF (organizer — divergências)

| Campo | JSON | PDF | Status |
|-------|------|-----|--------|
| audit.difference_payment_methods | 0 | (valor R$ 0,00 — rótulo Δ possivelmente corrompido) | WARNING |

### Encoding / caracteres corrompidos

| audience | snippet | reason |
|----------|---------|--------|
| admin | `Estoque crítico ("d5)2` | símbolo ≤ corrompido em WinAnsi/Helvetica |
| admin | `9B6FVv÷iasR$ 0,00
9` | rótulo Δ (delta) corrompido — bytes binários no lugar do caractere Unicode |
| organizer | `Estoque crítico ("d5)2` | símbolo ≤ corrompido em WinAnsi/Helvetica |
| organizer | `9B6FVv÷iasR$ 0,00
9` | rótulo Δ (delta) corrompido — bytes binários no lugar do caractere Unicode |

### Fontes PDF

- **admin:** Helvetica (default pdfkit)
- **organizer:** Helvetica (default pdfkit)

### Recálculo financeiro independente

| Métrica | DTO | Recalc | Status |
|---------|-----|--------|--------|
| net_revenue | R$ 150.00 | R$ 150.00 | OK |
| gross_revenue | R$ 168.00 | R$ 168.00 | OK |
| platform_fee_total | R$ 8.00 | R$ 8.00 | OK |
| edit_fee_total | R$ 10.00 | R$ 10.00 | OK |
| platform_revenue | R$ 18.00 | R$ 18.00 | OK |

---

## Evento: teste campo personalizado

- **event_id:** `b897fdbc-4bf1-4210-bd51-10c611a291dc`
- **overall:** ERROR

### Seções

- json_vs_pdf: **WARNING**
- avg_ticket: **OK**
- payment_methods: **OK**
- encoding_pdf: **ERROR**
- financial_recalc: **OK**

### Ticket médio

| Campo | Valor |
|-------|-------|
| paid_registrations (executive) | 0 |
| paid_registrations (receita > 0) | 0 |
| net_revenue | R$ 0.00 |
| avg_ticket (JSON) | R$ 0.00 |
| avg_ticket (recalculado) | R$ 0.00 |
| **Status** | **OK** |
| Nota | paid_registrations coincide com contagem de receita positiva |

### payment_method banco (raw) × DTO (normalizado)

| payment_method (banco) | count | receita |
|------------------------|-------|---------|

| payment_method (DTO norm) | count | receita |
|---------------------------|-------|---------|

| payment_method (DTO report) | count | receita |
|-----------------------------|-------|---------|

**Status métodos de pagamento:** OK

### JSON × PDF (admin — tabela completa)

| Campo | JSON | PDF | Igual? | Status |
|-------|------|-----|--------|--------|
| cover.event_title | teste campo personalizado | teste campo personalizado | Sim | OK |
| cover.city | português do Brasil | português do Brasil | Sim | OK |
| cover.state | SP | SP | Sim | OK |
| cover.organizer_name | Administrador Teste | Administrador Teste | Sim | OK |
| cover.status | published | published | Sim | OK |
| cover.net_revenue (capa) | 0 | R$ 0,00 | Sim | OK |
| executive.total_registrations | 0 | 0 | Sim | OK |
| executive.paid_registrations | 0 | 0 | Sim | OK |
| executive.invitation_registrations | 0 | 0 | Sim | OK |
| executive.courtesy_registrations | 0 | 0 | Sim | OK |
| executive.transferred_registrations | 0 | 0 | Sim | OK |
| executive.net_revenue | 0 | R$ 0,00 | Sim | OK |
| executive.avg_ticket | 0 | R$ 0,00 | Sim | OK |
| financial.net_revenue | 0 | R$ 0,00 | Sim | OK |
| financial.avg_ticket | 0 | R$ 0,00 | Sim | OK |
| financial.gross_revenue | 0 | R$ 0,00 | Sim | OK |
| financial.platform_fee_total | 0 | R$ 0,00 | Sim | OK |
| financial.edit_fee_total | 0 | R$ 0,00 | Sim | OK |
| financial.platform_revenue | 0 | R$ 0,00 | Sim | OK |
| stock.products_count | 0 | 0 | Sim | OK |
| stock.variations_count | 0 | 0 | Sim | OK |
| stock.exhausted_count | 0 | 0 | Sim | OK |
| stock.critical_count | 0 | 0 | Sim | OK |
| stock.low_stock_count | 0 | 0 | Sim | OK |
| invitations.granted | 0 | 0 | Sim | OK |
| invitations.available | 0 | 0 | Sim | OK |
| invitations.sent | 0 | 0 | Sim | OK |
| invitations.used | 0 | 0 | Sim | OK |
| invitations.expired | 0 | 0 | Sim | OK |
| audit.status | VALIDADO | VALIDADO | Sim | OK |
| audit.expected_net_revenue | 0 | R$ 0,00 | Sim | OK |
| audit.difference_payment_methods | 0 | (valor R$ 0,00 — rótulo Δ possivelmente corrompido) | Não | WARNING |

### JSON × PDF (admin — divergências)

| Campo | JSON | PDF | Status |
|-------|------|-----|--------|
| audit.difference_payment_methods | 0 | (valor R$ 0,00 — rótulo Δ possivelmente corrompido) | WARNING |

### JSON × PDF (organizer — divergências)

| Campo | JSON | PDF | Status |
|-------|------|-----|--------|
| audit.difference_payment_methods | 0 | (valor R$ 0,00 — rótulo Δ possivelmente corrompido) | WARNING |

### Encoding / caracteres corrompidos

| audience | snippet | reason |
|----------|---------|--------|
| admin | `Estoque crítico ("d5)0` | símbolo ≤ corrompido em WinAnsi/Helvetica |
| admin | `9B6FVv÷iasR$ 0,00
9` | rótulo Δ (delta) corrompido — bytes binários no lugar do caractere Unicode |
| organizer | `Estoque crítico ("d5)0` | símbolo ≤ corrompido em WinAnsi/Helvetica |
| organizer | `9B6FVv÷iasR$ 0,00
9` | rótulo Δ (delta) corrompido — bytes binários no lugar do caractere Unicode |

### Fontes PDF

- **admin:** Helvetica (default pdfkit)
- **organizer:** Helvetica (default pdfkit)

### Recálculo financeiro independente

| Métrica | DTO | Recalc | Status |
|---------|-----|--------|--------|
| net_revenue | R$ 0.00 | R$ 0.00 | OK |
| gross_revenue | R$ 0.00 | R$ 0.00 | OK |
| platform_fee_total | R$ 0.00 | R$ 0.00 | OK |
| edit_fee_total | R$ 0.00 | R$ 0.00 | OK |
| platform_revenue | R$ 0.00 | R$ 0.00 | OK |

---

## Classificação final de risco

**STATUS GERAL:** ERROR

| Dimensão | Status | Impacto |
|----------|--------|---------|
| Valores financeiros JSON = PDF | WARNING | Valores monetários idênticos; apenas rótulos Δ ilegíveis |
| Ticket médio | OK | Fórmula correta (net / pagas com receita > 0) |
| Métodos de pagamento | WARNING | admin_transfer agrupado em "Outros" por design |
| Encoding PDF | ERROR | ≤ e Δ corrompidos — risco para documento oficial |
| Recálculo financeiro | OK | DTO alinhado a financialReportingService |

**Veredicto:** PDF apto para valores financeiros; **não apto** para uso oficial sem correção de encoding nos rótulos de estoque e auditoria.

## Métodos agrupados em "Outros"

`normalizePaymentMethod()` aceita apenas `pix`, `credit_card`, `boleto`. Demais valores (`admin_transfer`, `free_bonus`, `null`, etc.) caem em `other`. Inscrições com receita zero (convites/cortesia) são excluídas do breakdown.

## Correções recomendadas

### Prioridade ALTA

- Substituir caractere `≤` no rótulo de estoque crítico por `<=` ou `≤` via fonte Unicode (ex.: NotoSans) — evita corrupção visual observada.
- Validar símbolo `Δ` nos rótulos de auditoria com fonte compatível UTF-8.

### Prioridade MÉDIA

- Documentar que `paid_registrations` no resumo executivo ≠ denominador do ticket médio (exclui pagas com receita líquida zero).
- Listar explicitamente métodos agrupados em `other` (`admin_transfer`, etc.) no anexo do relatório admin.

### Prioridade BAIXA

- Embutir metadados JSON (hash completo) no PDF para verificação programática.
- Testes automatizados de regressão JSON×PDF por evento fixture.