# Auditoria técnica: Líderes com bônus de comissão no relatório da migração de organizador

## Objetivo

Identificar por que líderes com bônus de comissão não entram corretamente na prévia/relatório da migração de organizador de evento, resultando em contagem inferior à esperada (ex.: relatório mostrando "Líderes a vincular: 2" quando o correto seria 3).

---

## Escopo da análise

- **Fluxo analisado:** migração de organizador de evento (backend), em especial a etapa que coleta líderes impactados e monta o relatório (dry run e execução real).
- **Não incluso:** alteração de código, migrations ou implementação; apenas análise e documentação.
- **Arquivos principais consultados:**
  - `backend/src/services/changeEventOrganizerService.ts` (serviço de migração)
  - `backend/src/services/groupLeadersService.ts` (listagem de líderes do organizador)
  - `backend/src/services/leaderEventCommissionsService.ts` (comissões por evento)
  - Migrations: `039`, `042`, `043`, `044`, `077`, `030`

---

## Fluxo atual encontrado

### Onde a migração coleta os líderes envolvidos

A coleta de líderes impactados pelo evento é feita em **uma única função**: `getLeaderIdsForEvent`, no arquivo **`backend/src/services/changeEventOrganizerService.ts`** (linhas ~559–585).

Fluxo resumido:

1. **Chamada:** `resolveLeadersForMigration(client, eventId, organizerFrom, organizerTo, dryRun)` (linha ~650).
2. **Primeiro passo dentro de `resolveLeadersForMigration`:** `const leaderIds = await getLeaderIdsForEvent(client, eventId, organizerFrom)`.
3. **`getLeaderIdsForEvent`** retorna a lista de `leader_id` distintos que serão considerados para:
   - decidir quem “já existe” no organizador B,
   - quem será “mapeado” por email/telefone,
   - quem será “vinculado” (INSERT em `organizer_group_leaders`).
4. O relatório (dry run e resultado real) usa **somente** esses `leaderIds` para as contagens:
   - “Líderes já existentes no novo organizador” (`leaders_reused_in_b`)
   - “Líderes a vincular” (`leaders_added_to_b`)
   - “Líderes mapeados para já existente” (`leaders_mapped_to_existing`).

Ou seja: **qualquer líder que não esteja na lista retornada por `getLeaderIdsForEvent` não entra no relatório e não é considerado para vínculo com o organizador B.**

---

## Fontes de líderes consideradas hoje

A função **`getLeaderIdsForEvent`** obtém `leader_id` de **duas fontes apenas**:

### 1. Cupons do evento (`coupons` + `coupon_events`)

- **Query (linhas ~564–569):**
  - `SELECT DISTINCT c.leader_id FROM coupons c`
  - `INNER JOIN coupon_events ce ON ce.coupon_id = c.id AND ce.event_id = $1`
  - `WHERE c.organizer_id = $2 AND c.leader_id IS NOT NULL`
- **Interpretação:** líderes vinculados a cupons do organizador A que estão associados ao evento via `coupon_events`. Ou seja, **líder do cupom** (cupom por evento com `leader_id`).

### 2. Convites do evento (`leader_invitations`)

- **Query (linhas ~570–574):**
  - `SELECT DISTINCT leader_id FROM leader_invitations`
  - `WHERE event_id = $1 AND status IN ('available', 'sent')`
- **Interpretação:** líderes que possuem convites **disponíveis** ou **enviados** para o evento. Ou seja, **líder de convite** (ao menos um convite available/sent para o evento).

Nenhuma outra tabela ou query é usada para montar essa lista. Os IDs são reunidos em um `Set` e retornados como array (linhas ~575–584).

---

## Fontes de líderes que estão faltando

As fontes abaixo **não** são consideradas por `getLeaderIdsForEvent` e, portanto, **não** entram no relatório nem na lógica de vínculo com B.

### 1. **`leader_event_commissions`** (principal causa da divergência)

- **Tabela:** `leader_event_commissions` (migrations 039, 042, 043).
- **Campos relevantes:** `leader_id`, `event_id`, `bonus_type` (`'commission'`, `'invitation'`, `'both'`).
- **Uso no sistema:** define, por evento e por líder, as regras de bônus:
  - **Comissão:** compras geram comissão (`commission` ou `both`).
  - **Convite:** número de compras gera convite (`invitation` ou `both`).
