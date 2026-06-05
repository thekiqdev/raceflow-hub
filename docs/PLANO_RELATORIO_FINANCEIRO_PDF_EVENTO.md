# PLANO — Relatório Financeiro Oficial do Evento (PDF)

**Data:** 2026-06-03  
**Fase atual:** ETAPA 1 — Investigação (auditoria + mapeamento)  
**Escopo desta entrega:** documentação apenas. **Nenhum código de produção alterado.**

---

## 1. Objetivo do produto

Gerar um **documento PDF dedicado** (A4 retrato, layout profissional) como prestação de contas oficial do evento, com duas variantes:

| Variante | Público | Exibe receita líquida | Exibe taxas / receita plataforma |
|----------|---------|----------------------|----------------------------------|
| **Organizador** | Dono do evento | Sim | **Não** |
| **Admin** | Super admin | Sim (+ bruta) | **Sim** (completo) |

**Restrições explícitas:** não reutilizar print de tela; não gerar PDF a partir do HTML de `EventDetailedReport.tsx`; toda regra monetária deve usar **`financialReportingService.ts`**.

---

## 2. Regra financeira canônica (fonte obrigatória)

**Arquivo:** `backend/src/services/financialReportingService.ts`

| Função | Uso no relatório |
|--------|------------------|
| `getLiquidRegistrationValue(reg, fallback)` | Valor líquido por inscrição |
| `getReportableRevenue(regs, fallback)` | Receita líquida total (`payment_status = 'paid'`, exclui casca transferida) |
| `getPlatformFeeTotal(reg)` | Taxa plataforma + taxa edição (bloco **admin**) |
| `isLegacyWithoutFeeFields(reg)` | Decide fallback legado |
| `isTransferredOutShellRegistration(reg)` | Exclui casca de split admin |

**Fallback legado:** `getSystemSettings()` → `platform_fee`, `platform_fee_type`, `platform_fee_min` (mesmo padrão de `eventsService.ts` e `organizerService.ts`).

**Documentação de referência:** `docs/issues/issue-correcao-relatorios-financeiros-evento.md`

### Derivações admin (sem nova regra — composição das existentes)

Para cada inscrição `paid`:

```
valor_bruto     = total_amount
taxas_totais    = getPlatformFeeTotal(reg)   // platform_fee_amount + registration_edit_fee_amount
valor_liquido   = getLiquidRegistrationValue(reg, fallback)
receita_plataforma (agregada) = soma taxas_totais (ou bruto - líquido em legado)
```

**Proibido:** recalcular taxa com `calculateValueWithoutFee` no frontend; usar views SQL legadas (`report_revenue_by_event`); usar `financialService.getFinancialOverview()` (não é canônico por evento).

---

## 3. Estado atual — o que já existe

### 3.1 Tela alvo do botão

**Componente:** `src/components/organizer/EventDetailedReport.tsx`  
**Acesso:** Admin (`EventManagement`) e Organizador (`OrganizerReports` / gestão de eventos)  
**Comportamento hoje:** dashboard interativo; **agrega financeiro no cliente** a partir de `getRegistrations({ event_id })` + `getCanonicalRegistrationDisplayValue` (espelho frontend em `src/lib/utils/feeCalculations.ts`).

### 3.2 Endpoints por evento (já existentes)

| Endpoint | Service | Dados úteis ao PDF |
|----------|---------|-------------------|
| `GET /api/admin\|organizer/reports/events/:eventId/general-stats` | `eventGeneralStatsService` | Contagens inscrições, PIX/cartão, convidado, free_bonus, transferidas, canceladas |
| `GET /api/admin\|organizer/reports/events/:eventId/invitation-stats` | `eventInvitationStatsService` | Convites: concedidos, disponíveis, enviados, usados, expirados |
| `GET /api/admin\|organizer/reports/events/:eventId/product-stock` | `eventProductStockReportService` | Estoque por variação + summary KPIs |
| `GET /api/admin\|organizer/reports/leaders-invitations-granted/:eventId` | `leadersInvitationsReportService` | Convites por líder (detalhe opcional) |
| `GET /api/events/:id` | `eventsService.getEventById` | Capa: título, data, cidade, status, organizador |
| `GET /api/registrations?event_id=` | `registrationsService` | Lista completa — **fonte atual do financeiro na UI** |
| `GET /api/events/:eventId/modalities` | `modalitiesService` | Nomes de modalidades |
| `GET /api/events/:eventId/product-selection-stats` | `registrationProductSelectionsController` | Atributos/variantes (não obrigatório no PDF base) |

