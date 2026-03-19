# Plano técnico: auditoria e correção controlada de vendas/inscrições e convites após migração de organizador

**Versão:** 1.2 (plano apenas — sem implementação)  
**Contexto:** Em produção, após migrar um evento em andamento, o número de inscrições/vendas exibido ou usado para bônus ficou inflado, gerando convites em excesso para líderes (ex.: painel mostra uma quantidade; em evento > inscrições aparecem 100+ convites).  
**Princípio:** Antes de qualquer correção em massa, garantir leitura, diagnóstico e relatório; depois dry run e aplicação em **um único evento**; em paralelo, corrigir a **causa raiz no código** para o problema não voltar.

**Frente 0 (pré-requisito):** Antes da Frente 1, executar a leitura funcional do comportamento atual do bônus de convite no código — ver **`docs/FRONTE_0_AUDITORIA_FUNCIONAL_BONUS_CONVITE.md`** (gatilhos, contagens, telas globais vs por evento, riscos de reprocessamento).

---

## Visão geral: três frentes obrigatórias

A implementação deve ser planejada e executada em **três frentes distintas**, sem confundir escopo:

| Frente | Objetivo | Quando |
|--------|----------|--------|
| **1 — Auditoria dos dados + simulador técnico** | Somente leitura; **simulador** que reproduz o cálculo **atual** vs **canônico esperado** sem escrita; divergências, entidades afetadas, log técnico para backend. | **Sempre primeiro.** Nenhum script de correção de dados sem conclusão desta fase. |
| **2 — Correção controlada do evento** | Ajustar dados (ex.: reduzir convites `available` em excesso) com `event_id` obrigatório, opcionalmente `leader_id`, transação, dry_run + apply, três relatórios (antes / plano / depois). | Depois da auditoria e, idealmente, após ou junto com mitigação da frente 3. |
| **3 — Causa raiz no código** | Identificar e corrigir bugs ou comportamentos (ex.: contagem sem cupom, disparo múltiplo de bônus, JOIN que multiplica linhas) para **o problema não se repetir** após deploy. | Em paralelo ou imediatamente após evidência na auditoria; **obrigatório** antes de considerar o incidente encerrado. |

**Regra de ouro:** corrigir só dados (frente 2) sem corrigir código (frente 3) arrisca **recriar** convites indevidos assim que webhooks, painel ou jobs rodarem de novo.

---

## 1. Problema

- Divergência entre **totais esperados** (inscrições pagas elegíveis por líder/comissão) e **totais efetivos** usados pelo sistema para conceder bônus de convite.
- **Convites em excesso** em `leader_invitations` (principalmente `available`, possivelmente também `sent`).
- Possível **divergência entre telas**: painel do líder vs. fluxo “evento > inscrições” (filtros, agregações ou fontes de dados diferentes).
- Risco de **processamento duplicado** (webhooks, carregamento de comissões, reexecução de lógica de bônus) após migração.

---

## 2. Hipóteses de causa raiz (a validar na auditoria — frente 1 + evidência na frente 3)

| # | Hipótese | Mecanismo provável |
|---|-----------|-------------------|
| H1 | **Filtro de cupom ausente no bônus** | Após migração, `getCouponByEventCommission` / matching cupom–comissão falha → `checkAndGrantInvitationBonus` usa `coupon_code` indefinido → `getRegistrationsByLeaderCoupons` conta **todas** as inscrições pagas do líder no evento, não só as do cupom da comissão → `expectedBonuses` inflado. |
| H2 | **Cupom duplicado / código alterado** | Cupom compartilhado migrado com sufixo `_MIGRADO_`; várias linhas em `coupons` para o mesmo líder/evento; contagem ou EXISTS em consultas passa a incluir mais inscrições do que o desejado. |
| H3 | **Contagem dupla cupom + referral** | `getRegistrationsByLeaderCoupons` une inscrições por cupom do líder **OU** `user_referrals`; com `SELECT DISTINCT r.id` o efeito é mitigado para uma linha por inscrição, mas cenários com dados inconsistentes merecem auditoria linha a linha com **origem** explícita. |
| H4 | **Disparo repetido de concessão** | `checkAndGrantInvitationBonus` é chamado em vários pontos; se a contagem de “já concedidos” divergir ou houver corrida, podem ser criados convites extras. A auditoria deve **inferir** repetição (timestamps, logs, contagem vs esperado). |
| H5 | **Migração de convites** | `UPDATE` em `leader_invitations` combinado com reprocessamento de bônus pode gerar duplicação percebida ou contagem inconsistente. |
| H6 | **UI / agregação** | Painel por comissão/evento vs lista **global** de convites do líder — o relatório deve **separar** explicitamente os dois escopos. |

