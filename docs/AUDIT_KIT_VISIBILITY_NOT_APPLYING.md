# AUDIT_KIT_VISIBILITY_NOT_APPLYING

**Data:** 2026-06-03  
**Problema:** `is_visible = false` persiste no banco, mas kits ocultos continuam na página pública do evento e no fluxo de inscrição.  
**Escopo:** auditoria read-only — mapear todas as consultas a `event_kits` e identificar onde o filtro `is_visible` é ignorado. **Sem correção aplicada.**

---

## Resumo executivo

| Pergunta | Resposta |
|----------|----------|
| Qual endpoint abastece a **página pública**? | `GET /api/events/:eventId/kits` (sem `category_id`) |
| Qual endpoint abastece o **fluxo de inscrição**? | O mesmo: `GET /api/events/:eventId/kits?category_id={uuid}` |
| Onde está o bug? | **`eventKitsController.shouldFilterVisibleKitsOnly`** desliga o filtro quando o JWT é de **organizador do evento** ou **admin** — e o `apiClient` **sempre** envia o token se existir em `localStorage`. |
| Há filtro no frontend? | **Não.** `EventDetails.visibleKitsForPublicPage` e `RegistrationFlow` filtram só por `category_ids`, não por `is_visible`. |
| Risco secundário | Se a migration `114_add_event_kits_is_visible.sql` não rodou, `visibleKitWhereClause` retorna string vazia mesmo com `visibleOnly: true`. |

**Conclusão:** o único endpoint que alimenta vitrine pública + seleção de kit na inscrição **possui** lógica de filtro, mas ela **não é aplicada** na prática quando quem navega está logado como organizador/admin (cenário típico de teste). Visitante anônimo ou atleta comum **deveria** receber kits filtrados — desde que a coluna exista no banco.

---

## 1. Página pública do evento

### Frontend

| Arquivo | Chamada |
|---------|---------|
| `src/pages/EventDetails.tsx` | `getEventKits(eventIdOrSlug)` no `loadEventData` |
| `src/lib/api/eventKits.ts` | `GET /events/${eventId}/kits` |

### Backend

| Campo | Valor |
|-------|-------|
| **Endpoint** | `GET /api/events/:eventId/kits` |
| **Rota** | `backend/src/routes/events.ts` — `optionalAuth` |
| **Controller** | `getEventKitsController` |
| **Service** | `getEventKits(eventId, undefined, { visibleOnly })` |
| **Query** | `SELECT * FROM event_kits WHERE event_id = $1 [AND deleted_at IS NULL] [AND is_visible = TRUE] ORDER BY display_order` |
| **Possui filtro `is_visible`?** | **CONDICIONAL** — só se `visibleOnly === true` **e** coluna existir |
| **Tipo** | PÚBLICO |

### Filtro adicional no frontend (não é `is_visible`)

```typescript
// EventDetails.tsx — visibleKitsForPublicPage
kits.filter(kit =>
  kit.category_ids?.some(id => publicCategoryIdSet.has(id))
);
```

Oculta kits sem categoria vinculada à vitrine, mas **não** oculta kits com `is_visible = false`.

---

## 2. Fluxo de inscrição

### Frontend

| Arquivo | Chamada |
|---------|---------|
| `src/components/event/RegistrationFlow.tsx` | `getEventKits(event.id, selectedCategory.id)` |
| `src/pages/EventDetails.tsx` | repassa `kits={kits}` ao modal (prop usada só em debug; UI usa `filteredKits`) |

Filtro client-side na inscrição:

```typescript
response.data.filter(kit =>
  kit.category_ids?.length > 0 &&
  kit.category_ids.includes(selectedCategory.id)
);
```

**Sem** checagem de `is_visible`.

### Backend