### 3.3 Serviços com regra canônica (por organizador / lista de eventos)

| Service | Função | Escopo |
|---------|--------|--------|
| `eventsService.ts` | Agregação `revenue`, `avg_ticket`, `platform_fee_revenue` na listagem | Multi-evento |
| `organizerService.ts` | `getOrganizerFinancialSummary`, `getOrganizerEventRevenues` | Por organizador |
| `financialReportingService.ts` | Helpers puros | **Fonte única de verdade** |

**Gap crítico:** não existe serviço/endpoint que devolva **um pacote financeiro consolidado por `eventId`**.

### 3.4 PDF no projeto hoje

| Local | Tecnologia | Uso |
|-------|------------|-----|
| `RegistrationFlow.tsx`, `LeaderDashboard.tsx` | **jsPDF** (frontend) | Comprovante de inscrição / ingresso |
| Backend | **Nenhuma lib PDF** (`pdfkit` não instalado) | — |
| `PLANO_IMPLEMENTACAO_ADMIN_DASHBOARD.md` | Menciona `pdfGenerator.ts` | Nunca implementado |

**Conclusão:** relatório oficial deve ser **gerador dedicado** (recomendado backend na Sprint PDF; não reutilizar layout do comprovante).

---

## 4. Mapeamento seção a seção do PDF

Legenda: ✅ disponível · ⚠️ parcial · ❌ ausente / precisa agregar

### 4.1 CAPA

| Campo | Fonte | Status |
|-------|-------|--------|
| Nome do evento | `getEventById.title` | ✅ |
| Data de geração | `new Date()` no serviço | ✅ (runtime) |
| Organizador | `getEventById.organizer_name` / `organizer_organization_name` | ✅ |
| Cidade | `getEventById.city`, `state` | ✅ |
| Status do evento | `getEventById.status` | ✅ |

---

### 4.2 RESUMO EXECUTIVO

| Campo | Fonte atual | Status | Observação |
|-------|-------------|--------|------------|
| Total de inscrições | `general-stats.total_registrations` | ✅ | Inclui canceladas |
| Inscrições pagas | `general-stats.paid_registrations` | ✅ | |
| Inscrições por convite | `general-stats.from_invitation_count` | ✅ | Via `leader_invitations` |
| Inscrições cortesia | `general-stats.free_bonus_admin_count` + `invited_count`? | ⚠️ | Definir nomenclatura: cortesia admin vs convidado |
| Inscrições transferidas | `general-stats.transferred_registrations` | ✅ | |
| Ticket médio | Calculado na UI | ⚠️ | Precisa `getReportableRevenue / paid_count` no backend |
| Receita total (líquida org.) | Calculado na UI | ⚠️ | Mesma agregação canônica — **não exposta por API** |

---

### 4.3 PAGAMENTOS (quantidade + valor arrecadado)

| Método | Contagem | Valor líquido |
|--------|----------|---------------|
| PIX | `general-stats.pix_count` ✅ | ❌ agregar com `getLiquidRegistrationValue` |
| Cartão | `general-stats.card_count` ✅ | ❌ idem |
| Boleto | ❌ count em general-stats | ⚠️ `organizerService` já soma boleto; general-stats **não** |
| Outros | ❌ | ❌ agrupar `payment_method NOT IN (pix, credit_card, boleto)` ou NULL |

**Referência parcial:** loop em `EventDetailedReport` (PIX + cartão apenas, client-side).

---

### 4.4 INSCRIÇÕES (status)