Nenhuma hipótese deve ser tratada como verdade até a **auditoria** cruzar números com o banco e, quando aplicável, **stack traces / pontos de chamada** na frente 3.

---

## 3. Pontos do sistema envolvidos (mapeamento — frentes 1 e 3)

### 3.1 Cálculo de “vendas” / inscrições atribuíveis ao líder

| Local | Arquivo | Função / trecho |
|-------|---------|------------------|
| Query principal | `backend/src/services/leaderRegistrationsService.ts` | `getRegistrationsByLeaderCoupons(leaderId, { event_id, payment_status, coupon_code })` — cupom do líder (EXISTS em `coupons`) **ou** `user_referrals`; `DISTINCT` em `r.id`. |
| Uso no bônus | `backend/src/services/leaderBonusService.ts` | `checkAndGrantInvitationBonus` — obtém cupom via `getCouponByEventCommission`; chama `getRegistrationsByLeaderCoupons` com ou sem `coupon_code`. |
| Cupom por comissão | `backend/src/services/couponsService.ts` | `getCouponByEventCommission` — matching por ID da comissão no `code`, evento, etc. |

### 3.2 Geração de convites

| Local | Arquivo | Função |
|-------|---------|--------|
| Concessão de bônus | `backend/src/services/leaderBonusService.ts` | `checkAndGrantInvitationBonus` — `expectedBonuses = floor(paidCount / required_purchases)`; compara com `timesGranted`. |
| Criação do registro | `backend/src/services/leaderInvitationsService.ts` (import dinâmico) | `createInvitationFromBonus` após `createRegistration` (`free_bonus`). |
| Outros gatilhos | `registrationsController.ts`, `registrationBonusService.ts`, `asaasWebhookController.ts`, `expiredRegistrationsService.ts` | Mapear todas as chamadas à rotina de bônus (frente 3). |

### 3.3 Listagem de convites — painel do líder

| Local | Arquivo | Comportamento |
|-------|---------|----------------|
| API | `leaderInvitationsController.ts` | `getMyInvitationsController` → `getLeaderInvitations(leader.id)`. |
| Service | `leaderInvitationsService.ts` | `getLeaderInvitations`: **todos** os convites do líder, **todos os eventos**. |

### 3.4 Listagem em contexto evento / inscrições (organizador)

| Local | Observação |
|-------|------------|
| `OrganizerRegistrations.tsx` | Inscrições do evento; atrelamento a comissão. |
| `GroupLeaderDetails.tsx`, `LeaderEventCommissions.tsx` | Métricas de `getLeaderEventCommissions`. |

### 3.5 Sincronização ao carregar comissões

| Local | Arquivo | Risco |
|-------|---------|--------|
| `leaderEventCommissionsService.ts` | Loop `checkAndGrantInvitationBonus` ao listar comissões — possível concessão em toda leitura da API. |

### 3.6 Migração de organizador

| Local | Arquivo |
|-------|---------|
| `changeEventOrganizerService.ts` | `migrateInvitations`, `migrateCoupons`, etc. |

---

## 4. Frente 1 — Fase 1: Auditoria e simulador técnico (sem escrita; sem correção de dados)

**Entrega:** script ou endpoint **admin-only** (ou “Configurações > Avançados”) que executa **(a)** auditoria em modo somente leitura e **(b)** **simulador de cálculo** que reproduz o comportamento **atual** do sistema para um `event_id` (e opcionalmente `leader_id`) **sem gravar nada no banco**.

**Proibições explícitas nesta fase**

