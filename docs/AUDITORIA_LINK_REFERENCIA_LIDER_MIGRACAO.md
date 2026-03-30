# Auditoria técnica: Link de referência "Sem link" após migração de organizador

**Objetivo:** Investigar por que um líder que possuía somente bônus por comissão fica com "Sem link" na tela "Comissões por Evento" após a migração de organizador do evento.  
**Escopo:** Apenas análise e documentação; sem alteração de código, migrations ou correções.

---

## 1. Onde a tela "Comissões por Evento" busca os dados

### 1.1 Componente frontend

| Item | Valor |
|------|--------|
| **Componente** | `LeaderEventCommissions` |
| **Arquivo** | `src/components/organizer/LeaderEventCommissions.tsx` |
| **Uso** | Usado em `GroupLeaderDetails.tsx` (admin) na aba "Comissões por Evento" e no fluxo do organizador em `OrganizerGroupLeaders` (detalhes do líder). |

A tela carrega as comissões com:

```ts
const response = await getLeaderEventCommissions(leaderId, isAdmin);
```

e exibe o link na coluna "Link de referência" assim:

```tsx
{commission.coupon?.link ? (
  // ... exibe code + botões Copiar / Abrir
) : (
  <span className="text-xs text-muted-foreground">Sem link</span>
)}
```

Ou seja: **"Sem link"** aparece quando `commission.coupon` é `null` ou `commission.coupon.link` não existe.

### 1.2 Endpoint / backend

| Item | Valor |
|------|--------|
| **Organizer** | `GET /api/organizer/group-leaders/:id/event-commissions` |
| **Admin** | `GET /api/admin/group-leaders/:id/event-commissions` |
| **Controller** | `getLeaderEventCommissionsController` em `backend/src/controllers/leaderEventCommissionsController.ts` (aprox. linhas 287–320) |

O controller chama:

```ts
const commissions = await getLeaderEventCommissions(
  leaderId,
  isAdmin ? undefined : req.user.id   // organizerId = undefined para admin, req.user.id para organizador
);
```

### 1.3 Service / query responsável

| Item | Valor |
|------|--------|
| **Service** | `getLeaderEventCommissions(leaderId, organizerId?)` |
| **Arquivo** | `backend/src/services/leaderEventCommissionsService.ts` (aprox. linhas 77–287) |

Fluxo resumido:

1. **Query de comissões:**  
   `SELECT ... FROM leader_event_commissions lec JOIN events e ON lec.event_id = e.id WHERE lec.leader_id = $1 [AND e.organizer_id = $2]`  
   Quando `organizerId` é passado (organizador logado), só entram comissões cujo evento pertence a esse organizador.

2. **Busca de cupons:**  
   `getCouponsByLeader(leaderId, organizerId)` — em `backend/src/services/couponsService.ts` (aprox. linhas 239–265).  
   Query: `SELECT * FROM coupons WHERE leader_id = $1 [AND organizer_id = $2]`.  
   Com `organizerId` definido, só retorna cupons daquele organizador.

3. **Enriquecimento:**  
   Para cada comissão, o service tenta associar um cupom da lista (por evento + código contendo ID da comissão ou nome; com fallback para “único cupom do evento”).  
   Se encontrar `coupon` e `leader`, monta o objeto `commission.coupon` com `id`, `code`, `link`, etc.

### 1.4 Origem do campo "link de referência"

O **link não é armazenado em banco**. É **montado no backend** em `leaderEventCommissionsService.ts` (aprox. linhas 261–279):

```ts
if (coupon && leader) {
  let baseUrl = process.env.FRONTEND_URL ... ;
  const eventPath = (commission as any).event_slug
    ? `/evento/${(commission as any).event_slug}`
    : `/events/${commission.event_id}`;
  enriched.coupon = {
    id: coupon.id,
    code: coupon.code,
    link: `${baseUrl}${eventPath}?ref=${leader.referral_code}&cupom=${coupon.code}`,
    ...
  };
}
```

Ou seja, o "link de referência" vem de:

- **Base URL** do front (env)
- **Caminho do evento:** `event_slug` (ou `event_id`) vindo da query de comissões (tabela `events`)
- **Query string:** `ref=` + `leader.referral_code` (tabela `group_leaders`) e `cupom=` + `coupon.code` (tabela `coupons`)

O front só exibe `commission.coupon.link`; se não houver `coupon` associado à comissão, mostra "Sem link".

---

## 2. Origem real do link de referência

Resumo:

| Fonte | Usado no link? | Observação |
|-------|----------------|------------|
| **leader_event_commissions** | Indiretamente | Fornece `event_id` e identifica a comissão; o link em si não vem da tabela. |
| **coupons** | Sim | `coupon.code` é obrigatório na URL (`cupom=`). Sem cupom encontrado para a comissão, não há `enriched.coupon` → "Sem link". |
| **group_leaders** | Sim | `leader.referral_code` é usado em `ref=`. |
| **events** | Sim | `event_slug` ou `event_id` define o path (`/evento/:slug` ou `/events/:id`). |
| **leader_invitations** | Não | Não entram na montagem do link. |
| **registrations** | Não | Não entram na montagem do link. |

Conclusão: o link é **calculado** no backend a partir de `coupons.code`, `group_leaders.referral_code` e `events.slug`/`events.id`. A condição para **não** aparecer "Sem link" é existir um **cupom** associado àquela comissão (encontrado por `getCouponsByLeader` e pela lógica de matching no service).

---

## 3. O que a migração altera e o que não altera

Com base em `backend/src/services/changeEventOrganizerService.ts`:

| Entidade | Alteração na migração | Relevância para o link |
|----------|------------------------|-------------------------|
| **events** | `UPDATE events SET organizer_id = B WHERE id = event_id` | Evento passa a ser de B; a tela de comissões do organizador B passa a listar essa comissão. |
| **leader_event_commissions** | Nenhuma (não há UPDATE/DELETE/INSERT). | Comissão continua igual; não guarda link. |
| **coupons** (exclusivos) | `UPDATE coupons SET organizer_id = B, leader_id = ... WHERE id = ...` para cupons com `event_count = 1`. | Cupom da comissão (geralmente exclusivo) passa a ser de B; `getCouponsByLeader(leaderId, B)` o encontra. |
| **coupons** (compartilhados) | Novo registro em `coupons` para B (com `code` possivelmente alterado, ex.: `_MIGRADO_` + sufixo) e inserção em `coupon_events`; remoção do vínculo do cupom antigo com o evento. | Cupom “novo” em B pode ter `code` diferente; o matching no service usa `code` contendo ID da comissão. |
| **coupon_events** | Exclusivos: não alterados. Compartilhados: INSERT (novo cupom + evento), DELETE (cupom antigo + evento). | Garante que o cupom (antigo ou novo) em B continue vinculado ao evento. |
| **organizer_group_leaders** | INSERT para vincular líder a B. | Líder passa a aparecer na lista de líderes de B. |
| **leader_invitations** | Atualização de `leader_id` (mapeamento) e reassociação ao organizador. | Não impacta o link da comissão. |

O que precisa estar correto para o link funcionar após a migração:

1. O **cupom** da comissão deve existir **sob o organizador B** (movido se exclusivo, ou duplicado se compartilhado).
2. Esse cupom deve ser **retornado** por `getCouponsByLeader(leaderId, B)` (ou seja, `organizer_id = B`, `leader_id` correto).
3. O **matching** no `leaderEventCommissionsService` deve **associar** esse cupom à comissão (por evento + código ou fallback).

Se qualquer um desses pontos falhar, a comissão vem sem `coupon` e a tela mostra "Sem link".

---

## 4. Por que o líder "somente comissão" pode ficar sem link

### 4.1 Dependência do link em relação ao cupom

- Na criação da comissão (`createLeaderEventCommissionController`), é criado um **cupom** associado (código contendo os primeiros 8 caracteres do ID da comissão).  
- Esse cupom é **exclusivo** do evento (um evento por cupom na criação).  
- O link só é montado quando há `coupon` e `leader`; sem cupom encontrado → "Sem link".

Portanto, mesmo um líder “somente comissão” (sem convite/cupom compartilhado) **depende desse cupom** para ter link.

### 4.2 Possíveis causas do "Sem link" após a migração

1. **Cupom ainda sob o organizador antigo (A)**  
   - Se o cupom da comissão **não** for migrado para B (não estiver em `loadEventCoupons` ou não for atualizado/duplicado), continua com `organizer_id = A`.  
   - Na tela do organizador B: `getCouponsByLeader(leaderId, B)` não retorna cupons de A → nenhum cupom associado → "Sem link".  
   - Cenário plausível se, por algum bug ou regra, o cupom da comissão não for considerado “do evento” (ex.: não estar em `coupon_events` para esse `event_id`) ou não for cupom do organizador A.

2. **Cupom compartilhado com código alterado e matching falhando**  
   - Se o cupom for compartilhado (`event_count > 1`), a migração **duplica** o cupom para B e pode alterar o `code` (ex.: sufixo `_MIGRADO_`).  
   - O matching no service prioriza cupons cujo `code` **contém** os primeiros 8 caracteres do ID da comissão.  
   - Se o novo `code` não contiver esse trecho, o match principal falha; o fallback usa “único cupom do evento” ou “primeiro dos vários”. Se houver vários cupons para o mesmo evento em B e o errado for escolhido, ou se por algum motivo o cupom novo não tiver `event_ids` corretos, o matching pode não associar o cupom certo → "Sem link".