| Status | Fonte | Status |
|--------|-------|--------|
| Pagas | `paid_registrations` | ✅ |
| Pendentes | — | ❌ `COUNT FILTER (payment_status = 'pending')` |
| Canceladas | `cancelled_registrations` | ✅ |
| Reembolsadas | — | ❌ `payment_status = 'refunded'` não está em general-stats |
| Convidado | `invited_count` | ✅ |
| Transferidas | `transferred_registrations` | ✅ |

---

### 4.5 CATEGORIAS / MODALIDADES / KITS

| Tabela | Dados | Status |
|--------|-------|--------|
| Categoria · inscritos · receita · % | Agregado client-side em `EventDetailedReport` | ⚠️ Lógica existe, **não no backend** |
| Modalidade · inscritos · receita · % | Filtro por `modality_id` + canonical value | ⚠️ idem |
| Kit · quantidade · receita · % | Agrupa por `kit_name` / `kit_id` | ⚠️ idem |

**Participação %:** derivável (`count / total_paid * 100`) — trivial após agregação.

**Componente relacionado:** `EventKitPerformanceSection.tsx` — enriquece kits com estoque/badges; receita já vem de `kitRevenues` pré-calculado na tela.

---

### 4.6 ESTOQUE

| Indicador | Fonte | Status |
|-----------|-------|--------|
| Produtos | `product-stock.summary.products_count` | ✅ |
| Variações | `variations.length` | ✅ |
| Esgotadas | `summary.exhausted_variations_count` | ✅ |
| Críticas / baixo estoque | Filtros frontend (`matchesCriticalStock`, `matchesLowOperationalStock`) | ⚠️ Replicar regras do `EventDetailedReport` ou expor no summary |

**Service:** `eventProductStockReportService.ts` — **reutilizar sem alterar regra de estoque**.

---

### 4.7 CONVITES

| Campo | Fonte | Status |
|-------|-------|--------|
| Concedidos | `invitation-stats.total_invitations` | ✅ |
| Disponíveis | `available_invitations` | ✅ |
| Enviados | `sent_invitations` | ✅ |
| Usados | `used_invitations` | ✅ |
| Expirados | `expired_invitations` | ✅ |

**Atenção:** `revenue_from_invitations` em `eventInvitationStatsService` usa **`SUM(total_amount)` bruto**, **não** `getReportableRevenue`. **Não usar** esse campo no bloco financeiro canônico do PDF (ok para contexto convites se rotulado como bruto).

---

### 4.8 FINANCEIRO — VERSÃO ORGANIZADOR

| Campo | Status | Implementação prevista |
|-------|--------|------------------------|
| Receita líquida | ⚠️ | `getReportableRevenue(regs, fallback)` |
| Ticket médio | ⚠️ | `receita_liquida / paid_count` |
| Métodos de pagamento (valores) | ❌ | Loop paid + `getLiquidRegistrationValue` por `payment_method` |
| Distribuição financeira | ⚠️ | % por método sobre receita líquida |

**Ocultar:** `platform_fee_amount`, `registration_edit_fee_amount`, receita plataforma, bruto (bloco `financial` omitido no DTO quando o backend detecta organizador — ver Seção 6).

---

### 4.9 FINANCEIRO — VERSÃO ADMIN

| Campo | Status | Implementação prevista |
|-------|--------|------------------------|
| Receita bruta | ❌ | `SUM(total_amount)` paid, excl. casca transferida |
| Receita líquida | ⚠️ | `getReportableRevenue` |
| Taxas plataforma | ❌ | `SUM(platform_fee_amount)` paid |
| Taxas edição | ❌ | `SUM(registration_edit_fee_amount)` paid |
| Receita plataforma | ⚠️ | Padrão `eventsService` (soma `getPlatformFeeTotal` ou bruto−líquido legado) |
| Diferença bruto × líquido | ❌ | `bruta - liquida` |

**Referência de implementação:** bloco `platform_fee_revenue` em `eventsService.ts` (linhas ~421–431).

---

### 4.10 RODAPÉ

| Campo | Status |
|-------|--------|
| Nome evento | ✅ |
| Data geração | ✅ |
| Versão relatório | ❌ constante semver ex. `financial-report-v1` |
| Hash interno | ❌ ex. SHA-256 de `eventId + computed_at + rules_version + payload_hash` |
| Página X / Y | ❌ responsabilidade do gerador PDF |