- Nenhum `INSERT` / `UPDATE` / `DELETE` em tabelas de negócio (`registrations`, `leader_invitations`, `coupons`, etc.).  
- Nenhuma “correção preventiva” ou ajuste de dados — isso é **Frente 2**.  
- O simulador opera apenas com **leitura** + **cálculo em memória** (ou serialização em arquivo de saída).

**Objetivos da Fase 1**

1. **Medir a divergência** entre o **cálculo atual** (equivalente ao que `checkAndGrantInvitationBonus` / `getRegistrationsByLeaderCoupons` / `getCouponByEventCommission` produziriam hoje) e o **cálculo canônico esperado** (regra de negócio acordada para “o que deveria contar” para cada `commission_id` — tipicamente inscrições pagas, não canceladas, no evento, **atribuídas ao cupom da comissão**; exclusões explícitas documentadas no relatório).  
2. **Apontar entidades afetadas:** `registration_ids`, `coupon_id`/`coupon_code`, `leader_id`, `commission_id`, `leader_invitations.id` (para leitura apenas), e relações entre elas.  
3. Produzir artefatos que orientem a **Frente 3** (fix da causa raiz no backend) e, quando necessário, parametrizem a **Frente 2** (correção controlada de dados).

---

### 4.1 Simulador técnico de cálculo (sem escrita)

O simulador é **obrigatório** além da auditoria estática. Ele deve:

| Etapa | Descrição |
|-------|-----------|
| **S1 — Espelhar produção (“atual”)** | Para cada par relevante `(leader_id, commission_id)` com `bonus_type ∈ ('invitation','both')`, reproduzir a lógica atual: resolver cupom como `getCouponByEventCommission` (mesma ordem de fallback, se aplicável); chamar critério equivalente a `getRegistrationsByLeaderCoupons(leaderId, { event_id, payment_status: 'paid', coupon_code? })` **exatamente como o código faria** (com e sem `coupon_code` conforme o resultado do cupom). Calcular `paidCount_atual`, `expectedBonuses_atual = floor(paidCount_atual / required_purchases)`. |
| **S2 — Calcular canônico (“correto”)** | Aplicar a **regra esperada** explícita no relatório (ex.: só inscrições com `coupon_code` igual ao cupom da comissão **e** cupom pertencente ao líder **e** evento; exclusão de referral para esta comissão se a regra de negócio assim definir). Produzir `paidCount_correto`, `expectedBonuses_correto`, listas de `registration_ids`. |
| **S3 — Comparar** | Conjuntos: `registration_ids_só_atual`, `registration_ids_só_correto`, interseção; deltas numéricos em `paidCount`, `expectedBonuses`, e confronto com `timesGranted` lido do banco (COUNT em `leader_invitations` com os mesmos status da produção: `available`, `sent`, `used`). |
| **S4 — Não mutar estado** | Nenhuma chamada a `checkAndGrantInvitationBonus`, `createRegistration`, `createInvitationFromBonus` na execução do simulador — apenas queries de leitura + funções puras / cópia local das queries. Se for inevitável reutilizar código de serviço, este deve ser refatorado na implementação para um **modo `dryRun: true`** que não persista (definir na Frente 3 se ainda não existir). |

**Resultado esperado do simulador:** para cada linha de comissão, ficar **explícito** se a inflação vem de **cupom não resolvido** (contagem ampla), **referral incluído indevidamente**, **cupom errado**, etc., cruzando com a classificação da seção 4.4.

---

### 4.2 Saídas obrigatórias da Fase 1

| # | Artefato | Público | Conteúdo mínimo |
|---|----------|---------|------------------|
| **O1** | **Relatório funcional** | Revisão manual (produto, operações, gestão) | Resumo executivo: evento, líderes no escopo, tabela comparativa `paidCount_atual` vs `paidCount_correto`, `expectedBonuses` vs convites existentes, lista curta de hipóteses confirmadas/refutadas, **avisos de escopo UI** (global vs evento). Formato: Markdown/PDF/HTML ou JSON com seção `human_summary`. |
| **O2** | **Log técnico estruturado** | Engenharia / **Cursor** para implementar Frente 3 | JSON (ou NDJSON) versionado com: `schema_version`, `event_id`, `generated_at`, por `leader_id`/`commission_id` os campos da seção 4.7, **arrays de IDs**, **passos S1–S3** do simulador, `error_classification` (4.4), `affected_entities` (mapa tipado: registrations, coupons, commissions, invitations, leaders), `recommended_code_touchpoints` (arquivos/funções sugeridos com base na classificação). Deve ser **parseável** e idempotente para reexecução. |
| **O3** | **Indicação clássica do erro** | Ambos | Preencher `error_classification` conforme §4.4 (pode ser multi-label). Obrigatório quando houver divergência `paidCount_atual ≠ paidCount_correto` ou `expectedBonuses_atual` incompatível com convites observados. |

