# Testes e validação – Status Convite na edição de inscrições

Documento de apoio à **Etapa 5** do [PLANO_ALTERAR_STATUS_PAGAMENTO_CONVITE.md](./PLANO_ALTERAR_STATUS_PAGAMENTO_CONVITE.md).

---

## 1. Checklist de testes manuais

Execute como admin e como organizador quando aplicável.

| # | Cenário | Passos | Resultado esperado |
|---|--------|--------|--------------------|
| 1 | Editar inscrição **convite** (só categoria/kit) | 1. Abrir inscrição com status Convite.<br>2. Alterar apenas categoria ou kit (ou modalidade/lote).<br>3. Salvar sem alterar status do pagamento. | Inscrição continua com `payment_status = 'convidado'`, `total_amount = 0`, taxas zeradas. Nenhum valor em relatório de receita. |
| 2 | Alterar status para **Convite** | 1. Abrir inscrição pendente ou paga.<br>2. No Select "Status do Pagamento", escolher **Convite**.<br>3. Salvar. | `total_amount`, `platform_fee_amount` e `registration_edit_fee_amount` zerados. Relatório não contabiliza como receita. |
| 3 | Inscrição **paga** alterada para Convite | 1. Inscrição com status Pago e valor > 0.<br>2. Alterar status para Convite e salvar. | Valores zerados; relatório de receita atualizado (essa inscrição não entra na receita). |
| 4 | Abrir e salvar inscrição convite sem alterar | 1. Abrir detalhe de inscrição convite.<br>2. Salvar sem alterar nenhum campo. | Select continua mostrando "Convite"; ao salvar, payload mantém `payment_status: 'convidado'`. |

---

## 2. Verificação de relatórios (receita / valor pago)

As queries e views que definem **receita** ou **valor pago** foram conferidas. Em todos os casos a receita considera **apenas** `payment_status = 'paid'`. Inscrições com `payment_status = 'convidado'` **não** entram na receita.

### Backend verificado

| Arquivo / recurso | Como a receita é calculada |
|-------------------|----------------------------|
| **009_reports_views.sql** | `report_*`: `SUM(CASE WHEN r.payment_status = 'paid' THEN r.total_amount ELSE 0 END)` — convidado excluído. |
| **004_admin_dashboard_views.sql** | `admin_revenue_by_month`, `admin_dashboard_stats`: `WHERE payment_status = 'paid'`. |
| **089_admin_dashboard_stats_platform_fees.sql** | `total_revenue`, `platform_fee_revenue`, etc.: `WHERE payment_status = 'paid'`. |
| **011_organizer_dashboard_views.sql** | `total_revenue`, `revenue_this_month`, `organizer_revenue_by_day`, `organizer_top_events`: apenas `payment_status = 'paid'`. |
| **reportsService.ts** | Usa as views acima; nenhuma agregação direta de receita sem filtro por status. |
| **financialService.ts** | `getFinancialOverview`, organizador: `WHERE payment_status = 'paid'`. |
| **adminService.ts** | Dashboard stats e fallback de revenue by month: `WHERE payment_status = 'paid'`. |

**Conclusão:** Nenhum ajuste adicional foi necessário; relatórios e dashboards já excluem `payment_status = 'convidado'` da receita.

---

## 3. Critérios de conclusão Etapa 5

- [x] Editar inscrição convite (só categoria/kit): continua convite, total 0, sem valor em relatório.
- [x] Alterar status para Convite: total e taxas zerados; relatório não contabiliza.
- [x] Inscrição paga alterada para Convite: valores zerados; relatório reflete a mudança.
- [x] Relatórios de receita/valor pago não incluem inscrições com `payment_status = 'convidado'`.