**Branding institucional:** `getPublicBranding` / `systemSettings` (logo, nome plataforma) — investigar na Sprint PDF.

---

## 5. Campos disponíveis vs ausentes (consolidado)

### ✅ Disponíveis sem novo SQL significativo

- Metadados do evento e organizador (`getEventById`)
- Contagens gerais (`getEventGeneralStats`)
- Estatísticas de convites (`getEventInvitationStats`)
- Relatório de estoque (`getEventProductStockReport`)
- Lista de inscrições com campos financeiros (`registrations`: `total_amount`, `platform_fee_amount`, `registration_edit_fee_amount`, `payment_method`, `payment_status`, `status`, `category_id`, `kit_id`, `modality_id`, `transferred_to_registration_id`)
- Helpers canônicos (`financialReportingService`)

### ❌ Ausentes (precisam do novo serviço `eventFinancialReportService`)

1. **DTO único** `EventFinancialReportData` por evento  
2. Agregação **server-side** de receita por categoria / modalidade / kit com `%`  
3. Valores líquidos por método de pagamento (PIX, cartão, boleto, outros)  
4. Contagens `pending`, `refunded`, `boleto_count`  
5. Bloco financeiro admin (bruto, taxas separadas, receita plataforma)  
6. Metadados do relatório (`generated_at`, `rules_version`, `report_version`, `integrity_hash`, `export_formats`)  
7. **`financial_snapshot`** (contagens congeladas no momento da geração)  
8. Endpoint dedicado (ainda não existe)  
9. Gerador PDF dedicado (ainda não existe)  
10. Botão "Gerar Relatório Financeiro" na UI  

### ⚠️ Riscos de inconsistência se reutilizar código atual

| Risco | Detalhe | Mitigação |
|-------|---------|-----------|
| Dupla lógica financeira | UI usa `getCanonicalRegistrationDisplayValue` (frontend) | Novo service importa **somente** `financialReportingService` |
| Views SQL legadas | `report_revenue_by_event` usa `total_amount` | **Não usar** no relatório oficial |
| Convites revenue | Bruto em invitation-stats | Excluir ou rotular; financeiro vem de registrations |
| general-stats incompleto | Sem pending/refunded/boleto | Estender query no novo service (não obrigatório alterar general-stats existente) |

---

## 6. Proposta de DTO canônico (ETAPA 2 — design)

### 6.1 Decisões de design (ajustes aprovados)

#### Ajuste 1 — Rota única, sem `?audience=`

**Não** usar query string `audience=organizer|admin`.

```
GET /api/admin/reports/events/:eventId/financial-report
GET /api/organizer/reports/events/:eventId/financial-report
```

Mesmo path relativo em admin e organizer; **mesmo controller/service**. O backend decide a variante do payload:

```typescript
// eventFinancialReportController (futuro)
const isAdmin = await hasRole(req.user.id, 'admin');
const dto = await buildEventFinancialReport(eventId, { isAdmin });
// isAdmin === true  → financial: AdminFinancialBlock (campos completos)
// isAdmin === false → financial: OrganizerFinancialBlock (sem taxas plataforma)
```

| Benefício | Detalhe |
|-----------|---------|
| Sem manipulação de querystring | Organizador não pode pedir visão admin |
| Permissão no servidor | `audience` é **derivado**, nunca enviado pelo cliente |
| Fonte única | JSON, PDF e UI consomem o **mesmo** endpoint/serviço |
| Uma rota lógica | Prefixo `/admin` vs `/organizer` só para auth existente |

`meta.audience` permanece no **response** (read-only, preenchido pelo servidor) para auditoria e rodapé do PDF — não é parâmetro de entrada.

#### Ajuste 2 — `financial_snapshot`

Bloco imutável no instante `generated_at`. Evita recalcular contagens em PDF, dashboard, Excel e auditorias comparativas.