**Importante:** nenhuma das saídas O1–O3 implica aplicação de correção de dados; apenas documentação e evidência.

---

### 4.3 Classificação obrigatória do erro (`error_classification`)

Preencher uma ou mais categorias quando a divergência for confirmada pelo simulador ou pela auditoria:

| Código | Significado | Evidência típica |
|--------|-------------|------------------|
| `migration_organizer` | Efeito colateral ou estado inconsistente após migração de organizador | Cupons duplicados/código `_MIGRADO_`, `organizer_id` desalinhado, convites com `migration_id` correlacionados a picos de criação. |
| `commission_coupon_matching` | Falha ou ambiguidade em `getCouponByEventCommission` / matching na UI de stats | `coupon_id` nulo no simulador “atual” mas cupom canônico existente; `paidCount_atual` >> `paidCount_correto`. |
| `bonus_reprocessing` | Rotina de bônus executada em excesso (leitura que grava, webhooks duplicados) | Janelas temporais com muitos `leader_invitations` criados sem novos pagamentos; Frente 0 — gatilhos em `getLeaderEventCommissions` / `getLeaderInvitationProgress`. |
| `wrongful_count_cupom_referral` | Contagem indevida via OR cupom/referral ou `registrationBonusService` | `registration_ids` entrando só por referral na meta que deveria ser só cupom; código de cupom ambíguo entre líderes. |
| `ui_scope_event_vs_global_leader` | Divergência **aparente** sem bug de dado | Totais globais de convites >> totais do evento; O1 deve deixar claro se não há bug de bônus. |

Estas categorias alimentam diretamente o campo `recommended_code_touchpoints` no log O2 (ex.: `commission_coupon_matching` → `couponsService.getCouponByEventCommission`, `leaderBonusService.checkAndGrantInvitationBonus`).

---

### 4.4 Pré-requisito antes de qualquer script de correção de dados (Frente 2)

A auditoria deve **obrigatoriamente** apontar, com evidência no relatório:

| # | O que identificar | Critério de sucesso |
|---|-------------------|---------------------|
| A | **Qual função/serviço está inflando a contagem** | Nome de arquivo + função (ex.: `checkAndGrantInvitationBonus` com `coupon_code` ausente; `getRegistrationsByLeaderCoupons` sem filtro esperado). |
| B | **Quais `registration_ids` estão sendo contados a mais** | Conjunto explícito: IDs que entram no `paidCount` “atual/produto” mas **não** entram no `paidCount` correto (definido na auditoria com cupom/comissão canônicos). |
| C | **Por qual origem cada inscrição entrou no cálculo** | Por registro: `cupom` \| `referral` \| `ambos` (se aplicável) \| `fora_do_escopo_comissão` — para cruzar com H3. |
| D | **Contagem do evento inteiro vs cupom/comissão correta** | Comparar `paidCount` com filtro de cupom da comissão vs sem filtro (equivalente a “todo o evento para aquele líder”); divergência grande indica H1. |
| E | **Rotina de bônus disparada mais de uma vez** | Evidência indireta: picos de `created_at` em `leader_invitations` + `bonus_registration_id`; logs de aplicação; ou instrumentação futura na frente 3. |

**Sem os itens A–E documentados no relatório, não prosseguir para `apply` na frente 2.**

### 4.5 Parâmetros da primeira execução

| Parâmetro | Obrigatoriedade |
|-----------|-----------------|
| `event_id` | **Obrigatório.** Execução **bloqueada** sem `event_id` (não permitir “todos os eventos” na v1). |
| `leader_id` | **Opcional.** Recomendado para **primeira validação** em produção: um líder problemático antes de expandir ao evento inteiro. |

