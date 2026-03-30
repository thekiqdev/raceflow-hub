# Plano Técnico Definitivo — Domínio de Convites

**Status:** planejamento (sem implementação)  
**Objetivo:** corrigir de forma definitiva o domínio de convites (cálculo, concessão, leitura, reconciliação e histórico), sem quebrar os fluxos válidos.

---

## Resumo executivo

- O domínio de convites hoje está funcional em partes, mas fragmentado em múltiplos gatilhos e visões.
- Há divergência entre fontes: `expectedBonuses`, `times_granted_db`, `leader_invitations`, `registrations free_bonus`, e telas.
- O padrão de lixo mais crítico já identificado é `classification = sem_convite_correspondente` em `free_bonus` sem vínculo real em `leader_invitations`.
- O plano definitivo organiza o tema em 8 fases (0–7), com regra canônica única, governança de escrita/leitura, saneamento histórico e observabilidade.
- Escopo imediato do documento: **mapear, investigar e definir execução segura**. Não executar mudanças agora.

---

## FASE 0 — Inventário completo

### 0.1 Backend — serviços críticos

- `backend/src/services/leaderBonusService.ts`
  - `checkAndGrantInvitationBonus`
  - `checkInvitationBonusForCommission`
  - `checkAllInvitationBonuses`
  - `triggerInvitationBonusAfterPaidWithCoupon`
  - `recalculateAndRevokeExcessInvitations`
  - `getLeaderInvitationProgress`
- `backend/src/services/invitationBonusGrantService.ts`
  - `grantInvitationBonusSlotAtomic`
  - `grantInvitationBonusSlotWithClient`
- `backend/src/services/leaderInvitationsService.ts`
  - `createInvitationFromBonus`
  - leitura/envio de convites
- `backend/src/services/leaderRegistrationsService.ts`
  - `getRegistrationsByLeaderCoupons` (cupom OR referral)
- `backend/src/services/commissionsService.ts`
  - `createCommission` (dispara bônus em vários ramos)
- `backend/src/services/registrationsService.ts`
  - `createRegistration`
  - pós-criação com gatilhos de comissão/bônus
- `backend/src/services/registrationBonusService.ts`
  - confirmação de pagamento -> `checkAllInvitationBonuses`
- `backend/src/services/expiredRegistrationsService.ts`
  - reprocessamentos com gatilhos de bônus
- `backend/src/services/invitationBonusAuditService.ts`
  - Fase 1 de auditoria (somente leitura)
- `backend/src/services/invitationBonusReconciliationService.ts`
  - reconciliação controlada (dry_run/apply)
- `backend/src/services/missingInvitationDeliveryService.ts`
  - geração assistida de faltantes
- `backend/src/services/leaderEventCommissionsService.ts`
  - leitura de comissões e métricas por líder/evento
- `backend/src/services/changeEventOrganizerService.ts`
  - migração de organizador e impacto indireto em cupom/convites

### 0.2 Backend — controllers/rotas/gatilhos

- `backend/src/controllers/asaasWebhookController.ts`
  - principal cadeia automática pós-pagamento
- `backend/src/controllers/registrationsController.ts`
  - confirmação manual, alterações de cupom, rechecks de bônus
- `backend/src/controllers/invitationBonusAuditController.ts`
- `backend/src/controllers/invitationBonusReconciliationController.ts`
- `backend/src/controllers/missingInvitationDeliveryController.ts`
- `backend/src/routes/adminRoutes.ts`
  - `/audit/invitation-bonus-simulator`
  - `/reconcile/invitation-bonus-controlled`
  - `/reconcile/missing-invitation-delivery`
- `backend/src/routes/groupLeaders.ts`
  - convites do líder (`/me/invitations*`)

### 0.3 Scripts operacionais

- `backend/scripts/debug-invitations.ts`
- `backend/scripts/check-bonus-status.ts`
- `backend/scripts/verify-bonus-eligibility.ts`
- `backend/scripts/process-past-invitations.ts`
- `backend/scripts/grant-missing-bonuses.ts`
- `backend/scripts/fix-missing-invitations.ts`
- `backend/scripts/fix-invitation-registrations.ts`
- `backend/scripts/fix-organizer-registrations.ts`

### 0.4 Frontend / leitura operacional