```typescript
financial_snapshot: {
  registrations_total: number;  // todas as linhas do evento
  paid_total: number;
  pending_total: number;
  refunded_total: number;
  invited_total: number;        // payment_status = 'convidado'
  transferred_total: number;    // status = 'transferred' (incl. casca)
}
```

**Relação com `registration_status`:** o snapshot é o **registro oficial congelado**; `registration_status` pode espelhar os mesmos números na Sprint 1 (DRY no service — uma passagem, dois campos). Futuras exportações leem só o snapshot.

#### Ajuste 3 — `meta.export_formats`

Extensibilidade sem mudar o DTO principal:

```typescript
export_formats: ('json' | 'pdf' | 'excel' | 'csv')[];
// Sprint 1–3: ['json', 'pdf']
// Futuro: adicionar 'excel', 'csv' nos mesmos endpoints de export
```

O gerador PDF (e futuros Excel/CSV) **reutiliza** `EventFinancialReportData` inteiro; `export_formats` documenta o que o servidor oferece naquele `report_version`.

---

### 6.2 Tipos TypeScript

```typescript
// backend/src/services/eventFinancialReportService.ts (futuro)

export type FinancialReportAudience = 'organizer' | 'admin'; // só no response
export type FinancialReportExportFormat = 'json' | 'pdf' | 'excel' | 'csv';

export interface EventFinancialReportMeta {
  event_id: string;
  generated_at: string;           // ISO
  report_version: string;         // ex. '1.0.0'
  rules_version: string;          // ex. 'financialReportingService@canonical'
  audience: FinancialReportAudience; // derivado do role — nunca do client
  integrity_hash: string;         // SHA-256 do payload canônico
  export_formats: FinancialReportExportFormat[]; // ex. ['json', 'pdf']
}

export interface EventFinancialReportSnapshot {
  registrations_total: number;
  paid_total: number;
  pending_total: number;
  refunded_total: number;
  invited_total: number;
  transferred_total: number;
}

export interface EventFinancialReportCover {
  event_title: string;
  event_date: string;
  city: string;
  state: string;
  status: string;
  organizer_name: string;
  organizer_organization_name?: string | null;
}

export interface EventFinancialReportExecutiveSummary {
  total_registrations: number;
  paid_registrations: number;
  invitation_registrations: number;
  courtesy_registrations: number;   // definir: free_bonus_admin + convidado?
  transferred_registrations: number;
  net_revenue: number;              // getReportableRevenue
  avg_ticket: number;
}

export interface PaymentMethodBreakdownRow {
  method: string;                   // pix | credit_card | boleto | other
  count: number;
  net_amount: number;               // soma getLiquidRegistrationValue
  share_pct: number;                // sobre net_revenue
}

export interface RegistrationStatusBreakdown {
  paid: number;
  pending: number;
  cancelled: number;
  refunded: number;
  convidado: number;
  transferred: number;
}

export interface DimensionRevenueRow {
  id: string;
  name: string;
  registrations: number;
  net_revenue: number;
  share_pct: number;
}

export interface EventFinancialReportStockSummary {
  products_count: number;
  variations_count: number;
  exhausted_count: number;
  critical_count: number;
  low_stock_count: number;
}

export interface EventFinancialReportInvitations {
  granted: number;
  available: number;
  sent: number;
  used: number;
  expired: number;
}

export interface OrganizerFinancialBlock {
  net_revenue: number;
  avg_ticket: number;
  payment_methods: PaymentMethodBreakdownRow[];
}

export interface AdminFinancialBlock extends OrganizerFinancialBlock {
  gross_revenue: number;
  platform_fee_total: number;
  edit_fee_total: number;
  platform_revenue: number;
  gross_net_delta: number;
}

export interface EventFinancialReportData {
  meta: EventFinancialReportMeta;
  cover: EventFinancialReportCover;
  financial_snapshot: EventFinancialReportSnapshot;
  executive_summary: EventFinancialReportExecutiveSummary;
  registration_status: RegistrationStatusBreakdown;
  payment_methods: PaymentMethodBreakdownRow[];
  categories: DimensionRevenueRow[];
  modalities: DimensionRevenueRow[];
  kits: DimensionRevenueRow[];
  stock: EventFinancialReportStockSummary;
  invitations: EventFinancialReportInvitations;
  financial: OrganizerFinancialBlock | AdminFinancialBlock;
}
```