| Campo | Valor |
|-------|-------|
| **Endpoint** | `GET /api/events/:eventId/kits?category_id={uuid}` |
| **Service** | `getEventKits(eventId, categoryId, { visibleOnly })` |
| **Query** | `SELECT DISTINCT k.* FROM event_kits k INNER JOIN kit_categories kc ON ... WHERE k.event_id = $1 [AND k.deleted_at IS NULL] [AND k.is_visible = TRUE]` |
| **Possui filtro `is_visible`?** | **CONDICIONAL** (mesma regra do item 1) |
| **Tipo** | INSCRIÇÃO / PÚBLICO |

---

## 3. Lógica que decide se o filtro roda

```typescript
// eventKitsController.ts — shouldFilterVisibleKitsOnly
if (!req.user) return true;                          // anônimo → FILTRA
if (event.organizer_id === req.user.id) return false; // organizador → NÃO FILTRA
const isAdmin = await hasRole(req.user.id, 'admin');
return !isAdmin;                                     // admin → NÃO FILTRA; demais → FILTRA
```

```typescript
// eventKitsService.ts — visibleKitWhereClause
if (!visibleOnly) return '';
if (!(await eventKitsHasIsVisible())) return '';     // coluna ausente → SEM FILTRO SQL
return ` AND ${prefix}is_visible = TRUE`;
```

```typescript
// src/lib/api/client.ts — todo GET autenticado se houver token
if (token) headers['Authorization'] = `Bearer ${token}`;
```

**Cadeia do bug observado:**

```
Organizador/admin logado
  → abre /eventos/:slug (página pública)
  → getEventKits() envia JWT
  → shouldFilterVisibleKitsOnly → false
  → visibleOnly: false
  → SQL sem AND is_visible = TRUE
  → frontend sem filtro is_visible
  → kit oculto aparece na vitrine e na inscrição
```

---

## 4. Inventário completo — endpoints HTTP

| Endpoint | Service | Query (resumo) | Filtro `is_visible`? | Tipo | Deve filtrar? |
|----------|---------|----------------|----------------------|------|---------------|
| `GET /api/events/:eventId/kits` | `getEventKits` | `SELECT * FROM event_kits WHERE event_id = $1 ...` | **CONDICIONAL** | PÚBLICO / INSCRIÇÃO / ORGANIZADOR* | **SIM** em contexto público; **NÃO** em painel de edição |
| `POST /api/events/:eventId/kits` | `syncEventKits` | INSERT/UPDATE/soft-delete em `event_kits` | N/A (escrita) | ORGANIZADOR | N/A |
| `PUT /api/events/:eventId/kits/reorder` | `reorderEventKits` | `UPDATE event_kits SET display_order` | N/A | ORGANIZADOR | N/A |
| `GET /api/categories/:categoryId/kits` | `getCategoryKits` | `SELECT kit_id FROM kit_categories WHERE category_id = $1` | **NÃO** (só IDs) | ADMIN/ORGANIZADOR | N/A |
| `GET /api/kits/:kitId/categories` | `getKitCategories` | `SELECT category_id FROM kit_categories` | N/A | ADMIN/ORGANIZADOR | N/A |

\* O mesmo endpoint atende vitrine pública e painel do organizador — hoje a distinção é só pelo JWT.

**Não existe** `eventPublicService` nem endpoint dedicado “evento público” que embute kits; tudo passa por `GET .../kits`.

---

## 5. Inventário completo — services (consultas SQL a `event_kits`)

### eventKitsService.ts