- `src/components/admin/InvitationBonusAuditPanel.tsx`
- `src/components/runner/leader/LeaderDashboard.tsx`
- `src/components/admin/GroupLeaderDetails.tsx`
- `src/components/organizer/LeaderEventCommissions.tsx`
- APIs:
  - `src/lib/api/invitationBonusAudit.ts`
  - `src/lib/api/leaderInvitations.ts`
  - `src/lib/api/leaderEventCommissions.ts`

---

## FASE 1 — Regra canônica única

### 1.1 Definições canônicas (fonte de verdade)

- **Venda elegível para convite**
  - inscrição `paid`, não `cancelled`, no `event_id`, atribuível à comissão do líder conforme regra canônica.
- **Meta**
  - `expectedBonuses = floor(paidCount_canonico / required_purchases)`.
- **Convite concedido válido**
  - `leader_invitations` em `status in ('available','sent','used')`, com `leader_id`, `event_id`, `commission_id` válidos.
- **Registration free_bonus válida**
  - inscrição de bônus com `payment_method = 'free_bonus'` e vínculo 1:1 por `leader_invitations.bonus_registration_id = registrations.id`.
- **Registration free_bonus inválida**
  - `free_bonus` sem vínculo correspondente em `leader_invitations` (ex.: `sem_convite_correspondente`), ou fora de regra da comissão.
- **Convite faltante**
  - `expectedBonuses > granted_validos`.
- **Convite excedente**
  - `granted_validos > expectedBonuses` (por comissão).

### 1.1.1 Regra mandatória — fonte de verdade e vínculo canônico

- A fonte de verdade de **convite concedido** é `leader_invitations`.
- A fonte de verdade do **lastro da inscrição bônus** é o vínculo:
  - `leader_invitations.bonus_registration_id = registrations.id`.
- Nenhuma `registration` com `payment_method = 'free_bonus'` é válida isoladamente sem esse vínculo canônico.
- `registrations free_bonus` sem vínculo canônico devem ser classificadas como:
  - inconsistência;
  - lixo operacional;
  - ou pendência de saneamento;
  e **nunca** como convite concedido válido.

### 1.1.2 Regra mandatória — separação entre déficit e lixo

- Déficit de convites (`faltantes`) e inscrições lixo (`free_bonus` inválidas) são classes distintas.
- A existência de lixo **não autoriza** inferir automaticamente que representa convite faltante.
- A existência de faltantes **não autoriza** reaproveitar automaticamente inscrições lixo sem critério canônico explícito e auditável.

### 1.2 Fonte de verdade do domínio

- **Escrita canônica de concessão:** único fluxo de concessão (atômico).
- **Leitura canônica operacional:** Fase 1 (`invitationBonusAuditService`) + visão por comissão.
- **Chave de lastro:** `leader_invitations.bonus_registration_id` ↔ `registrations.id`.
- **Regra de unicidade estrutural mandatória:**
  - impedir duas linhas de convite para o mesmo `bonus_registration_id`;
  - evitar regras legadas que impeçam múltiplos slots válidos por comissão/evento.

---

## FASE 2 — Auditoria funcional completa

### 2.1 O que validar no estado atual

- cálculos corretos por comissão (`paidCount`, `expectedBonuses`);
- divergências entre contagem por cupom e por referral;
- pontos de reprocessamento (webhook, confirmação manual, scripts, jobs);
- divergências entre telas (`leader dashboard`, admin/auditoria, evento inscrições);
- impacto de migração de organizador em cupom/comissão/convite.

### 2.2 Pontos de risco já observados

- múltiplos gatilhos para `checkAllInvitationBonuses`/`triggerInvitationBonusAfterPaidWithCoupon`;
- fallback para contagem ampla quando resolução de cupom por comissão falha;
- reconciliação e correções em trilhas separadas;
- mistura semântica de `free_bonus` de organizador com `free_bonus` de bônus de convite.

---

## FASE 3 — Reprojeto lógico do domínio (sem sistema novo)

### 3.1 Fluxo único de concessão

- manter um único serviço de concessão (atômico) como porta de entrada;
- todos os gatilhos chamam esse serviço via contrato estável;
- remover caminhos paralelos que criem `free_bonus` de convite fora do fluxo canônico.

### 3.2 Fluxo único de leitura

- leitura de painel/relatório não pode ter efeito colateral de concessão;
- dashboards devem consumir visão canônica agregada por comissão/evento;
- distinção explícita entre:
  - convites (`leader_invitations`);
  - inscrições bônus lastreadas;
  - inscrições `free_bonus` administrativas.

### 3.2.1 Regra mandatória — leitura não pode escrever