3. **Comissão criada sem cupom**  
   - O controller usa try/catch na criação do cupom; se der falha, a comissão é salva mas o cupom pode não existir.  
   - Nesse caso, antes da migração já não haveria link; se o usuário lembra de “ter link antes”, pode ser outro contexto (ex.: admin, outro evento/comissão).

4. **Contexto de visualização (admin x organizador)**  
   - **Admin:** `organizerId = undefined` → comissões de todos os eventos e cupons de todos os organizadores. Pode aparecer um cupom ainda em A e montar o link.  
   - **Organizador B:** `organizerId = B` → só cupons com `organizer_id = B`. Se o cupom não foi migrado para B, não há link.  
   - Isso explica “antes tinha link” (visto como admin ou como A) e “depois Sem link” (visto como B).

5. **Nada depende diretamente do `organizer_id` antigo na URL**  
   - O link em si não usa `organizer_id`; usa `event_slug`, `referral_code` e `coupon.code`.  
   - O que depende do organizador é **qual conjunto de cupons** é usado: `getCouponsByLeader(leaderId, organizerId)` filtra por `organizer_id`.

Conclusão provável: o "Sem link" para o líder somente comissão ocorre porque, na visão do **novo organizador B**, o cupom da comissão **não está sendo encontrado** — ou não foi migrado para B, ou não está sendo associado à comissão pelo matching (ex.: código alterado em cupom compartilhado).

---

## 5. Comparação entre cenários

| Cenário | Cupom na migração | Após migração (visão organizador B) |
|---------|-------------------|------------------------------------|
| **Líder com cupom exclusivo** | UPDATE: mesmo cupom passa a `organizer_id = B`, `code` inalterado. | Cupom em B com mesmo `code`; matching por `commissionIdShort` no código tende a funcionar → link tende a funcionar. |
| **Líder com convite** | Convites são atualizados (leader_id, etc.); cupom da comissão (se existir) segue regra acima. | Igual ao da comissão: depende de o cupom da comissão estar em B e ser encontrado. |
| **Líder com comissão por evento** | Comissão não é alterada; cupom da comissão (criado na criação da comissão) é exclusivo → UPDATE para B. | Se o cupom foi realmente migrado (incluído em `loadEventCoupons` e atualizado), link deve funcionar. Se não for migrado, "Sem link". |
| **Líder com comissão + cupom compartilhado** | Cupom compartilhado é **duplicado** para B, com possível novo `code`. | Cupom novo em B pode não conter o ID da comissão no `code` → matching principal falha; depende do fallback (único cupom do evento) → pode funcionar ou não. |

Resumo:

- **Link continua funcionando:** quando o cupom da comissão está em B e é corretamente associado (ex.: exclusivo com mesmo `code`, ou compartilhado com fallback correto).
- **Link deixa de funcionar:** quando (1) o cupom não está em B (não migrado), ou (2) está em B mas o matching não o associa à comissão (ex.: código alterado e fallback insuficiente).

O líder “somente comissão” entra no caso em que o cupom deveria ser exclusivo e movido para B; se ainda assim aparece "Sem link", a hipótese mais forte é que esse cupom não está sendo migrado ou não está sendo retornado/associado na consulta do organizador B.

---

## 6. Queries e tabelas envolvidas

### 6.1 Arquivos analisados

| Arquivo | Uso |
|---------|-----|
| `src/components/organizer/LeaderEventCommissions.tsx` | Tela "Comissões por Evento"; exibe `commission.coupon?.link` ou "Sem link". |
| `src/lib/api/leaderEventCommissions.ts` | `getLeaderEventCommissions(leaderId, isAdmin)` → GET organizer ou admin. |
| `backend/src/controllers/leaderEventCommissionsController.ts` | `getLeaderEventCommissionsController`; chama service com `organizerId = req.user.id` ou `undefined`. |
| `backend/src/services/leaderEventCommissionsService.ts` | `getLeaderEventCommissions`; query comissões, chama `getCouponsByLeader`, matching e montagem do `link`. |
| `backend/src/services/couponsService.ts` | `getCouponsByLeader(leaderId, organizerId?)`; `getCouponEventIds`. |
| `backend/src/services/changeEventOrganizerService.ts` | `loadEventCoupons`, `migrateCoupons` (UPDATE exclusivos, INSERT compartilhados). |