| Função | Query | Filtro `is_visible`? | Tipo | Deve filtrar? |
|--------|-------|----------------------|------|---------------|
| `getEventKits` (sem categoria) | `SELECT * FROM event_kits WHERE event_id = $1` + cláusulas dinâmicas | **SIM se** `options.visibleOnly` | PÚBLICO / INSCRIÇÃO / interno | Depende do caller |
| `getEventKits` (com categoria) | `SELECT DISTINCT k.* ... INNER JOIN kit_categories` | **SIM se** `options.visibleOnly` | INSCRIÇÃO | **SIM** (público) |
| `loadKitProductsWithStockForEvent` | `SELECT * FROM event_kits WHERE id = $1 AND event_id = $2` | **NÃO** | INSCRIÇÃO (edição) | **NÃO** |
| `getEventKitById` | `SELECT * FROM event_kits WHERE id = $1` | **NÃO** | ADMIN / interno | **NÃO** |
| `createEventKit` | `INSERT INTO event_kits ...` | N/A | ORGANIZADOR | N/A |
| `updateEventKit` | `UPDATE event_kits SET ...` | N/A | ORGANIZADOR | N/A |
| `deleteEventKit` | soft delete ou `DELETE` | N/A | ORGANIZADOR | N/A |
| `syncEventKits` | múltiplas; reload via `getEventKits(eventId)` **sem** `visibleOnly` | **NÃO** | ORGANIZADOR | **NÃO** |
| `reorderEventKits` | `SELECT id ...` / `UPDATE display_order` | **NÃO** | ORGANIZADOR | **NÃO** |

### kitCategoriesService.ts

| Função | Query | Filtro `is_visible`? | Tipo | Deve filtrar? |
|--------|-------|----------------------|------|---------------|
| `validateKitBelongsToEvent` | `SELECT event_id FROM event_kits WHERE id = $1` | **NÃO** | interno | **NÃO** |
| `getKitsByCategory` | `SELECT DISTINCT k.* FROM event_kits k WHERE ... kit_categories` | **NÃO** | — | **SIM se exposto ao público** |
| `getCategoryKits` | só `kit_categories` | N/A | ADMIN | **NÃO** |

> `getKitsByCategory` **não está ligada a nenhuma rota HTTP** hoje (código morto / plano antigo). Risco futuro se for exposta sem filtro.

### registrationsService.ts

| Função / trecho | Query | Filtro `is_visible`? | Tipo | Deve filtrar? |
|-----------------|-------|----------------------|------|---------------|
| listagens / detalhe | `LEFT JOIN event_kits ek ON r.kit_id = ek.id` | **NÃO** | INSCRIÇÃO / RELATÓRIO | **NÃO** (kit já escolhido) |
| validação na criação | `SELECT 1 FROM event_kits WHERE id = $1 AND event_id = $2` | **NÃO** | INSCRIÇÃO | **SIM** para *novo* kit (hoje aceita kit oculto se souber o UUID) |

### registrationTotalService.ts

| Trecho | Query | Filtro `is_visible`? | Tipo | Deve filtrar? |
|--------|-------|----------------------|------|---------------|
| cálculo de preço | `SELECT id, event_id, price FROM event_kits WHERE id = $1 AND event_id = $2` | **NÃO** | FINANCEIRO / INSCRIÇÃO | **NÃO** (inscrição existente) |

### eventProductStockReportService.ts

| Trecho | Query | Filtro `is_visible`? | Tipo | Deve filtrar? |
|--------|-------|----------------------|------|---------------|
| relatório de estoque | `FROM event_kits k INNER JOIN kit_products ...` | **NÃO** | RELATÓRIO / ESTOQUE | **NÃO** |

### leaderInvitationsService.ts

| Trecho | Query | Filtro `is_visible`? | Tipo | Deve filtrar? |
|--------|-------|----------------------|------|---------------|
| validação kit convite | `SELECT 1 FROM event_kits WHERE id = $1 AND event_id = $2` | **NÃO** | INSCRIÇÃO | discutível |

### registrationKitSelectionAuditService.ts / registrationProductSelectionsService.ts

| Trecho | Query | Filtro `is_visible`? | Tipo | Deve filtrar? |
|--------|-------|----------------------|------|---------------|
| auditoria / seleções | `INNER JOIN event_kits` | **NÃO** | RELATÓRIO / AUDITORIA | **NÃO** |

### eventsService.ts

| Consulta `event_kits` | **Nenhuma** | — | — | — |

