# Plano de correção: líderes com bônus de comissão na migração de organizador

**Status:** planejamento apenas — **sem implementação**, **sem alteração de código**, **sem migration**.

**Base:** `docs/AUDITORIA_LIDERES_MIGRACAO_ORGANIZADOR.md`

---

## 1. Resumo do problema

- A migração de organizador de evento monta a lista de líderes impactados apenas com:
  - `leader_id` de cupons ligados ao evento (`coupons` + `coupon_events`);
  - `leader_id` de convites do evento (`leader_invitations`, status `available` / `sent`).
- **Não** entram líderes que aparecem **somente** em **`leader_event_commissions`** (configuração de bônus por evento: comissão, convite ou ambos).
- Consequência: o dry run e o relatório **subcontam** “Líderes já existentes”, “Líderes a vincular” e “Líderes mapeados para já existente”; e esses líderes **não** passam por `resolveLeadersForMigration`, podendo **não** ser vinculados ao novo organizador em `organizer_group_leaders`.
- Exemplo real: **3** líderes impactados pelo evento, relatório mostra **2** (falta o que só tem comissão no evento).

---

## 2. Regra correta esperada

- **Definição de “líder impactado pelo evento” para fins de migração:** todo `leader_id` que, para o evento em migração, aparece em **qualquer** das fontes:
  1. Cupom do evento (`coupons` + `coupon_events`, organizador de origem, `leader_id` não nulo);
  2. Convite do evento (`leader_invitations`, `event_id`, status `available` ou `sent`);
  3. **Comissão/bônus por evento** (`leader_event_commissions`, `event_id` = evento migrado), **independentemente** de `bonus_type` (`commission`, `invitation`, `both`).

- A lista resultante deve ser a **união** dos `leader_id` distintos dessas três fontes (sem duplicar o mesmo líder).

- Para cada líder dessa lista, a lógica já existente em **`resolveLeadersForMigration`** deve continuar válida:
  - já em `organizer_group_leaders` para B → reutilizado;
  - match por email/telefone com líder já em B → mapeado para existente;
  - caso contrário → INSERT em `organizer_group_leaders` (B, líder) na execução real (e contagem “a vincular” no dry run).

- O relatório deve refletir **exatamente** essa lista unificada, de forma que o número de líderes impactados bata com a realidade (ex.: 3 quando há 1 cupom/convite + 1 convite + 1 só comissão, conforme o cenário).

---

## 3. Arquivos/funções que precisarão ser alterados (na implementação futura)

| Área | Arquivo | Função / trecho |
|------|---------|-----------------|
| Coleta de líderes | `backend/src/services/changeEventOrganizerService.ts` | **`getLeaderIdsForEvent`** — estender com terceira query (ou equivalente) sobre `leader_event_commissions`. |
| Comentários / documentação inline | `backend/src/services/changeEventOrganizerService.ts` | Docstring de `getLeaderIdsForEvent` e, se existir, comentários na Etapa 3. |
| Testes automatizados | Novo ou existente em `backend` (ex.: `*.test.ts`, `*.spec.ts` ou pasta de testes do projeto) | Cenários que cubram líder só em `leader_event_commissions`. |
| Documentação de produto | `docs/PLANO_ALTERACAO_ORGANIZADOR_EVENTO.md` ou `docs/AUDITORIA_LIDERES_MIGRACAO_ORGANIZADOR.md` | Atualizar após implementação para registrar a terceira fonte (opcional, pós-merge). |

**Não** é obrigatório alterar frontend na primeira entrega: o dry run já consome o `summary` retornado pela API; desde que o backend envie contagens corretas, o modal refletirá o novo total.

---

## 4. Como a coleta de líderes deve passar a funcionar

### 4.1 Cupons (mantém)

- Manter a query atual: `coupons` com `coupon_events` para o `eventId`, `organizer_id` = organizador de origem, `leader_id IS NOT NULL`.
- Incluir todos os `leader_id` distintos no conjunto final.

### 4.2 Convites (mantém)

- Manter a query atual: `leader_invitations` com `event_id` e status em `('available','sent')`.
- Incluir todos os `leader_id` distintos no conjunto final.

### 4.3 `leader_event_commissions` (novo)

- **Objetivo:** incluir todo `leader_id` que tenha pelo menos uma linha em `leader_event_commissions` para o `event_id` do evento migrado.
- **Filtro recomendado:** restringir ao evento que ainda pertence ao organizador de origem, para evitar inconsistência em cenários raros:
  - `JOIN events e ON e.id = leader_event_commissions.event_id AND e.organizer_id = $organizerFrom`
  - ou equivalente com `WHERE event_id = $1` e validação prévia de que o evento é de A (já garantida pelo fluxo da migração).
