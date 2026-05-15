# Plano — Estatísticas de convites no relatório do evento (Admin / Super Admin)

**Status:** investigação e definição (sem implementação).  
**Data:** 2026-05-15  
**Escopo:** nova seção no relatório detalhado do evento; **não** altera regras de concessão, auditoria ou fluxo do corredor/organizador.

**Referências canônicas (obrigatórias na implementação):**

- `docs/DOMINIO_CONVITES_CONTRATO_CANONICO.md`
- `docs/RELATORIO_CONSOLIDADO_DOMINIO_CONVITES_FASE0_FASE2.md`
- `backend/src/services/invitationBonusCanonicalCore.ts`
- `backend/src/services/invitationBonusAuditService.ts` (classificação `valida` / `orfa` / `sem_convite_correspondente`)

---

## 1. Resumo executivo

| Pergunta | Resposta |
|----------|----------|
| Onde está a fonte de verdade dos convites? | Tabela **`leader_invitations`** (não inferir convite só por `registrations`). |
| Qual o lastro? | **`leader_invitations.bonus_registration_id = registrations.id`**. |
| O que já existe no relatório? | `EventDetailedReport.tsx` (admin e organizador): coluna **“Convites ganhos”** por líder, via endpoint read-only que conta `available \| sent \| used`. |
| Existe endpoint agregado de estatísticas de convites? | **Não.** Só `GET .../reports/leaders-invitations-granted/:eventId` (quebra por líder). |
| Implementar agora? | **Não** — este documento fecha investigação + modelo + SQL + plano. |

---

## 2. Etapa 1 — Investigação

### 2.1 Onde estão os dados

#### Tabela `leader_invitations` (fonte oficial)

Criada em `backend/migrations/044_create_leader_invitations.sql`. Colunas relevantes:

| Coluna | Papel |
|--------|--------|
| `id` | PK do convite |
| `leader_id` | Líder (`group_leaders`) |
| `event_id` | Evento |
| `commission_id` | Comissão que gerou o slot (opcional, migration 050) |
| `bonus_registration_id` | **Lastro** — FK única para `registrations.id` (`unique_bonus_registration`) |
| `runner_id` / `runner_cpf` | Destinatário após envio |
| `status` | `available`, `sent`, `used`, `expired` |
| `sent_at`, `used_at` | Timestamps ( `used_at` existe no schema; ver §2.2 ) |

Índices: `event_id`, `leader_id`, `status`, `commission_id`.

**Unicidade:** um convite por inscrição bônus (`unique_bonus_registration`). Migration `102_drop_uq_leader_invitation_unique.sql` removeu índice que limitava um único convite `available` por (evento, líder), permitindo **vários slots** por comissão/meta.

#### Tabela `registrations` (lastro, não fonte de contagem de convites)

- Inscrição **bônus** (slot): criada com `payment_method = 'free_bonus'`, inicialmente `runner_id` do líder.
- Ao **enviar** convite (`sendInvitationByCpf`): a mesma linha (`bonus_registration_id`) passa a `runner_id` do corredor, `payment_status = 'convidado'`, `status = 'confirmed'`.
- **Não** nasce uma segunda inscrição “de convite” — a inscrição do corredor **é** a inscrição lastreada.

Outros `free_bonus` **sem** linha em `leader_invitations` são **órfãos/lixo** ou **administrativos** (organizador), não convites válidos (`docs/DOMINIO_CONVITES_CONTRATO_CANONICO.md`, `freeBonusRegistrationSemantic.ts`).

#### Tabelas auxiliares (contexto, não base da seção)

| Tabela | Uso |
|--------|-----|
| `leader_event_commissions` | Meta (`required_purchases`, `bonus_type`), `bonus_registration_id` histórico |
| `registrations` + `coupons` | Vendas pagas com cupom do líder (geram meta) — já parcialmente no relatório como “vendas (pagas)” |
| `invitation_bonus_audit` (serviços) | Simulador/reconcile — **não** substituir leitura operacional simples |

---

### 2.2 Status em `leader_invitations`

Definição no CHECK da migration 044 + comentários:

| Status | Significado operacional (código atual) |
|--------|----------------------------------------|
| `available` | Slot concedido; ainda não enviado a um corredor. |
| `sent` | Líder enviou (CPF); `runner_id`/`runner_cpf` preenchidos; inscrição lastro em `convidado`. |
| `used` | Previsto no schema (`used_at`); **não há `UPDATE ... status = 'used'`** nos serviços principais pesquisados (`leaderInvitationsService`, `completeInvitationRegistration`). Pode existir em dados legados/manuais. UI do líder (`LeaderDashboard.tsx`) lista `used` se presente. |
| `expired` | Revogado (`leaderBonusService` — `UPDATE ... status = 'expired'`). **Não** entra em “convites concedidos válidos” para meta (`invitationBonusCanonicalCore`, auditoria). |