**Endpoint proposto (ETAPA 3):**

```
GET /api/admin/reports/events/:eventId/financial-report
GET /api/organizer/reports/events/:eventId/financial-report
```

- Resposta: `EventFinancialReportData` (JSON) — **sem query params**  
- Autorização: mesma de `getEventGeneralStatsController` (admin ou `organizer_id` do evento)  
- Variante admin vs organizador: **`hasRole(user, 'admin')`** no controller — organizador **nunca** recebe `AdminFinancialBlock`, independente da URL prefix  
- PDF (Sprint 3): `GET .../financial-report/pdf` — mesmo auth, consome o **mesmo** `buildEventFinancialReport` internamente

---

## 7. Arquitetura recomendada

```
┌─────────────────────────────────────────────────────────────┐
│ EventDetailedReport.tsx                                      │
│   [Gerar Relatório Financeiro] ──► download PDF              │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         ▼                                      ▼
GET .../financial-report              GET .../financial-report/pdf
(JSON — fonte única)                  (mesmo service → PDF)
         │                                      │
         └──────────────────┬───────────────────┘
                            ▼
              eventFinancialReportService.build(...)
                ├─ hasRole → Admin vs Organizer DTO
                ├─ financial_snapshot (congelado)
                ├─ meta.export_formats
                ├─ query registrations (1x)
                ├─ financialReportingService *
                ├─ getEventInvitationStats (reuse)
                └─ getEventProductStockReport (reuse)
                            │
                            ▼
              eventFinancialReportPdfService (Sprint 3)
                └─ pdfkit — layout A4, lê EventFinancialReportData
```

**Princípio:** uma única query de inscrições + composição em memória; estoque e convites via services existentes (read-only). **PDF, UI e exportações futuras (Excel/CSV) leem o mesmo DTO** — não recalcular contagens fora do service.

---

## 8. Estimativa de impacto

| Área | Arquivos novos (est.) | Arquivos alterados (est.) | Risco |
|------|----------------------|---------------------------|-------|
| Service + DTO | `eventFinancialReportService.ts`, types | — | Baixo |
| Controller + routes | handler em `reportsController.ts` | `adminRoutes.ts`, `organizerRoutes.ts` | Baixo |
| API client | `src/lib/api/reports.ts` | — | Baixo |
| PDF backend | `eventFinancialReportPdfService.ts`, templates | `backend/package.json` (+pdfkit) | Médio |
| Frontend botão | — | `EventDetailedReport.tsx` | Baixo |
| Testes | unitários financialReporting + snapshot DTO | — | Médio |

**Esforço total estimado:** 4–5 sprints (abaixo).  
**Linhas novas (ordem de grandeza):** ~800–1200 backend, ~150 frontend, ~400 PDF layout.

**Sem impacto:** estoque (`eventProductStockReportService`), dashboard global, `syncEventKits`, check-in, inscrições existentes, webhooks Asaas.

---

## 9. Plano de implementação por sprint

### Sprint 1 — DTO + endpoint JSON

- Criar `eventFinancialReportService.buildEventFinancialReport(eventId, { isAdmin })`
- **`financial_snapshot`** preenchido na mesma passagem das inscrições
- `meta.export_formats: ['json']` (PDF entra na Sprint 3)
- Importar **exclusivamente** `financialReportingService` para valores
- Agregar categorias / modalidades / kits / pagamentos
- Controller único: `hasRole` → `OrganizerFinancialBlock` vs `AdminFinancialBlock`
- Rotas **sem query params:** `/admin/.../financial-report` e `/organizer/.../financial-report`
- Tipos em `src/lib/api/reports.ts` (incl. snapshot + export_formats)
- Testes: organizador nunca recebe campos admin; admin recebe bloco completo
- **Entregável:** JSON validado; snapshot + meta completos

### Sprint 2 — Hardening admin + integridade

