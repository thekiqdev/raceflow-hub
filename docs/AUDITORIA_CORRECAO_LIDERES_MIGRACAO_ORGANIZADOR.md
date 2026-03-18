# Auditoria e correção: Líderes na migração de organizador

**Objetivo:** Alinhar a contagem de líderes "reutilizados" no relatório da migração com a regra real usada pela tela "Líderes de Grupo" do organizador, para que o número exibido corresponda aos líderes que de fato aparecem na lista do novo organizador.

---

## 1. Qual era a divergência

- **Relatório da migração:** exibia "Líderes já existentes no novo organizador: 2".
- **Lista real do organizador:** após a migração, apenas 1 líder aparecia na tela "Líderes de Grupo" do novo organizador.
- **Causa:** O backend considerava "reutilizado" tanto (a) líderes que **já estavam** na lista de B (`organizer_group_leaders`) quanto (b) líderes do evento que foram **mapeados por email/telefone** para um líder que já estava em B. No caso (b) não há novo vínculo criado e o líder **original** do evento não passa a aparecer na lista de B; apenas os convites/cupons passam a usar o líder já existente em B. Ou seja, o relatório contava "reutilizados" por critério de **resolução** (reuso ou match), e não por **presença na lista** do organizador.

---

## 2. Regra real da UI (como a lista do organizador é montada)

- **Tela:** "Líderes de Grupo" do organizador (fluxo do organizador).
- **API:** `GET /api/organizer/group-leaders` → `getOrganizerLeaders(organizerId)` em `groupLeadersService.ts`.
- **Regra:** Um líder aparece na lista **somente** se existir registro em **`organizer_group_leaders`** com `organizer_id = organizador` e `leader_id = líder`:

```sql
SELECT gl.*, ...
FROM organizer_group_leaders ogl
JOIN group_leaders gl ON ogl.leader_id = gl.id
...
WHERE ogl.organizer_id = $1
```

Portanto: **"líder já existente no novo organizador"** = líder que já possui linha em `organizer_group_leaders` com o `organizer_id` do novo organizador. Nada de email/telefone; apenas essa tabela de vínculo.

---

## 3. Onde estava o erro

- **Arquivo:** `backend/src/services/changeEventOrganizerService.ts`.
- **Função:** `resolveLeadersForMigration`.
- **Lógica anterior:**
  - `leaders_reused_in_b` era incrementado em dois casos:
    1. **Já em B:** `bByLeaderId.has(orig.id)` — líder do evento já está em `organizer_group_leaders` para B. ✅ Correto.
    2. **Match por email/telefone:** líder do evento não está em B, mas existe em B outro líder com mesmo email ou telefone; convites/cupons passam a usar esse líder. Nesse caso também se incrementava `leaders_reused_in_b`. ❌ Incorreto para o relatório: esse líder **original** não está na lista de B; quem está é **outro** líder (o "matched").
- O relatório exibia a soma (1) + (2) como "Líderes já existentes no novo organizador", o que não batia com a quantidade de linhas que a UI mostra (apenas os do caso (1)).

---

## 4. O que foi ajustado

1. **Contagem "reutilizado":**
   - **`leaders_reused_in_b`** passa a contar **apenas** líderes do evento cujo `leader_id` **já existe** em `organizer_group_leaders` para o organizador B (caso 1). Assim, o número do relatório equivale exatamente aos líderes que já aparecem na lista do organizador.

2. **Novo contador "mapeado para existente":**
   - **`leaders_mapped_to_existing`** passa a contar os líderes do evento que foram resolvidos por **match de email/telefone** com um líder já em B (caso 2). Nesses casos não se cria novo vínculo; apenas se reutiliza o líder já existente em B para convites/cupons. Esse contador foi adicionado ao resultado de `resolveLeadersForMigration`, ao `DryRunSummary` e à resposta da API (`summary` e `leaders_resolved`).

3. **Log e relatório:**
   - `total_lideres_reutilizados` no log de migração continua sendo preenchido apenas com líderes **realmente** já em B (mesma regra da UI).
   - O frontend pode exibir, no resumo do dry run e no resultado final, as três informações:
     - **Líderes já existentes na lista do novo organizador:** `leaders_to_reuse` / `reused_in_b`.
     - **Líderes a vincular (passarão a aparecer na lista):** `leaders_to_create` / `added_to_b`.
     - **Líderes do evento mapeados para líder já na lista (email/telefone):** `leaders_mapped_to_existing` (quando > 0).

4. **Frontend (ChangeOrganizerModal):**
   - Textos do resumo do dry run foram ajustados para deixar claro que "já existentes" = já na lista do organizador.
   - Incluída linha opcional para "Líderes do evento mapeados para líder já na lista (email/telefone)" quando `leaders_mapped_to_existing > 0`.

---

## 5. Como garantir que o relatório bate com a UI

- **"Líderes já existentes no novo organizador"** no relatório = contagem de líderes do evento que **já tinham** `(organizer_id = B, leader_id = líder)` em `organizer_group_leaders` antes da migração. Essa é a mesma regra usada por `getOrganizerLeaders(B)` na tela "Líderes de Grupo". Portanto, o número exibido no relatório deve coincidir com a quantidade de líderes **do evento** que o organizador B já tinha na lista antes da migração (e que continuarão aparecendo após).
- **"Líderes a vincular"** = líderes do evento que **não** estavam em B e para os quais será feito `INSERT` em `organizer_group_leaders`; após a migração, esses líderes **passam** a aparecer na lista de B.
- **"Líderes mapeados para já existente"** = líderes do evento que não estavam em B e foram resolvidos por email/telefone; **não** é criado novo vínculo, então a lista de B não aumenta por esses itens; apenas convites/cupons passam a usar o líder já existente em B.

**Cenários de validação:**

| Cenário | Descrição | Esperado no relatório | Esperado na lista de B |
|--------|-----------|----------------------|-------------------------|
| 1 | Líder do evento já está em `organizer_group_leaders` para B | reutilizado +1 | Continua aparecendo (1 líder) |
| 2 | Líder do evento não está em B; match por email/telefone com líder já em B | mapeado +1 (reutilizado não) | Lista inalterada (nenhum novo líder) |
| 3 | Líder do evento não está em B e não há match | adicionado +1 (INSERT) | Passa a aparecer +1 líder na lista |

Com isso, a contagem do relatório fica alinhada à regra real da tela "Líderes de Grupo" do organizador.