- Nenhuma rota de leitura, dashboard, consulta administrativa, listagem de comissão, listagem de progresso ou tela frontend pode disparar:
  - criação;
  - concessão;
  - reconciliação;
  - persistência de convites.
- Toda escrita do domínio de convites deve ocorrer somente em fluxos explícitos e autorizados de concessão/reconciliação.

### 3.3 Fluxo único de reconciliação

- Fase 1 (auditoria) produz fotografia canônica;
- Fase 2 (reconciliação) atua somente por recortes explícitos;
- apply exige guard de hash/contexto + logs estruturados.

---

## FASE 4 — Correção definitiva da geração futura

### 4.1 Itens de correção obrigatórios

- garantir cálculo de meta por regra canônica da comissão (cupom/referral conforme política definida);
- garantir concessão atômica (convite + lastro bônus);
- bloquear duplicidade de concessão por idempotência no nível da comissão;
- padronizar gatilho de pós-pagamento (fonte única e deduplicada);
- remover qualquer efeito colateral de escrita em endpoints/telas de leitura;
- padronizar erro operacional para não “engolir” inconsistência silenciosa.

### 4.1.1 Contrato único de escrita (mandatório antes da correção final)

Antes de concluir a Fase 4, deve existir um contrato explícito e versionado com:

- **Funções autorizadas a criar `leader_invitations`**
  - (ex.: serviço canônico de concessão e fluxos de reconciliação controlada).
- **Funções autorizadas a criar `registrations free_bonus` de bônus**
  - somente quando acopladas ao vínculo canônico no mesmo contexto transacional.
- **Funções autorizadas a vincular `bonus_registration_id`**
  - proibido vínculo implícito ou inferido fora do fluxo canônico.
- **Gatilhos permitidos**
  - eventos explícitos de pagamento/concessão/reconciliação com autorização e trilha.
- **Gatilhos proibidos**
  - qualquer leitura/listagem/consulta que escreva;
  - chamadas indiretas sem intenção explícita de escrita;
  - atalhos que gerem `free_bonus` sem garantir vínculo canônico.

Este contrato deve ser tratado como regra de arquitetura do domínio de convites e validado em revisão técnica.

### 4.2 Critérios de aceite da geração futura

- zero criação de `free_bonus` órfã;
- `expectedBonuses` e `times_granted_db` convergem por comissão após processamento;
- mesma compra não gera múltiplas concessões por reprocessamento;
- comportamento consistente entre webhook, confirmação manual e retentativas.

---

## FASE 5 — Saneamento dos dados antigos

### 5.1 Classificação operacional por ID

- **Válidos:** convites e `free_bonus` com lastro 1:1 consistente.
- **Faltantes:** meta > concedidos válidos (gerar com fluxo controlado).
- **Excedentes:** concedidos > meta (expirar/reclassificar conforme regra).
- **Lixo:** `free_bonus` com `sem_convite_correspondente` e sem vínculo operacional.

### 5.2 Política de ação por classe

- gerar faltantes via fluxo controlado (não via gatilho incidental);
- tratar excedentes sem destruir histórico auditável;
- excluir/tratar lixo somente por recorte estrito e com backup.

### 5.3 Regra mandatória — saneamento histórico não reaproveita lixo automaticamente

### 5.4 Regra mandatória — geração de faltantes só após saneamento mínimo

- Convites faltantes só podem ser gerados automaticamente quando o recorte analisado estiver livre de lixo crítico que comprometa o lastro canônico.
- Caso existam inconsistências bloqueantes, o sistema deve exigir saneamento prévio ou aprovação operacional explícita.

- `registrations free_bonus` classificadas como lixo/inconsistentes não devem ser reaproveitadas automaticamente como convites válidos.
- A geração de convites faltantes deve ocorrer pelo fluxo canônico de concessão/controlado, salvo exceção formal e auditável.
- Qualquer reaproveitamento excepcional deve ser explicitamente documentado, rastreável por IDs e aprovado como política operacional.

---

## FASE 6 — Unificação das telas

- definir **view model canônico** para:
  - painel do líder;
  - evento > inscrições;
  - admin/auditoria/reconciliação.
- evitar cálculos divergentes no frontend;
- todos os painéis devem explicitar escopo (evento vs global) e critério de contagem.

---

## FASE 7 — Observabilidade e prevenção

### 7.1 Logs mínimos obrigatórios