- `AdminFinancialBlock` completo (bruto, taxas, receita plataforma, delta)
- `integrity_hash`, `report_version`, `rules_version`
- Testes de regressão comparando com `eventsService` agregação por evento
- Documentar mapeamento cortesia vs convidado (produto)
- Garantir `financial_snapshot` === fonte para `registration_status` (consistência)

### Sprint 3 — Gerador PDF backend

- Instalar `pdfkit` (ou alternativa avaliada)
- `GET .../financial-report/pdf` — chama **internamente** `buildEventFinancialReport` (mesma fonte que JSON)
- Atualizar `meta.export_formats` para `['json', 'pdf']`
- Layout A4: capa, snapshot, seções, tabelas, quebra de página
- Omitir bloco admin no PDF quando `meta.audience === 'organizer'`
- Rodapé: paginação, hash, versão, `export_formats`

### Sprint 4 — Botão frontend + UX

- Botão "Gerar Relatório Financeiro" em `EventDetailedReport.tsx`
- Download PDF via `/financial-report/pdf` (sem lógica financeira no client)
- Opcional: preview via `GET .../financial-report` JSON (debug / futuro Excel)
- **Não** alterar dashboard existente além do botão

### Sprint 5 — QA, branding, exportações futuras

- Logo institucional (`getPublicBranding`)
- Validação cruzada com relatório detalhado (tolerância R$ 0,01)
- Eventos edge: zero inscrições, só convites, só legado sem taxas
- Documentação operacional para organizadores
- **Backlog:** Excel/CSV via mesmo DTO — adicionar `'excel' | 'csv'` em `export_formats` sem alterar shape principal

---

## 10. Decisões em aberto (produto)

1. **Cortesia:** incluir só `free_bonus_admin_count` ou também `invited_count` (convidado)?  
2. **PDF no backend vs frontend:** backend recomendado para documento oficial e hash; frontend jsPDF só se prazo apertar.  
3. **Convites — receita:** omitir valor ou mostrar bruto com rótulo explícito?  
4. **Seção estoque no PDF:** summary only ou tabela top-N variações críticas?  
5. **Idioma / moeda:** fixo BRL + pt-BR (assumido).

---

## 11. Critérios de aceite desta investigação

| Critério | Atendido |
|----------|----------|
| Fontes de dados listadas | ✅ Seções 3–4 |
| Serviços existentes mapeados | ✅ Seções 3.2–3.3 |
| Regras financeiras canônicas identificadas | ✅ Seção 2 |
| Campos disponíveis vs ausentes | ✅ Seção 5 |
| Estimativa de impacto | ✅ Seção 8 |
| Plano por sprint | ✅ Seção 9 |
| Sem alteração de código de produção | ✅ Apenas este documento |

---

## 12. Referências de código

```47:86:backend/src/services/financialReportingService.ts
export function getLiquidRegistrationValue(
  reg: FinancialRegistrationLike,
  fallback: LegacyFallbackConfig
): number { /* ... */ }

export function getReportableRevenue(
  registrations: FinancialRegistrationLike[],
  fallback: LegacyFallbackConfig
): number { /* ... */ }
```

```22:81:backend/src/services/eventGeneralStatsService.ts
export async function getEventGeneralStats(eventId: string): Promise<EventGeneralStats> {
  // COUNT(*) FILTER ... pix, card, convidado, transferidas, etc.
}
```

```726:774:src/components/organizer/EventDetailedReport.tsx
// Agregação financeira atual — CLIENT-SIDE (não reutilizar para PDF oficial)
regs?.forEach((reg) => {
  const valorLiquido = getCanonicalDisplayValue(reg, currentPlatformFee, currentPlatformFeeType);
  total += valorLiquido;
  // pix, cartão, categoria, kit...
});
```

```413:434:backend/src/services/eventsService.ts
// Padrão admin: revenue + platform_fee_revenue por evento (reutilizar lógica)
const revenue = getReportableRevenue(paidRows, fallback);
platform_fee_revenue += getPlatformFeeTotal(reg);
```

---

**Próximo passo recomendado:** confirmar decisões em aberto (Seção 10), depois iniciar **Sprint 1** (endpoint JSON único + `financial_snapshot` + `export_formats`).
