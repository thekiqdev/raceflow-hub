# Auditoria — Categorias Disponíveis dos Kits + Ocultação Segura

**Data:** 2026-06-03  
**Escopo:** fluxo Editar Evento → Kits → Categorias Disponíveis; nova flag `is_visible`.

---

## Parte 1 — Auditoria do salvamento de categorias

### Fluxo mapeado

```
UI (EventFormDialog / EventViewEditDialog)
  → checkbox altera kit.category_ids no estado local
  → salvar evento → POST /api/events/:eventId/kits { kits: [...] }
  → syncEventKitsController (valida category_ids)
  → syncEventKits → associateKitToCategories (kit_categories)
  → GET reload → getKitCategories por kit
```

### Checklist de validação

| # | Etapa | Resultado |
|---|--------|-----------|
| 1 | Frontend envia categorias? | **Parcial** — enviava `category_ids` só quando length > 0; vazio virava `undefined` |
| 2 | Payload contém categorias ao marcar? | **Sim** — IDs UUID das categorias carregadas |
| 3 | Endpoint recebe? | **Sim** — schema Zod aceita `category_ids` opcional |
| 4 | Backend persiste? | **Condicional** — só se `kitData.category_ids !== undefined` |
| 5 | Remoção funciona? | **Não** — `undefined` no payload **pulava** `associateKitToCategories`; associações antigas permaneciam |
| 6 | Reload na edição? | **Parcial** — EventViewEditDialog não recarregava kits após save; EventFormDialog recarregava só para reorder |

### Causa raiz

1. **Frontend:** `category_ids: length > 0 ? ids : undefined` impedia enviar array vazio.
2. **Backend:** `if (kitData.category_ids !== undefined)` ignorava sync quando o campo era omitido — correto para omitir, mas combinado com (1) **nunca limpava** vínculos ao desmarcar todas.
3. **EventFormDialog:** `validCategoryIds` mapeava IDs inválidos por **índice** em `savedCategoryList[i]` em vez de validar contra o conjunto de IDs salvos — risco de persistir ID errado em edge cases.

### Tabelas envolvidas

- `kit_categories` (kit_id, category_id)
- `categories` (validação event_id)
- `event_kits`

### Correção aplicada

- Frontend sempre envia `category_ids: string[]` (inclusive `[]`).
- Backend sempre chama `associateKitToCategories(kit.id, kitData.category_ids ?? [])`.
- `validCategoryIds` filtra apenas UUIDs existentes no evento.
- Reload de kits após sync em ambos os formulários.

---

## Parte 2 — Ocultação segura (`is_visible`)

### Decisão

- **Não** reutilizar `deleted_at` (reservado para soft delete por inscrições vinculadas).
- Nova coluna `event_kits.is_visible BOOLEAN NOT NULL DEFAULT TRUE`.

### Comportamento

| Contexto | Filtro `is_visible = true` |
|----------|------------------------------|
| Página pública / inscrição / visitante | **Sim** |
| Admin / organizador do evento | **Não** |
| Relatórios / estoque / financeiro / check-in (SQL direto ou getEventKits interno) | **Não** |

### API GET `/events/:eventId/kits`

- Usuário anônimo ou não-dono → `visibleOnly: true`
- Admin ou `organizer_id` → `visibleOnly: false`

---

## Arquivos alterados (implementação)

- `backend/migrations/114_add_event_kits_is_visible.sql`
- `backend/src/services/eventKitsService.ts`
- `backend/src/controllers/eventKitsController.ts`
- `src/lib/api/eventKits.ts`
- `src/components/organizer/EventFormDialog.tsx`
- `src/components/admin/EventViewEditDialog.tsx`