- **Serviço:** `backend/src/services/leaderEventCommissionsService.ts` (ex.: `getLeaderEventCommissionsByEvent`, `getLeaderEventCommissions`).
- **Situação na migração:** a tabela **não é referenciada** em `changeEventOrganizerService.ts`. Nenhuma query seleciona `leader_id` a partir de `leader_event_commissions` para o evento.
- **Consequência:** um líder que **só** tem bônus de comissão no evento (registro em `leader_event_commissions` com `bonus_type` em `('commission','both')`) e **não** tem cupom com `leader_id` nem convite available/sent para o evento **não** é incluído em `getLeaderIdsForEvent`. Esse líder não aparece no relatório e não é vinculado ao organizador B, mesmo sendo impactado pela migração (o evento passa a ser de B e a comissão continua atrelada ao evento).

### 2. **`leader_commissions`** (histórico de comissões)

- **Tabela:** `leader_commissions` (migration 030).
- **Campos relevantes:** `leader_id`, `event_id`, entre outros.
- **Uso:** histórico de comissões (pending/paid/cancelled) por inscrição/líder/evento.
- **Situação na migração:** não é usada para coleta de líderes. Em tese, líderes que já geraram comissão para o evento poderiam ser considerados “impactados”; hoje não entram na lista.

### 3. **`organizer_group_leaders`** (lista do organizador de origem)

- **Tabela:** `organizer_group_leaders` (migration 077).
- **Uso:** lista de líderes que o organizador “adicionou” à sua conta (ex.: `getOrganizerLeaders(organizerId)` em `groupLeadersService.ts`).
- **Situação na migração:** não é usada para **coleta** de líderes. A migração não faz “todos os líderes do organizador A que tenham alguma relação com o evento”; ela só considera os líderes já obtidos por cupons e convites. Assim, um líder que está na lista de A e tem **apenas** comissão no evento (sem cupom nem convite para esse evento) fica de fora.

---

## Motivo da divergência encontrada

- **Regra atual:** o relatório e o vínculo com B são baseados **exclusivamente** nos líderes retornados por `getLeaderIdsForEvent`, que hoje vêm só de:
  - **cupons** do evento (`coupons.leader_id` + `coupon_events`),
  - **convites** do evento (`leader_invitations`, status available/sent).
- **O que falta:** líderes que têm **apenas** configuração de comissão no evento (`leader_event_commissions` com `bonus_type` em `'commission'` ou `'both'`), sem cupom com `leader_id` e sem convite available/sent para esse evento, **nunca** entram na lista.
- **Efeito prático:** o relatório mostra menos “Líderes a vincular” (ou menos “reutilizados”/“mapeados”) do que o número real de líderes impactados pelo evento. No cenário do teste: 2 em vez de 3, por não contar o líder que só tem bônus de comissão.

---

## Confirmação: fonte real de cada linha do relatório

Todas as métricas abaixo usam **a mesma lista** de líderes: a saída de **`getLeaderIdsForEvent`**.

| Linha do relatório | Fonte real | Observação |
|--------------------|------------|------------|
| “Líderes já existentes no novo organizador” | Líderes dessa lista que já existem em `organizer_group_leaders` para B | Correto **dentro** da lista; a lista é que está incompleta. |
| “Líderes a vincular (passarão a aparecer na lista)” | Líderes dessa lista que não estão em B e não deram match por email/telefone; será feito INSERT em `organizer_group_leaders` | Subcontagem se houver líderes só em `leader_event_commissions`. |
| “Líderes mapeados para já existente” | Líderes dessa lista que não estão em B mas deram match por email/telefone com líder já em B | Idem. |

Ou seja: a **lógica** de classificação (reutilizado / vincular / mapeado) está consistente com a regra desejada; o problema é a **entrada** (quem entra na lista) estar restrita a cupons e convites.

---

## Separação conceitual no sistema (líder do cupom, convite, comissão, lista)

O sistema trata de fato conceitos diferentes; a migração hoje não os considera de forma uniforme:

| Conceito | Tabela(s) / origem | Usado na migração? |
|----------|--------------------|--------------------|
| Líder do cupom | `coupons.leader_id` + `coupon_events` | Sim (fonte 1 de `getLeaderIdsForEvent`). |
| Líder de convite | `leader_invitations.leader_id` (event_id, status available/sent) | Sim (fonte 2). |
| Líder de comissão (config) | `leader_event_commissions.leader_id` (event_id, bonus_type commission/both) | **Não.** |
| Líder listado no organizador | `organizer_group_leaders` (organizer_id, leader_id) | Não como **fonte** de coleta; só para “quem já está em B” e para INSERT. |

Ou seja: **líder de comissão** (configuração em `leader_event_commissions`) e **lista do organizador** não entram na formação da lista de líderes impactados pelo evento.

---

## Tabelas/queries que precisam entrar no cálculo

Para o relatório refletir **todos** os líderes impactados pela migração, a lista de `leader_id` considerada pela migração deve incluir, no mínimo:

1. **Já consideradas (manter):**
   - `coupons.leader_id` com `coupon_events` para o evento e `organizer_id = A`.
   - `leader_invitations.leader_id` para o evento com status em `('available','sent')`.

2. **Faltando (recomendação para correção futura):**
   - **`leader_event_commissions.leader_id`** onde `event_id = evento` (e, se houver filtro por organizador, `events.organizer_id = A`). Isso cobre líderes com bônus de comissão e/ou convite configurado por evento, mesmo sem cupom nem convite available/sent.

3. **Opcional (dependendo da regra de negócio):**
   - **`leader_commissions.leader_id`** onde `event_id = evento`: líderes que já têm comissão (paga/pendente) no evento.
   - **`organizer_group_leaders`** para o organizador A: união com “líderes da lista de A que tenham alguma relação com o evento” (por exemplo, via `leader_event_commissions` ou `leader_commissions`), para não deixar de fora um líder que A considera “dele” e que tem comissão no evento.

A inclusão de **`leader_event_commissions`** é a que resolve diretamente o caso observado (líder com bônus de comissão não contado).

---

## Cenário prático: comportamento esperado

**Configuração:** Organizador A possui 3 líderes impactados pelo evento:

- **Líder 1:** já está na lista do organizador B (`organizer_group_leaders` com B).
- **Líder 2:** tem convite (available ou sent) para o evento; não está em B.
- **Líder 3:** tem apenas bônus de comissão no evento (`leader_event_commissions` com esse evento, sem cupom nem convite para o evento); não está em B.

**Comportamento esperado do relatório:**

- “Líderes já existentes no novo organizador”: **1** (Líder 1).
- “Líderes a vincular (passarão a aparecer na lista)”: **2** (Líder 2 e Líder 3).
- “Líderes mapeados para já existente”: **0** (nenhum mapeado por email/telefone nesse exemplo).

**Comportamento atual (por causa da coleta atual):**

- Só Líder 1 e Líder 2 entram em `getLeaderIdsForEvent` (cupons + convites). Líder 3 não entra.
- Resultado típico: “Líderes já existentes: 1”, “Líderes a vincular: 1” (só Líder 2). O “2” no teste sugere que há dois líderes vindos de cupom/convite; o terceiro (comissão) não aparece.

**Resumo:** o ajuste necessário é incluir na coleta os `leader_id` de `leader_event_commissions` para o evento, para que Líder 3 entre na lista e seja classificado como “a vincular” (ou “reutilizado”/“mapeado”, conforme o caso).

---

## Risco de migração parcial e relatório incompleto

- **Migração em si (dados):** a migração altera evento, cupons, convites, `organizer_group_leaders` etc. Ela **não** altera `leader_event_commissions` (a tabela não é tocada no serviço atual). Os registros de comissão por evento continuam com o mesmo `leader_id` e `event_id`. O evento passa a ser do organizador B; para B “ver” e usar essas comissões, o líder precisa estar em `organizer_group_leaders` para B.
- **Risco:** se um líder só existe em `leader_event_commissions` para o evento e não é incluído em `getLeaderIdsForEvent`, ele **não** será vinculado a B. Após a migração, B pode não ver esse líder na lista e a configuração de comissão do evento continua associada a um líder que não está na lista de B, gerando inconsistência de visibilidade e possível falha em fluxos que assumem “líder do evento está na lista do organizador”.
- **Relatório:** o relatório fica **incompleto** (subconta “Líderes a vincular” e possivelmente “reutilizados”/“mapeados”), e o usuário não tem visibilidade de que um líder com bônus de comissão também será (ou deveria ser) impactado.