---

## 6. Inventário — controllers com SQL ou `getEventKits` direto

| Local | Uso | Filtro `is_visible`? | Tipo |
|-------|-----|----------------------|------|
| `eventKitsController.getEventKitsController` | `getEventKits(..., { visibleOnly })` | **CONDICIONAL** | PÚBLICO |
| `registrationsController` (update inscrição) | `SELECT id FROM event_kits WHERE id = $1 AND event_id = $2` | **NÃO** | ADMIN / ORGANIZADOR |
| `registrationsController` (inscrição por líder) | `getEventKits(event_id)` **sem** `visibleOnly` | **NÃO** | INSCRIÇÃO (staff) |

---

## 7. Inventário — frontend (consumidores de `getEventKits`)

| Componente | Contexto | Filtro client `is_visible`? | Deve filtrar? |
|------------|----------|----------------------------|---------------|
| `EventDetails.tsx` | Página pública | **NÃO** (só `category_ids`) | **SIM** |
| `RegistrationFlow.tsx` | Inscrição pública | **NÃO** (só `category_ids`) | **SIM** |
| `EventFormDialog.tsx` | Editar evento (organizador) | **NÃO** | **NÃO** |
| `EventViewEditDialog.tsx` | Editar evento (admin) | **NÃO** | **NÃO** |
| `EventRegistrationsPanel.tsx` | Gestão inscrições | **NÃO** | **NÃO** |
| `AdminRegistrations.tsx` | Admin inscrições | **NÃO** | **NÃO** |
| `OrganizerRegistrations.tsx` | Organizador inscrições | **NÃO** | **NÃO** |
| `RegisterAthleteStaffDialog.tsx` | Staff inscrição | **NÃO** | **NÃO** (staff) |
| `LeaderDashboard.tsx` / `CompleteInvitationModal.tsx` | Líder / convite | **NÃO** | discutível |
| `loadEventKitsWithKitFallback.ts` | Helper inscrição/edição | **NÃO** | depende do caller |

---

## 8. Classificação DEVE / NÃO DEVE filtrar

### DEVE filtrar (`is_visible = true`)

- Página pública (`EventDetails`)
- Fluxo de inscrição (`RegistrationFlow`)
- APIs públicas consumidas por visitante ou atleta sem privilégio de edição
- Validação de **novo** `kit_id` na criação de inscrição (hardening — hoje não filtra)

### NÃO DEVE filtrar

- Admin / organizador (painéis de edição e gestão)
- Relatórios / estoque (`eventProductStockReportService`)
- Financeiro (`registrationTotalService` para inscrições existentes)
- Check-in / recuperação de inscrições (`LEFT JOIN` em listagens)
- Auditorias e scripts (`auditEventKitsWithRegistrations`, etc.)
- `syncEventKits`, `reorderEventKits`, `getEventKitById`, `loadKitProductsWithStockForEvent`

---

## 9. Causa raiz identificada

### Primária (explica o sintoma com `is_visible` salvo corretamente)

**Endpoint:** `GET /api/events/:eventId/kits`  
**Arquivo:** `backend/src/controllers/eventKitsController.ts`  
**Função:** `shouldFilterVisibleKitsOnly`

O endpoint único da vitrine pública **desliga** `visibleOnly` para organizador e admin. O frontend reutiliza esse endpoint na página pública e envia JWT automaticamente. Testar “como organizador logado” **nunca** exercita o filtro — comportamento indistinguível de “filtro não aplicado”.

### Secundária

1. **Migration 114 ausente:** `eventKitsHasIsVisible()` → false → cláusula SQL vazia mesmo para anônimos.
2. **Frontend sem defesa:** nenhum `.filter(k => k.is_visible !== false)` em `EventDetails` / `RegistrationFlow`.
3. **Validação de criação:** `registrationsService` aceita qualquer `kit_id` do evento, inclusive oculto, se o cliente enviar o UUID.