**Contagem canônica de “convites concedidos” (meta / relatório atual):**

```sql
status IN ('available', 'sent', 'used')
```

Alinhado a: `leadersInvitationsReportService.ts`, `invitationBonusCanonicalCore.ts`, `DOMINIO_CONVITES_CONTRATO_CANONICO.md` §5.

---

### 2.3 Como identificar cada conceito

| Conceito | Regra canônica (SQL) |
|----------|----------------------|
| **Convite válido (concedido)** | `leader_invitations` com `event_id = :eventId` e `status IN ('available','sent','used')` e existe `registrations r` com `r.id = li.bonus_registration_id`. |
| **Disponível** | `status = 'available'`. |
| **Enviado** | `status = 'sent'`. |
| **Usado (status DB)** | `status = 'used'`. |
| **Usado (produto sugerido)** | Opcional: `status = 'sent'` e lastro com `category_id IS NOT NULL` (corredor completou convite via `completeInvitationRegistration`) — **definir com negócio** se `used` no DB estiver vazio. |
| **Expirado** | `status = 'expired'` (fora do total “válido”). |
| **Inscrição vinda de convite** | `registrations.id` tal que `EXISTS (SELECT 1 FROM leader_invitations li WHERE li.bonus_registration_id = registrations.id AND li.event_id = :eventId)`. Tipicamente `payment_status = 'convidado'` após envio. **Não** usar `payment_method = 'free_bonus'` sozinho. |
| **Órfão `free_bonus`** | `registrations` com `payment_method = 'free_bonus'` e `event_id = :eventId` **sem** `leader_invitations.bonus_registration_id = id`. |
| **Inconsistente (auditoria)** | Reutilizar classificadores de `invitationBonusAuditService.buildCommissionBonusArtifacts`: convite sem registration, registration sem convite, duplicata, fora da comissão — ver §2.6. |

---

### 2.4 Inscrições vindas de convite (cruzamento)

Fluxo real (`leaderInvitationsService.sendInvitationByCpf`):

1. Convite `available` → `sent`.
2. `UPDATE registrations` no id `bonus_registration_id` (titular = corredor, `payment_status = 'convidado'`).
3. Corredor pode **completar** categoria/modalidade/kit: `POST /registrations/:id/complete-invitation` (`completeInvitationRegistration`) — **não** altera `leader_invitations.status`.

**Query canônica — inscrições “do convite” no evento:**

```sql
SELECT r.*
FROM registrations r
INNER JOIN leader_invitations li ON li.bonus_registration_id = r.id
WHERE li.event_id = $1;
```

Filtros adicionais comuns:

- Por status do convite: `li.status IN ('sent','used')` = “já encaminhado ao corredor”.
- Por completude: `r.category_id IS NOT NULL` = convite preenchido pelo corredor.

---

### 2.5 Receita “via convite” e `payment_status = 'paid'`

**Restrição do pedido:** receita **somente** com `payment_status = 'paid'`.

**Implicação importante:** inscrições lastro de convite, após envio, ficam em **`convidado`**, não `paid`. Portanto:

| Métrica | Interpretação | Valor típico |
|---------|---------------|--------------|
| Receita das inscrições lastro (`bonus_registration_id`) com `paid` | Soma `total_amount` (ou valor líquido do relatório) onde `r.payment_status = 'paid'` e vínculo `li` | **~0** na operação normal |
| Receita de **vendas** que geram meta de convite | Inscrições pagas com cupom do líder (`coupon_code` / `leader_id`) | Já calculada no relatório (“Vendas (pagas)” por líder) — base **`registrations`**, não `leader_invitations` |

**Recomendação para a nova seção (sem misturar domínios):**

1. **Bloco A — Convites (`leader_invitations`):** contagens por status, conversão, órfãos — **sem** receita de `convidado`.
2. **Bloco B — Receita associada (opcional, rótulo claro):** apenas `paid` em inscrições com lastro `li` **ou** subseparar “receita de vendas com cupom de líder” (já existente) com link textual, **sem** duplicar lógica no front.

**Receita líquida (alinhar a `EventDetailedReport`):** usar mesma regra `countsAsPaidForReport` + `getCanonicalDisplayValue` (taxas) **somente** onde `payment_status = 'paid'`.