Portanto: **sim**, existe risco de a migração “funcionar” em parte (evento, cupons, convites, líderes que vêm de cupom/convite) e o relatório estar incompleto e não refletir líderes com bônus de comissão.

---

## O que já está correto

- Classificação dos líderes **já coletados** em “já existentes”, “a vincular” e “mapeados” está alinhada com a regra da UI (`organizer_group_leaders`).
- Uso de cupons e convites como fontes de líderes está coerente com o desenho atual.
- Inclusão de `leader_event_commissions` no serviço de migração **não** foi feita (escopo desta auditoria é só documentar).

---

## O que está incompleto

- **Coleta de líderes:** não inclui `leader_event_commissions` (nem `leader_commissions` nem lista do organizador A como fonte).
- **Relatório:** subconta líderes impactados quando há líderes só com bônus de comissão (e possivelmente outros casos que dependem de tabelas não consideradas).
- **Vínculo com B:** líderes que só aparecem em `leader_event_commissions` para o evento não são inseridos em `organizer_group_leaders` para B, podendo ficar “invisíveis” para B após a migração.

---

## Recomendações para correção futura (sem implementar)

1. **Incluir `leader_event_commissions` na coleta de líderes**
   - Em `getLeaderIdsForEvent` (ou equivalente), somar aos `leader_id` já obtidos os `leader_id` distintos de `leader_event_commissions` onde `event_id = evento` (e, se aplicável, evento do organizador A).
   - Garantir que a lista passada a `resolveLeadersForMigration` seja a união (cupons + convites + leader_event_commissions), sem duplicar contagens.

2. **Revisar necessidade de outras fontes**
   - Avaliar se `leader_commissions` (histórico) e/ou “lista do organizador A” devem entrar na coleta para algum critério específico (ex.: “todos os líderes de A que tenham qualquer relação com o evento”).

3. **Migração de dados em `leader_event_commissions`**
   - Avaliar se, ao migrar o evento para B, é necessário atualizar algo em `leader_event_commissions` (ex.: auditoria, ou garantia de que todos os líderes referenciados estejam em `organizer_group_leaders` para B). Hoje a tabela não é alterada; o que falta é garantir que os líderes sejam vinculados a B via `organizer_group_leaders`.

4. **Rollback**
   - Se no futuro a migração passar a alterar `leader_event_commissions` ou a lógica de vínculo de líderes de comissão, incluir no rollback a reversão dessas alterações.

5. **Testes**
   - Cenário com 3 líderes (1 já em B, 1 por convite, 1 só por comissão): após a correção, o relatório deve mostrar “Líderes a vincular: 2” e, após a migração, os 3 líderes devem estar corretamente refletidos (1 já em B, 2 vinculados a B conforme a regra).

---

## Referência rápida: arquivos e funções

| Área | Arquivo | Função / trecho relevante |
|-----|---------|---------------------------|
| Migração – coleta de líderes | `backend/src/services/changeEventOrganizerService.ts` | `getLeaderIdsForEvent` (linhas ~559–585) |
| Migração – resolução e relatório | `backend/src/services/changeEventOrganizerService.ts` | `resolveLeadersForMigration` (~634–715), uso do resultado no dry run e na execução real |
| Migração – cupons | `backend/src/services/changeEventOrganizerService.ts` | `loadEventCoupons`, `migrateCoupons` |
| Migração – convites | `backend/src/services/changeEventOrganizerService.ts` | `migrateInvitations`, `countOrphanInvitations` |
| Listagem de líderes do organizador | `backend/src/services/groupLeadersService.ts` | `getOrganizerLeaders` |
| Comissões por evento | `backend/src/services/leaderEventCommissionsService.ts` | `getLeaderEventCommissionsByEvent`, `getLeaderEventCommissions`, `createLeaderEventCommission` |
| Cupons (geral) | `backend/src/services/changeEventOrganizerService.ts` (e poss. `couponsService`) | `loadEventCoupons` usa `coupons` + `coupon_events` |
| Convites | Tabela `leader_invitations`; migração em `changeEventOrganizerService.ts` | `migrateInvitations` |

---

**Documento apenas de investigação/auditoria. Nenhuma alteração de código ou migration foi realizada.**