### 4.6 Estrutura obrigatória do relatório (detalhamento por granularidade)

Para cada combinação analisada (no mínimo uma linha por **`leader_id` + `commission_id`** quando houver bônus de convite), o relatório deve conter:

| Campo | Descrição |
|-------|-----------|
| `leader_id` | UUID do líder. |
| `commission_id` | UUID da `leader_event_commissions` (ou `null` se N/A). |
| `coupon_id` | UUID do cupom canônico resolvido para aquela comissão (ou `null` se não resolvido). |
| `coupon_code` | Código usado na lógica canônica / espelhando produção. |
| `registration_ids_considerados_correto` | Lista de IDs que **deveriam** contar para a meta (regra auditada). |
| `registration_ids_considerados_como_producao` | Lista de IDs que o fluxo atual **equivalente** incluiria (simulação alinhada ao código hoje). |
| `registration_ids_excesso` | Diferença: em produção e não no correto. |
| `origem_por_registration_id` | Mapa ou lista aninhada: cada `registration_id` → `cupom` \| `referral` \| `ambos`. |
| `paidCount_correto` | Cardinalidade da lista “correto”. |
| `paidCount_atualmente_usado` | Cardinalidade da lista “como produção” / ou valor inferido do mesmo critério que `checkAndGrantInvitationBonus`. |
| `convites_esperados` | `floor(paidCount_correto / required_purchases)` (ajustar se regra de negócio evoluir). |
| `convites_existentes_por_status` | Objetos por `available`, `sent`, `used`, `expired`, outros — **apenas para este `event_id`**, `leader_id` e `commission_id`. |

### 4.7 Separação explícita no relatório: evento vs global

O relatório deve incluir **duas seções distintas** (não misturar totais):

1. **Convites deste evento** — `WHERE li.event_id = :event_id` (e opcionalmente `leader_id`). Usado para cruzar com metas e correção.  
2. **Convites globais do líder** — `WHERE li.leader_id = :leader_id` **sem** filtro de evento (espelha `getLeaderInvitations`). Usado para explicar divergência de UI (“100+” pode ser soma de vários eventos).

Incluir totais por status em cada seção.

### 4.8 Outras saídas e persistência

- Identificação do evento (`organizer_id`, título, etc.).  
- Universo de líderes no escopo (união de fontes, como na v1.0).  
- Hipóteses H1–H6 **ranqueadas** com referência aos campos do relatório e ao resultado do **simulador** (§4.1).  
- Persistência: arquivo **O1** + arquivo **O2** (JSON); opcional tabela append-only só para metadados do run (sem alterar negócio).

#### Esboço do log técnico O2 (para implementação / Cursor)

Estrutura mínima sugerida (campos podem ser aninhados):

```json
{
  "schema_version": "1.0",
  "event_id": "uuid",
  "leader_id_filter": "uuid | null",
  "generated_at": "ISO-8601",
  "simulator": {
    "steps": ["S1_mirror_production", "S2_canonical", "S3_compare"],
    "rows": []
  },
  "rows": [
    {
      "leader_id": "uuid",
      "commission_id": "uuid",
      "coupon_id": "uuid | null",
      "coupon_code": "string | null",
      "paidCount_atual": 0,
      "paidCount_correto": 0,
      "expectedBonuses_atual": 0,
      "expectedBonuses_correto": 0,
      "registration_ids_atual": [],
      "registration_ids_correto": [],
      "registration_ids_somente_atual": [],
      "registration_ids_somente_correto": [],
      "origem_por_registration_id": {},
      "convites_existentes_por_status": {},
      "timesGranted_db": 0
    }
  ],
  "invitations_scope": {
    "por_evento": {},
    "globais_por_lider": {}
  },
  "error_classification": ["commission_coupon_matching"],
  "affected_entities": {
    "registration_ids": [],
    "coupon_ids": [],
    "leader_ids": [],
    "commission_ids": [],
    "leader_invitation_ids": []
  },
  "recommended_code_touchpoints": [
    { "file": "backend/src/services/leaderBonusService.ts", "function": "checkAndGrantInvitationBonus", "reason": "…" }
  ],
  "prerequisite_A_E": { "A": "…", "B": [], "C": {}, "D": "…", "E": "…" }
}
```