### O que NÃO é a causa

- `GET /api/categories/:categoryId/kits` — retorna só IDs de `kit_categories`; não alimenta vitrine pública.
- `getKitsByCategory` — não exposta via HTTP.
- `eventsService` — não consulta kits.

---

## 10. Como validar antes de corrigir

1. **Anônimo:** abrir página do evento em aba anônima (sem JWT) → inspecionar resposta de `GET .../kits` → kits ocultos devem sumir **se** migration 114 aplicada.
2. **Organizador logado:** mesma URL → kits ocultos **ainda aparecem** (reproduz o bug reportado).
3. **Banco:** `SELECT column_name FROM information_schema.columns WHERE table_name = 'event_kits' AND column_name = 'is_visible';`
4. **SQL direto:** `SELECT id, name, is_visible FROM event_kits WHERE event_id = '...';`

---

## 11. Correção mínima proposta (não implementada)

Separar **contexto de consumo** do **papel do usuário**:

| Opção | Mudança | Impacto |
|-------|---------|---------|
| **A (recomendada)** | Query param `?visibility=public` (ou header dedicado) força `visibleOnly: true` no controller, independente do JWT. Painéis de edição chamam sem o param (ou `?visibility=all`). | 1 controller + ajuste em `eventKits.ts` e callers públicos |
| **B** | `shouldFilterVisibleKitsOnly` sempre retorna `true` no GET; novo endpoint ou param `include_hidden=true` só para formulários admin/organizador | Inverte default — mais seguro para público |
| **C** | Defesa no frontend: filtrar `is_visible !== false` em `EventDetails` e `RegistrationFlow` | Não substitui correção backend; evita vazamento visual se API falhar |
| **D** | `apiClient` não enviar JWT em rotas públicas explícitas | Frágil; organizador ainda precisaria ver ocultos no painel |

**Pacote mínimo sugerido:** **A +** confirmar migration **114** em produção **+** (opcional) validar `is_visible = true` em `registrationsService` na **criação** de inscrição.

**Arquivos tocados (estimativa):**

- `backend/src/controllers/eventKitsController.ts`
- `src/lib/api/eventKits.ts`
- `src/pages/EventDetails.tsx`
- `src/components/event/RegistrationFlow.tsx`

**Não alterar:** `syncEventKits`, relatórios de estoque, JOINs em inscrições existentes.

---

## 12. Referências de código

```9:18:backend/src/controllers/eventKitsController.ts
async function shouldFilterVisibleKitsOnly(req: AuthRequest, eventId: string): Promise<boolean> {
  if (!req.user) return true;
  const event = await getEventById(eventId);
  if (!event) return true;
  if (event.organizer_id === req.user.id) return false;
  const isAdmin = await hasRole(req.user.id, 'admin');
  return !isAdmin;
}
```

```90:95:backend/src/services/eventKitsService.ts
const visibleKitWhereClause = async (alias = '', visibleOnly = false): Promise<string> => {
  if (!visibleOnly) return '';
  if (!(await eventKitsHasIsVisible())) return '';
  const prefix = alias ? `${alias}.` : '';
  return ` AND ${prefix}is_visible = TRUE`;
};
```

```299:306:src/pages/EventDetails.tsx
const visibleKitsForPublicPage = useMemo(() => {
  return kits.filter((kit) => {
    const ids = kit.category_ids;
    if (!Array.isArray(ids) || ids.length === 0) return false;
    return ids.some((id) => publicCategoryIdSet.has(id));
  });
}, [kits, publicCategoryIdSet]);
```

```791:798:src/components/event/RegistrationFlow.tsx
const response = await getEventKits(event.id, selectedCategory.id);
const linkedOnly = response.data.filter(
  (kit) =>
    Array.isArray(kit.category_ids) &&
    kit.category_ids.length > 0 &&
    kit.category_ids.includes(selectedCategory.id)
);
```