- **Não** filtrar por `bonus_type`: líderes com só `invitation` ou `both` já podem aparecer também em convites; a união com `Set` elimina duplicidade. Líderes com só `commission` passam a entrar.
- Unir os `leader_id` retornados ao mesmo `Set` usado para cupons e convites.

### 4.4 Resultado

- Retorno de `getLeaderIdsForEvent`: array único de UUIDs = união das três fontes.

---

## 5. Impactos

### 5.1 Relatório dry run

- `resolveLeadersForMigration` receberá mais `leaderIds` quando houver linhas em `leader_event_commissions` sem cupom/convite correspondente.
- Contadores no `summary` (`leaders_to_reuse`, `leaders_to_create`, `leaders_mapped_to_existing`) passarão a incluir esses líderes.
- O dry run deixará de subcontar; exemplo: de 2 para 3 líderes impactados quando aplicável.

### 5.2 Execução real

- Mesmo mapa `old_leader_id → new_leader_id` será aplicado a mais líderes.
- Convites e cupons que já referenciam esses líderes continuam cobertos se já estavam nas fontes 1 e 2; a fonte 3 garante **vínculo** de líderes que só tinham comissão configurada.
- **Não** se exige, neste plano, alterar `leader_event_commissions` (PK/linhas permanecem com mesmo `leader_id` e `event_id`); o ganho principal é **garantir** que o líder esteja em `organizer_group_leaders` para B.

### 5.3 Vínculo em `organizer_group_leaders`

- Para cada líder novo na lista unificada que não estiver em B e não for mapeado por email/telefone, a execução real fará **INSERT** `(organizer_id = B, leader_id)` como hoje.
- Assim, após a migração, B verá esses líderes na lista “Líderes de Grupo”, alinhado ao uso de `getOrganizerLeaders(B)`.

### 5.4 Validação pós-migração (Etapa 8)

- Revisar se alguma checagem atual assume apenas cupons/convites; se houver validação de “líder vinculado a B” só para cupons/convites, considerar estender a mesma regra para líderes referenciados em `leader_event_commissions` do evento (recomendação de revisão na implementação).

---

## 6. Testes a adicionar (na implementação futura)

1. **Líder só em `leader_event_commissions` (commission):** evento de A, um registro LEC sem cupom com `leader_id` e sem convite available/sent para esse líder → após dry run, contagem de “a vincular” ou “reutilizado”/“mapeado” coerente com B; após migração, `(B, leader_id)` existe em `organizer_group_leaders`.
2. **Líder duplicado nas três fontes:** mesmo `leader_id` em cupom, convite e LEC → lista final com **um** líder; contagens não duplicam.
3. **Líder já em B + LEC:** líder já em `organizer_group_leaders` para B e com LEC no evento → contado como reutilizado, sem INSERT duplicado.
4. **Líder LEC + match email em B:** outro líder em B com mesmo email → mapeado para existente, sem INSERT do líder original.
5. **Regressão:** cenário atual só cupom + só convite continua com mesmo comportamento de antes (contagens iguais às esperadas pré-correção quando não há LEC extra).

---

## 7. Riscos que esta correção resolve

| Risco (antes) | Após a correção |
|---------------|-----------------|
| Relatório enganoso (subcontagem). | Relatório reflete todos os líderes impactados pelas três fontes. |
| Líder com comissão no evento não vinculado a B. | Passa a ser incluído na resolução e vinculado (ou mapeado) como os demais. |
| Organizador B não vê o líder na lista mas o evento ainda referencia comissão daquele líder. | Reduz inconsistência entre `leader_event_commissions` e visibilidade em B. |
| Decisões operacionais com base em dry run incorreto. | Dry run alinhado à execução real para líderes de comissão. |

**Riscos residuais (mitigar na implementação):** performance marginal (mais uma query simples indexada em `event_id`); garantir que o filtro por organizador de origem não exclua linhas válidas em edge cases.

---

## 8. Checklist final para implementar depois

- [ ] Estender **`getLeaderIdsForEvent`** com query em **`leader_event_commissions`** filtrada por `event_id` (e, se adotado, `events.organizer_id = organizerFrom`).
- [ ] Unificar resultados em um único conjunto de `leader_id` (sem duplicatas).
- [ ] Atualizar comentário/docstring da função descrevendo as três fontes.
- [ ] Rodar migração de teste (dry run + real) no cenário “3 líderes” (1 em B, 1 convite, 1 só LEC) e validar contagens e `organizer_group_leaders`.
- [ ] Revisar **`runPostMigrationValidation`** (se aplicável) para líderes só em LEC.
- [ ] Implementar testes automatizados listados na seção 6.
- [ ] Atualizar documentação técnica (`AUDITORIA_LIDERES_MIGRACAO_ORGANIZADOR` ou plano principal) com a regra final das três fontes.
- [ ] Code review focado em idempotência e em não quebrar fluxos existentes de cupom/convite.

---

*Documento de plano apenas. Nenhuma alteração de código ou migration foi realizada.*