---

## 5. Frente 2 — Correção controlada do evento (dados)

**Entrega:** script/rotina separada da auditoria/simulador, com **três saídas obrigatórias** e parâmetros alinhados à seção **4.5**. Os limites de convites a revogar na Frente 2 devem preferencialmente usar **`expectedBonuses_correto`** / `convites_esperados` derivados do **simulador (§4.1)**, não do cálculo inflado.

### 5.1 Garantias da primeira versão (escopo restrito)

| Regra | Detalhe |
|-------|---------|
| Prioridade | Ajustar **apenas convites `available` em excesso** em relação ao `convites_esperados` validado na auditoria. |
| Proibido na v1 | **Não** apagar automaticamente convites `used`. |
| Proibido na v1 | **Não** alterar inscrições `free_bonus` (nem cancelar, nem remover vínculos) — tratar em versão futura se necessário. |
| `sent` | Fora do escopo da v1 salvo decisão explícita de produto (documentar como “não aplicar na primeira versão”). |

### 5.2 Parâmetros e bloqueios

- **`event_id` obrigatório** — sem ele, o script **deve abortar** (erro claro).  
- **`leader_id` opcional** — quando informado, limitar plano de alteração àquele líder (validação incremental).  
- **Sem execução em lote na primeira versão** — um `event_id` por execução; lista de eventos ou “modo all” **bloqueado** ou inexistente na v1.

### 5.3 Modos

- **`dry_run` (padrão):** gera relatório **antes**, **plano de alteração** (lista de `leader_invitations.id` e ação proposta), e simula fim — **sem** `COMMIT`.  
- **`apply`:** só após `dry_run` revisado; exige **confirmação explícita** (ex.: `confirm: true` + string que inclua o `event_id`).

### 5.4 Três relatórios obrigatórios (saída do script de correção)

| Ordem | Nome | Conteúdo mínimo |
|-------|------|------------------|
| 1 | **Relatório antes** | Snapshot: contagens por `leader_id` / `commission_id` / status; IDs de `available` candidatos; mesmas métricas resumidas da auditoria para comparação. |
| 2 | **Plano de alteração** | Para cada linha afetada: `invitation_id`, `leader_id`, `commission_id`, `status` atual, ação (`UPDATE` status / revogação), ordem de aplicação; limites máximos por execução. |
| 3 | **Relatório depois** | Mesmo formato do “antes” + delta (o que mudou). |

Transação: `BEGIN` → aplicar apenas o plano → `COMMIT` ou `ROLLBACK`. Preferir `UPDATE` de status (ex.: `expired` / `revoked_by_reconciliation`) em vez de `DELETE`, para rollback lógico.

### 5.5 Log persistente

Registrar em tabela dedicada (ex.: `invitation_reconciliation_log`) ou anexo ao relatório: `event_id`, `leader_id` (se filtrado), executor, timestamp, hashes dos três relatórios.

---

## 6. Frente 3 — Identificação e correção da causa raiz no código

Objetivo: **impedir que o problema volte** após deploy e após a correção de dados.

- Com base nos itens **A–E** da seção **4.4**, no resultado do **simulador (§4.1)** e no **log O2 (§4.2)**, abrir tarefas de código (ex.: garantir cupom resolvido pós-migração; não chamar `checkAndGrantInvitationBonus` em loop desnecessário; idempotência com trava ou `migration_id`; testes de regressão).  
- **Ordem recomendada:** assim que a auditoria identificar o serviço inflador, priorizar fix na frente 3 **antes** ou **no mesmo deploy** que o `apply` da frente 2, para que a **validação pós-correção** (seção 7) não seja invalidada por nova inflação.

---

## 7. Validação pós-correção (obrigatória após `apply`)

Executar após o relatório **depois** da frente 2 e com o código da frente 3 já em produção (ou feature-flag desligando o comportamento errado):