```sql
-- Exemplo: receita "paid" em inscrições lastreadas a convite (evento)
SELECT COALESCE(SUM(r.total_amount), 0)  -- ou valor líquido via função/view do projeto
FROM leader_invitations li
JOIN registrations r ON r.id = li.bonus_registration_id
WHERE li.event_id = $1
  AND r.payment_status = 'paid'
  AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL);
```

**Diferença de pagamento parcial:** inscrições com `partially_paid` **não** entram se a regra for estrita `paid` apenas.

---

### 2.6 Endpoints e código existentes

| Artefato | Caminho | O que retorna |
|----------|---------|----------------|
| Service | `backend/src/services/leadersInvitationsReportService.ts` | `getLeadersInvitationsGrantedByEvent(eventId)` — `invitations_granted` por líder (`available\|sent\|used`) |
| Controller | `backend/src/controllers/leadersInvitationsReportController.ts` | JSON `{ success, data: LeadersInvitationsGrantedRow[] }` |
| Rotas | `GET /api/admin/reports/leaders-invitations-granted/:eventId` (`adminRoutes.ts`) | Admin |
| Rotas | `GET /api/organizer/reports/leaders-invitations-granted/:eventId` (`organizerRoutes.ts`) | Organizador |
| Front API | `src/lib/api/reports.ts` — `getLeadersInvitationsGrantedByEvent`, `getOrganizerLeadersInvitationsGrantedByEvent` | Tipos `LeadersInvitationsGrantedRow` |
| UI | `src/components/organizer/EventDetailedReport.tsx` (~304–325, ~664–701) | Mapa `leaderInvitationsGranted[leader_id]` na tabela de líderes |
| Admin | `src/components/admin/EventManagement.tsx` | Reutiliza o **mesmo** `EventDetailedReport` |

**Não existe hoje:**

- `getEventInvitationStats(eventId)` agregado.
- Distribuição por status no evento.
- `conversion_rate`, `orphan_free_bonus_count`, `inconsistent_invitations` no relatório.
- Endpoint de auditoria exposto ao relatório simples (simulador é outro fluxo).

**Tipos `Event` / `UpdateEventData`:** não incluem estatísticas de convite (só configuração de evento). Estatísticas serão **DTO de relatório** novo.

---

### 2.7 Carregamento ao abrir o relatório

`EventDetailedReport.loadEventDetails` (paralelo):

1. `getEventById`, `getRegistrations`, modalidades, etc.
2. Se `isAdmin || isOrganizer`: `getLeadersInvitationsGrantedByEvent` / variante organizer.
3. Monta `leaderCouponSales` **no frontend** a partir de `registrations` (cupom + líder).

Ao abrir o modal de estatísticas admin, **não** há hoje chamada que agregue convites além do count por líder.

---

## 3. Etapa 2 — Modelo de dados proposto (API → frontend)

```typescript
/** Estatísticas agregadas de convites do evento — leitura only, base leader_invitations. */
export interface EventInvitationStats {
  event_id: string;

  // Contagens canônicas (status IN available|sent|used para "total válido")
  total_invitations: number;
  available_invitations: number;
  sent_invitations: number;
  used_invitations: number;
  expired_invitations: number;

  /** sent / (sent + available)? — ver §3.1 */
  conversion_rate: number | null;

  // Receita / inscrições pagas (lastro convite, payment_status = 'paid' estrito)
  revenue_from_invitations: number;
  paid_registrations_from_invitations: number;

  // Integridade (read-only, alinhado auditoria)
  valid_invitations: number;
  orphan_free_bonus_count: number;
  inconsistent_invitations: number;

  /** Opcional: breakdown por líder (evita segundo request) */
  by_leader?: Array<{
    leader_id: string;
    leader_name: string | null;
    total: number;
    available: number;
    sent: number;
    used: number;
    expired: number;
  }>;

  /** Metadados para UI */
  computed_at: string;
  rules_version: string; // ex.: "canonical-v1"
}
```

### 3.1 `conversion_rate` (definir antes de implementar)

Opções:

| Opção | Fórmula | Comentário |
|-------|---------|------------|
| A (envio) | `sent / (available + sent + used)` | Mede quantos slots já foram enviados |
| B (status used) | `used / (sent + used)` | Depende de `used` no DB — pode ser ~0 hoje |
| C (completude) | convites `sent` com `category_id` preenchida / `sent` | Reflete corredor que completou convite |

**Sugestão:** expor **A** como `conversion_rate` e, se necessário, `completion_rate` (C) em campo separado para não conflitar com auditoria.

---

