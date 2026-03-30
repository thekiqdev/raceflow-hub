# Etapa 1 (CORE) — Relatório de entrega

## 1. Arquivos alterados / criados

| Ação | Caminho |
|------|---------|
| Criado | `backend/src/services/invitationBonusCanonicalCore.ts` |
| Criado | `backend/src/services/freeBonusRegistrationSemantic.ts` |
| Criado | `docs/DOMINIO_CONVITES_CONTRATO_CANONICO.md` |
| Criado | `docs/ETAPA1_CORE_RELATORIO.md` |
| Alterado | `backend/src/services/leaderBonusService.ts` |
| Alterado | `backend/src/services/leaderEventCommissionsService.ts` |
| Alterado | `backend/src/services/invitationBonusAuditService.ts` |
| Alterado | `backend/src/services/invitationBonusGrantService.ts` |
| Alterado | `backend/src/services/leaderInvitationsService.ts` |

## 2. Funções oficialmente autorizadas a escrever no domínio

Listagem normativa em `docs/DOMINIO_CONVITES_CONTRATO_CANONICO.md` (secção 7).  
Em código: concessão **nova** de par canônico apenas via `grantInvitationBonusSlotAtomic`; exceção documentada `createInvitationFromBonus` para lastro já existente.

## 3. Referência oficial do cálculo canônico

- **`backend/src/services/invitationBonusCanonicalCore.ts`**
  - `getCanonicalPaidRegistrationIds`
  - `calculateCanonicalInvitationBonusStateForCommission` (estado por comissão)
  - `logLegacyProductionPaidCountForCommission` (apenas diagnóstico / comparação com legado)

## 4. Regra “leitura não escreve”

- `getLeaderInvitationProgress` e `getLeaderEventCommissions` continuam **sem** chamar concessão; comentários mantidos.
- Nenhuma alteração que introduza escrita em novos caminhos de leitura.
- Contrato documentado: exceções de sync de pagamento não são domínio de convites.

## 5. O que foi implementado

- Regra canônica única para **decisão de concessão** e **revogação por excesso** alinhada ao COUNT `available|sent|used`.
- Leituras de progresso e lista de comissões usam o **mesmo** núcleo canônico para contagens exibidas (compatível com o que a concessão usa).
- Auditoria Fase 1 passa a usar `getCanonicalPaidRegistrationIds` importado do núcleo (uma única definição SQL).
- Classificador semântico mínimo de `free_bonus` (heurística, sem migração de schema).
- Documento de contrato obrigatório para próximas etapas.

## 6. O que não foi implementado (fora de escopo)

- Saneamento histórico, deletes em massa, geração automática de faltantes.
- Reorganização total de gatilhos (Etapa 2).
- Coluna nova em `registrations` para origem de `free_bonus` (apenas documentada como futura).
- Refatoração grande de frontend.

## 7. Preparado para Etapa 2 (gatilhos)

- Gatilhos continuam chamando `checkAllInvitationBonuses` / `checkInvitationBonusForCommission`, que agora delegam o **cálculo de meta** ao núcleo canônico.
- Próximo passo incremental: centralizar/reduzir duplicidade de chamadas e telemetria sem mudar o contrato do núcleo.

## 8. Legado temporário mantido por segurança

- `logLegacyProductionPaidCountForCommission` — comparação explícita no log quando diverge do canônico.
- `getRegistrationsByLeaderCoupons` permanece em `leaderRegistrationsService` para auditoria/diagnóstico (Fase 1).

## 9. Riscos de compatibilidade

- **Comportamento:** líderes que dependiam implicitamente de **referral** (sem cupom resolvido na comissão) deixam de acumular `expectedBonuses` só por referral — alinhado à regra canônica; pode reduzir novas concessões nesses casos até correção de cupom/configuração.
- **UI:** `stats.paid_registrations` e `invitations_earned` em comissões passam a refletir canônico + contagem de convites `available|sent|used` (antes “earned” só `available` em parte dos fluxos).

## 10. Plano incremental aplicado

1. Extrair SQL canônico para um módulo único e reutilizar na auditoria.
2. Trocar apenas a **fonte de paidCount / expected** na concessão e revogação, mantendo o fluxo atômico existente.
3. Alinhar leituras de painel ao mesmo núcleo para evitar divergência líder vs motor.
4. Adicionar classificador e contrato em documentação sem migração destrutiva.
