# Issue Técnica — Correção de divergência em relatórios financeiros/estatísticos de evento

## 1) Objetivo

Corrigir divergência de valores nos relatórios de evento causada por dedução indevida de taxa da plataforma em alguns fluxos.

Problema observado: inscrição criada por super admin deveria aparecer como **R$ 50,00**, mas foi exibida como **R$ 46,30**.

A correção deve **eliminar dupla dedução de taxa** e manter consistência entre telas, sem quebrar produção.

---

## 2) Regra canônica oficial

### Definições

- `valor_bruto_inscricao`  
  Valor total da inscrição persistido em `registrations.total_amount`.

- `taxa_plataforma_total`  
  Soma das taxas registradas na própria inscrição:  
  `COALESCE(platform_fee_amount, 0) + COALESCE(registration_edit_fee_amount, 0)`.

- `valor_liquido_inscricao`  
  Valor reportável da inscrição após remoção das taxas persistidas:  
  `valor_bruto_inscricao - taxa_plataforma_total`.

- `receita_reportavel`  
  Soma de `valor_liquido_inscricao` **apenas para inscrições com `payment_status = 'paid'`**.

### Mapeamento por bloco

- **Todas as Inscrições**: usar `valor_liquido_inscricao` por linha; `convidado/free_bonus` exibe `R$ 0,00`.
- **Receita Total**: usar `receita_reportavel`.
- **Receita líquida**: usar `receita_reportavel` (mesmo conceito, nomenclatura consistente).
- **Ticket médio**: `receita_reportavel / quantidade_de_inscricoes_paid`.
- **Receita por categoria**: soma de `valor_liquido_inscricao` para `paid`, agrupado por categoria.
- **Receita por kit/modalidade**: soma de `valor_liquido_inscricao` para `paid`, agrupada por kit/modalidade.
- **Faturamento em `EventManagement`**: usar `receita_reportavel` agregada por evento (mesma base dos demais relatórios).
- **Summary / event revenues em `OrganizerReports`**: usar `receita_reportavel` (mesma regra canônica).

---

## 3) Regra de fallback legado

Fallback histórico só é permitido quando os campos financeiros necessários estiverem ausentes em registro legado.

### Quando fallback é permitido

- Somente se **ambos** os campos abaixo estiverem `NULL` no registro:
  - `platform_fee_amount`
  - `registration_edit_fee_amount`

### Quando fallback é proibido

- Se qualquer um dos campos de taxa estiver preenchido (inclusive `0`), **não** aplicar fallback.
- Proibido fallback amplo por tela/card.
- Proibido recalcular taxa global para inscrições modernas com taxa já persistida.

### Decisão sugerida para ambiguidade

Para manter compatibilidade, tratar `NULL` como “legado sem informação”; tratar `0` como valor válido já persistido.

---

## 4) Etapa 1 — Backend

## Escopo

Padronizar cálculo de valor reportável no backend e reutilizar em agregações.

### Arquivos-alvo

- `backend/src/services/eventsService.ts`
- `backend/src/services/organizerService.ts`
- **novo helper** (sugerido): `backend/src/services/financialReportingService.ts`  
  (ou `backend/src/utils/financialReporting.ts`, manter simples)

### Helper a criar/extrair (mínimo)

Criar utilitário canônico com:

- `getPlatformFeeTotal(reg): number`
- `getLiquidRegistrationValue(reg): number`
- `isLegacyWithoutFeeFields(reg): boolean`
- `getReportableRevenue(registrations): number` (apenas `paid`)

Comportamento:

1. Se `platform_fee_amount` e `registration_edit_fee_amount` não são `NULL`, usar sempre regra canônica (`total - taxas`).
2. Se ambos `NULL`, aplicar fallback legado (já existente no projeto), de forma localizada e explícita.

### Métodos que devem migrar para regra canônica

- Em `eventsService.ts`:
  - agregados de `revenue`
  - `avg_ticket`
  - `platform_fee_revenue` (sem dupla inferência indevida)

- Em `organizerService.ts`:
  - `getOrganizerFinancialSummary`
  - `getOrganizerEventRevenues`

### Padronização de retornos/campos

Padronizar campos usados pelos frontends (mantendo backward compatibility):

- manter `revenue`, `avg_ticket`, `platform_fee_revenue`
- garantir que sejam derivados da mesma regra canônica
- evitar cálculo divergente por endpoint

---

## 5) Etapa 2 — Frontend

## Escopo

Remover cálculo duplicado/local que possa reprocessar taxa e privilegiar valores canônicos do backend.

### Arquivos-alvo

- `src/components/organizer/EventDetailedReport.tsx`
- `src/components/organizer/OrganizerReports.tsx`
- `src/components/admin/EventManagement.tsx`

### Ajustes esperados

- `EventDetailedReport.tsx`:
  - remover lógica de dedução duplicada quando houver campo financeiro suficiente;
  - usar regra canônica de forma consistente entre tabela e cards;
  - manter `free_bonus/convidado` como `R$ 0,00`.

- `OrganizerReports.tsx`:
  - priorizar números já consolidados do backend para summary/event revenues;
  - evitar recalcular líquido no frontend.

- `EventManagement.tsx`:
  - validar exibição de faturamento/ticket contra agregados canônicos retornados por backend.

### Decisão sugerida para ambiguidade

Quando existir valor agregado oficial no payload da API, frontend deve **exibir** (não recalcular).

---

## 6) Critérios de aceite

- Inscrição super admin sem taxa: **mostra R$ 50,00** (não R$ 46,30).
- `free_bonus` / `convidado`: permanece `R$ 0,00` e não entra em receita reportável.
- Mesma inscrição apresenta o mesmo valor em:
  - relatório detalhado,
  - organizer reports,
  - event management.
- Nenhum card/tabela executa dupla dedução de taxa.
- `revenue` e `avg_ticket` entre endpoints permanecem consistentes entre si.

---

## 7) Checklist de QA manual

- [ ] Caso pago normal com taxa (registro moderno com campos de taxa preenchidos).
- [ ] Caso super admin sem taxa (total já líquido, sem dedução extra).
- [ ] Caso `free_bonus/convidado` (valor zero e fora de receita).
- [ ] Evento com registros antigos que exigem fallback legado (`platform_fee_amount` e `registration_edit_fee_amount` nulos).
- [ ] Comparação antes/depois em pelo menos 3 eventos reais:
  - [ ] evento com inscrições normais
  - [ ] evento com inscrições super admin
  - [ ] evento com mistura de casos legados
- [ ] Conferir alinhamento entre:
  - [ ] `EventDetailedReport`
  - [ ] `OrganizerReports`
  - [ ] `EventManagement`

---

## Notas de execução

- Não implementar tudo de uma vez.
- Executar por etapas (backend primeiro, frontend depois).
- Evitar refatoração ampla; extração mínima e segura.
- Priorizar compatibilidade com produção.