| # | Verificação |
|---|-------------|
| V1 | **Número final de convites** (por `leader_id`, `commission_id`, status) **bate** com `convites_esperados` / `expectedBonuses_correto` da **Fase 1** (simulador + relatório; tolerância zero salvo regra explícita). |
| V2 | **Painel do líder** (`getLeaderEventCommissions` / stats) e **visão do evento** (organizador) ficam **coerentes** com os totais do banco para aquele `event_id` (e com a seção “convites deste evento” vs “globais” documentada). |
| V3 | **Rotina automática não recriou convites indevidos:** após janela acordada (ex.: 24–48 h), reexecutar **Fase 1** (auditoria + **simulador**, sem escrita) no mesmo `event_id` (e `leader_id` se aplicável) e comparar com o relatório “depois”; qualquer novo `available` além do esperado exige investigação imediata (frente 3 incompleta). |

---

## 8. Regras de segurança (checklist reforçado)

- [ ] **Três frentes** planejadas; não pular a frente 3.  
- [ ] **Sem `event_id` → execução bloqueada** (auditoria e correção).  
- [ ] **Sem lote** na primeira versão (um evento por execução).  
- [ ] Fase 1 concluída: **simulador (§4.1)** + saídas **O1–O3**; critérios **A–E** (seção **4.4**) satisfeitos antes de `apply`.  
- [ ] `dry_run` antes de `apply`; **confirmação explícita** para `apply`.  
- [ ] Correção v1: só excesso de **`available`**; **não** apagar `used`; **não** mexer em `free_bonus`.  
- [ ] Três relatórios (antes / plano / depois) arquivados.  
- [ ] Validação pós-correção **V1–V3** documentada como concluída ou não.  
- [ ] Logs (quem, quando, IP, versão).  
- [ ] Comunicação a líderes se `available` forem revogados.

---

## 9. Riscos

| Risco | Mitigação |
|-------|-----------|
| Dados corrigidos, código não | Frente 3 obrigatória; validação V3. |
| Remover `available` que o líder já “vendeu” verbalmente | Ordem de revogação (ex.: mais recentes); comunicação. |
| `free_bonus` órfãs | Fora da v1; plano futuro. |
| UI ainda confunde global vs evento | Documentar no relatório; ajuste de front opcional na frente 3. |

---

## 10. Ordem segura de execução em produção

1. Deploy com **Fase 1** (auditoria + **simulador**, sem escrita) apenas.  
2. Rodar com **`event_id` + opcional `leader_id`** (começar por um líder problemático); gerar **O1** (funcional), **O2** (técnico), **O3** (`error_classification`).  
3. Validar **A–E** (§4.4), resultado do **simulador S1–S3** (§4.1), granularidade §4.6 e escopo evento vs global §4.7.  
4. **Frente 3:** implementar e deployar fix de causa raiz (ou desligar temporariamente o disparo problemático com flag).  
5. **Frente 2:** `dry_run` → revisar plano → `apply` com confirmação explícita.  
6. Arquivar os **três relatórios** da correção.  
7. Executar **validação pós-correção V1–V3**.  
8. Reauditoria somente leitura após 24–48 h.  
9. Repetir para outro líder no mesmo evento ou para o evento inteiro (sem `leader_id`), ainda **sem lote multi-evento**.  
10. Versão futura: generalização e eventual lote (fora do escopo da v1).

---

## 11. Entregáveis de implementação (futuros)

| Frente | Entregável |
|--------|------------|
| 1 | Script/rota `audit-event-invitations` — leitura + **simulador** (§4.1); `event_id` obrigatório, `leader_id` opcional; saídas **O1–O3** (§4.2); classificação §4.3; pré-requisitos **A–E** §4.4; detalhamento §4.6–4.8; **nenhuma** correção de dados. |
| 2 | Script/rota `reconcile-event-invitations` — `dry_run` / `apply`; três relatórios; bloqueio sem `event_id`; confirmação explícita; só `available` em excesso na v1. |
| 3 | PRs no backend (e front se necessário) + testes de regressão documentados. |
| (Opcional) | Tabela `invitation_reconciliation_log`; UI “Configurações > Avançados”. |

---

**Fim do plano (v1.1).** Implementação deliberadamente **não** incluída neste documento.