### 6.2 Funções analisadas

| Função | Arquivo | Papel |
|--------|---------|--------|
| `getLeaderEventCommissions(leaderId, organizerId?)` | leaderEventCommissionsService.ts | Busca comissões, busca cupons, enriquece com `coupon` e `link`. |
| `getCouponsByLeader(leaderId, organizerId?)` | couponsService.ts | Lista cupons do líder, opcionalmente filtrados por organizador. |
| `loadEventCoupons(client, eventId, organizerFrom)` | changeEventOrganizerService.ts | Cupons do evento do organizador A para migração. |
| `migrateCoupons(...)` | changeEventOrganizerService.ts | Atualiza exclusivos (organizer_id/leader_id); duplica compartilhados para B. |

### 6.3 Tabelas envolvidas

| Tabela | Campos relevantes | Uso no link / migração |
|--------|--------------------|-------------------------|
| **leader_event_commissions** | id, leader_id, event_id, commission_percentage, bonus_type, ... | Identifica a comissão; não armazena link. |
| **events** | id, organizer_id, slug | organizer_id filtra comissões; slug (ou id) entra no path do link. |
| **coupons** | id, organizer_id, leader_id, code, ... | organizer_id define “de quem” é o cupom; code entra na URL; migração altera organizer_id ou insere novo registro. |
| **coupon_events** | coupon_id, event_id | Vincula cupom ao evento; usado no matching e na migração. |
| **group_leaders** | id, user_id, referral_code | referral_code usado em `ref=` no link. |

### 6.4 Queries principais

**Comissões do líder (com filtro de organizador):**

```sql
SELECT lec.id, lec.leader_id, lec.event_id, ..., e.title as event_title, e.slug as event_slug, e.organizer_id
FROM leader_event_commissions lec
JOIN events e ON lec.event_id = e.id
WHERE lec.leader_id = $1 AND e.organizer_id = $2
ORDER BY e.event_date DESC, e.title ASC
```

**Cupons do líder (com filtro de organizador):**

```sql
SELECT * FROM coupons WHERE leader_id = $1 AND organizer_id = $2
ORDER BY created_at DESC
```

(event_ids são obtidos depois via `getCouponEventIds` em `coupon_events`.)

**Cupons do evento para migração:**

```sql
WITH event_coupons AS (
  SELECT c.id, c.code, ..., (SELECT COUNT(*) FROM coupon_events ce2 WHERE ce2.coupon_id = c.id) AS event_count
  FROM coupons c
  INNER JOIN coupon_events ce ON ce.coupon_id = c.id AND ce.event_id = $1
  WHERE c.organizer_id = $2
)
SELECT ... FROM event_coupons
```

---

## 7. Conclusão objetiva

### 7.1 Causa do "Sem link"

- O link é **montado no backend** somente quando existe um **cupom** associado à comissão (encontrado por `getCouponsByLeader(leaderId, organizerId)` e pela lógica de matching).
- Para o **organizador B**, `organizerId = B`, então só entram cupons com `organizer_id = B`.
- **"Sem link"** significa que, na visão do organizador B, **nenhum cupom** foi encontrado ou associado àquela comissão.

### 7.2 Dado faltando ou inconsistente

- **Faltando:** um cupom com `organizer_id = B` e `leader_id` do líder que seja corretamente **associado** à comissão (por evento + código ou fallback).
- **Inconsistência possível:** o cupom da comissão (criado na criação da comissão, em tese exclusivo) não estar sendo migrado para B (não incluído em `loadEventCoupons` ou não atualizado), ou estar sendo duplicado com `code` alterado de forma que o matching não o associe mais à comissão.

### 7.3 O que precisará ser ajustado

- **Migração (backend):** Garantir que todo cupom ligado ao evento e ao líder (incluindo os criados automaticamente para comissões) seja considerado em `loadEventCoupons` e migrado para B (UPDATE se exclusivo, duplicação se compartilhado), preservando ou ajustando o `code` de forma que o matching no service continue encontrando o cupom da comissão.
- **Service de comissões (backend):** Revisar o matching comissão–cupom quando o `code` foi alterado na migração (ex.: cupons compartilhados com sufixo `_MIGRADO_`), para que o fallback “único cupom do evento” ou “por evento” associe corretamente o cupom migrado à comissão.

### 7.4 Backend apenas ou backend + frontend?

- **Backend apenas.** O frontend apenas exibe `commission.coupon?.link` ou "Sem link"; não calcula o link. Resolver a migração dos cupons e o matching no `leaderEventCommissionsService` deve ser suficiente para o link voltar a aparecer.

---

**Fim do relatório de auditoria.**