## 4. Etapa 3 — Regras canônicas (checklist implementação)

| # | Regra |
|---|--------|
| 1 | Base **sempre** `leader_invitations` filtrado por `event_id`. |
| 2 | Convite concedido válido: `status IN ('available','sent','used')`. |
| 3 | **Não** contar convites inferidos só por `registrations.free_bonus`. |
| 4 | **Não** tratar `free_bonus` sem `leader_invitations.bonus_registration_id` como convite (`orphan_free_bonus_count`). |
| 5 | Receita na métrica `revenue_from_invitations`: **apenas** `payment_status = 'paid'` no lastro; excluir casca `transferred` com `transferred_to_registration_id` (alinhar relatório financeiro). |
| 6 | **Não** alterar `leaderBonusService`, concessão, reconcile, missing delivery. |
| 7 | Endpoint **read-only** (GET); sem side effects (não chamar `checkAndGrantInvitationBonus` na leitura). |
| 8 | Reutilizar classificação de inconsistência da auditoria **ou** subconjunto documentado (convite sem registration / registration free_bonus sem convite). |
| 9 | `expired` visível em breakdown mas **fora** de `total_invitations` se `total` = só válidos — documentar no UI. |

---

## 5. SQL sugerido (agregado por evento)

### 5.1 Distribuição por status

```sql
SELECT
  li.status,
  COUNT(*)::int AS cnt
FROM leader_invitations li
WHERE li.event_id = $1::uuid
GROUP BY li.status;
```

Derivar no service:

- `available_invitations` = cnt onde status = `available`
- `sent_invitations` = `sent`
- `used_invitations` = `used`
- `expired_invitations` = `expired`
- `total_invitations` = soma de `available + sent + used` (**excluir expired**)

### 5.2 Convites válidos (com lastro existente)

```sql
SELECT COUNT(*)::int
FROM leader_invitations li
INNER JOIN registrations r ON r.id = li.bonus_registration_id
WHERE li.event_id = $1::uuid
  AND li.status IN ('available', 'sent', 'used');
```

`valid_invitations` = resultado (deve coincidir com `total_invitations` se FK íntegra).

### 5.3 Convites inconsistentes (mínimo operacional)

```sql
-- Convites sem registration (FK quebrada ou reg apagada)
SELECT COUNT(*)::int
FROM leader_invitations li
LEFT JOIN registrations r ON r.id = li.bonus_registration_id
WHERE li.event_id = $1::uuid
  AND r.id IS NULL;
```

Somar, se desejado alinhamento auditoria, convites `expired` com lastro inválido ou duplicidade (hoje impedida por `unique_bonus_registration`).

### 5.4 Órfãos `free_bonus` (não são convite)

```sql
SELECT COUNT(*)::int
FROM registrations r
WHERE r.event_id = $1::uuid
  AND r.payment_method = 'free_bonus'
  AND NOT EXISTS (
    SELECT 1 FROM leader_invitations li
    WHERE li.bonus_registration_id = r.id
  );
```

`orphan_free_bonus_count` = resultado. Opcional: subcontagem `FREE_BONUS_ADMINISTRATIVO` via `freeBonusRegistrationSemantic.ts` (heurística `registered_by <> runner_id`).

### 5.5 Inscrições pagas e receita (lastro convite)

```sql
SELECT
  COUNT(*)::int AS paid_registrations_from_invitations,
  COALESCE(SUM(r.total_amount), 0)::numeric AS revenue_gross
FROM leader_invitations li
INNER JOIN registrations r ON r.id = li.bonus_registration_id
WHERE li.event_id = $1::uuid
  AND r.payment_status = 'paid'
  AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL);
```

Aplicar no service a **mesma** função de valor líquido usada em `EventDetailedReport` / views organizador, se a métrica exibida for “receita” e não bruta.

### 5.6 Por líder (extensão do endpoint atual)

```sql
SELECT
  li.leader_id::text,
  p.full_name AS leader_name,
  COUNT(*) FILTER (WHERE li.status = 'available')::int AS available,
  COUNT(*) FILTER (WHERE li.status = 'sent')::int AS sent,
  COUNT(*) FILTER (WHERE li.status = 'used')::int AS used,
  COUNT(*) FILTER (WHERE li.status = 'expired')::int AS expired,
  COUNT(*) FILTER (WHERE li.status IN ('available','sent','used'))::int AS total
FROM leader_invitations li
LEFT JOIN group_leaders gl ON gl.id = li.leader_id
LEFT JOIN profiles p ON p.id = gl.user_id
WHERE li.event_id = $1::uuid
GROUP BY li.leader_id, p.full_name
ORDER BY total DESC;
```