- correlação por `event_id`, `leader_id`, `commission_id`, `registration_id`, `invitation_id`;
- registro de causa quando concessão falhar e ação de rollback;
- trilha de gatilho (webhook/manual/script/job/endpoint).

### 7.2 Métricas e alertas

- taxa de concessão por evento/comissão;
- divergência `expected x granted` por janela de tempo;
- detecção automática de `free_bonus` sem vínculo em `leader_invitations`;
- alerta quando leitura tentar acionar escrita (guardrail).

---

## Matriz — Fluxo correto x fluxo incorreto

| Tema | Fluxo correto | Fluxo incorreto |
|------|---------------|-----------------|
| Cálculo de meta | comissão com regra clara e escopo explícito | fallback implícito para contagem ampla sem governança |
| Concessão | criação atômica `registration free_bonus` + `leader_invitation` | `free_bonus` criada sem convite correspondente |
| Idempotência | mesma compra/processamento não multiplica concessões | reprocessamentos incrementam indevidamente |
| Leitura | APIs/telas só consultam | leitura dispara escrita/novo bônus |
| Reconciliação | dry_run + apply com guard e hash | apply sem contexto/continuação inconsistente |
| UI | escopo evento/global explícito e único | telas com contagens conflitantes |

---

## Causas raiz — confirmadas, suspeitas, descartadas

### Confirmadas

- concessão sem atomicidade (historicamente) gerou `free_bonus` órfã;
- múltiplos pontos de disparo de bônus elevaram risco de reprocessamento;
- divergência semântica entre fontes de leitura (auditoria vs telas) existe.

### Suspeitas (a confirmar na fase 2)

- resolução de cupom por comissão com fallback inadequado em cenários de migração;
- mistura cupom/referral em contagens onde a regra deveria ser estritamente por cupom da comissão;
- scripts antigos executados fora de janela controlada.

### Descartadas (com evidência atual)

- “cupom do líder sozinho cria lixo diretamente” (não é o mecanismo primário);
- auditoria de Fase 1 criando dados (é somente leitura por desenho).

---

## O que está funcionando e não deve ser quebrado

- regra de negócio de bônus por comissão (1 convite a cada N vendas);
- fluxos de convite válido já existentes (`available/sent/used`);
- painel e APIs de envio/uso de convites por líder;
- reconciliação com modo `dry_run` e guard de consistência;
- trilha de migração de organizador e auditoria contextual (não reescrever sem necessidade).

---

## Plano de implantação segura (ordem)

1. **Fase 0+1 completas e congeladas** (inventário + regra canônica documentada).
2. **Fase 2** em homologação com dataset real de 1 evento crítico.
3. **Fase 3+4** (ajustes de domínio e geração futura) com feature flag operacional.
4. **Fase 5** (saneamento histórico) em janelas controladas, com backup e rollback.
5. **Fase 6** (unificação de telas) após estabilização dos dados.
6. **Fase 7** (observabilidade) obrigatória antes de encerrar incidente.

**Definição operacional de evento crítico (para homologação real):**

Evento crítico = evento com:

- histórico real de vendas via cupom de líder;
- pelo menos uma comissão com bônus configurado;
- convites já concedidos e/ou divergências históricas conhecidas;
- dados suficientes para validar faltantes, válidos e lixo.

---

## Priorização prática (o que corrige primeiro)

- **Primeiro (núcleo):** cálculo canônico + concessão única + idempotência + eliminação de efeitos colaterais de leitura.
- **Depois (dependente de saneamento):** correção histórica por lotes (`faltantes`, `excedentes`, `lixo`).
- **Depois (dependente de UI):** unificação visual e semântica de contagens em leader/event/admin.

---

## 4.3 Critério de encerramento da correção futura

A Fase 4 só pode ser considerada concluída quando:

- nenhuma rota de leitura gerar escrita no domínio;
- toda concessão nova passar exclusivamente pelo fluxo canônico;
- novas compras elegíveis gerarem exatamente a quantidade esperada de convites;
- não surgirem novas `free_bonus` com `sem_convite_correspondente`;
- auditoria Fase 1 em evento de teste não apontar lixo novo após processamento completo.

---

## Entregas desta etapa (planejamento)

- documento técnico definitivo (este arquivo);
- mapa de arquivos/funções envolvidos (fase 0);
- matriz fluxo correto x incorreto;
- lista de causas raiz confirmadas/suspeitas/descartadas;
- plano de implantação segura;
- priorização por dependência: core, saneamento, UI.