Compatível com evolução de `getLeadersInvitationsGrantedByEvent` (hoje só retorna `invitations_granted` = total válido).

---

## 6. Etapa 4 — Plano de implementação (seguro)

### 6.1 Backend

| Passo | Ação |
|-------|------|
| 1 | Criar `backend/src/services/eventInvitationStatsService.ts` com `getEventInvitationStats(eventId: string): Promise<EventInvitationStats>`. |
| 2 | Implementar queries §5 em **uma** ou **duas** round-trips (CTE única opcional). |
| 3 | Extrair helper de valor líquido compartilhado com relatório (evitar divergência com `EventDetailedReport`). |
| 4 | Controller `getEventInvitationStatsController` + rota GET admin e GET organizer (mesmo padrão `leaders-invitations-granted`). |
| 5 | Testes unitários/integração: evento sem convites; só available; sent+convidado; órfão free_bonus; paid=0. |
| 6 | **Não** criar migration. |

**Rotas sugeridas:**

- `GET /api/admin/reports/events/:eventId/invitation-stats`
- `GET /api/organizer/reports/events/:eventId/invitation-stats`

Autorização: admin global; organizador dono do evento (mesmo guard de outros reports).

### 6.2 Frontend

| Passo | Ação |
|-------|------|
| 1 | Tipo `EventInvitationStats` em `src/lib/api/reports.ts` + funções GET. |
| 2 | Nova seção em `EventDetailedReport.tsx` (admin **e** organizador, ou só admin se produto restringir — pedido cita admin; componente já é compartilhado). |
| 3 | UI: cards resumo (`total`, `available`, `sent`, `used`, `conversion_rate`); tabela ou barras por status; linha receita `paid` + contador; alerta se `orphan_free_bonus_count > 0` ou `inconsistent_invitations > 0`. |
| 4 | Texto auxiliar: *“Contagens baseadas em convites concedidos (leader_invitations). Receita considera apenas inscrições pagas lastreadas ao convite. Vendas com cupom de líder aparecem no relatório de líderes.”* |
| 5 | Manter coluna “Convites ganhos” na tabela de líderes (retrocompat) ou migrar para `by_leader` do novo endpoint. |

### 6.3 Riscos e mitigação

| Risco | Mitigação |
|-------|-----------|
| `used` sempre 0 | Documentar na UI; considerar métrica de completude §3.1 |
| Duplicar lógica financeira | Um service backend; front só exibe |
| Confundir receita cupom vs convite | Rótulos distintos (Bloco A vs tabela líderes existente) |
| Leitura disparar concessão | Proibir chamadas a `leaderBonusService` no novo GET |

### 6.4 Critérios de aceite (implementação futura)

- [ ] Admin abre estatísticas do evento e vê seção “Convites”.
- [ ] Números batem com query manual em `leader_invitations` para o evento.
- [ ] `orphan_free_bonus_count` bate com auditoria para amostra.
- [ ] Organizador inalterado na aba Informações / fluxo corredor.
- [ ] Typecheck + build verdes.
- [ ] Sem migration.

---

## 7. O que não fazer nesta entrega

- Implementar service/controller/UI.
- Alterar validação de transferência, concessão de bônus ou reconcile.
- Contar convites por `COUNT(registrations WHERE payment_method = 'free_bonus')`.
- Incluir `partially_paid` ou `convidado` em `revenue_from_invitations` sem mudança explícita de regra.

---

## 8. Referência rápida — arquivos

| Papel | Arquivo |
|-------|---------|
| Schema convites | `backend/migrations/044_create_leader_invitations.sql` |
| Relatório atual | `src/components/organizer/EventDetailedReport.tsx` |
| Endpoint parcial | `backend/src/services/leadersInvitationsReportService.ts` |
| Envio convite | `backend/src/services/leaderInvitationsService.ts` (`sendInvitationByCpf`) |
| Completar convite | `backend/src/services/registrationsService.ts` (`completeInvitationRegistration`) |
| Contrato canônico | `docs/DOMINIO_CONVITES_CONTRATO_CANONICO.md` |
| Classificação órfãos | `backend/src/services/invitationBonusAuditService.ts`, `freeBonusRegistrationSemantic.ts` |

---

## 9. Confirmações desta entrega

| Item | Status |
|------|--------|
| Migration nova | **Não** |
| Alteração de regras backend de convite | **Não** |
| Alteração fluxo corredor/organizador | **Não** |
| Documentação criada | **Sim** — este arquivo |
| Implementação | **Não** (apenas plano) |
