# Resumo Executivo — Domínio de Convites (Estado Atual)

## 1) O que está errado hoje (ou ainda é frágil)

1. **Contagem “produção” pode inflar o escopo** quando a resolução do cupom da comissão falha:
   - `leaderBonusService` calcula `paidCount` via `getRegistrationsByLeaderCoupons` com filtro opcional de `coupon_code`.
   - Se cupom não resolve (ou não é fornecido), a contagem pode incluir **cupom do líder OR referral**, o que altera `expectedBonuses` (produção).
2. **Vários gatilhos disparam verificação de bônus pós-pagamento**, aumentando janela de reprocessamento:
   - webhook Asaas, confirmação manual, criação de comissão, reprocessamento de expirados.
3. **Semântica de `payment_method='free_bonus'` mistura origens**:
   - inscrições `free_bonus` podem ser “administrativas/organizador” e também podem ser lastro do bônus.
   - o audit classifica, mas ações operacionais precisam separar origens para não tomar decisões erradas.

## 2) O que está funcionando

1. **Vínculo canônico** para “convite concedido válido” já está baseado em `leader_invitations`:
   - fonte de verdade é `leader_invitations`.
   - lastro canônico é `leader_invitations.bonus_registration_id = registrations.id`.
2. **Leituras de progresso e comissões não deveriam mais escrever** no domínio:
   - `getLeaderInvitationProgress` e `getLeaderEventCommissions` foram ajustados para não disparar concessão.
3. **Reconciliação e “missing invitation delivery” são fluxos explícitos**:
   - escrita acontece em endpoints `apply` com guard de confirmação/hashes.

## 3) O que gera lixo vs faltante

- **Faltante**: comissão com `expectedBonuses > times_granted_db` (por comissão) no recorte canônico/auditoria.
- **Lixo operacional (`free_bonus` inválida)**: `registrations.payment_method='free_bonus'` sem vínculo canônico para `leader_invitations.bonus_registration_id`.
- **A existência de lixo não autoriza** inferir faltantes.

## 4) Top 3 pontos que “não podem mais acontecer” na correção definitiva

1. Nenhuma escrita (concessão/reconciliação) disparada por leitura/telas.
2. Concessão deve sempre gerar **registration+leader_invitations no mesmo contexto transacional** e com vínculo canônico.
3. “Reaproveitar lixo” sem critérios canônicos/auditáveis não deve virar regra automática.

## 5) Ordem segura sugerida (sem aplicar agora)

1. **Inventário + auditoria funcional real** em 1 evento crítico (definição abaixo).
2. Consolidar regra canônica e contrato único de escrita do domínio.
3. Só então aplicar correção de geração futura.
4. Só depois saneamento histórico com recortes estritos e backup.

### Evento crítico (para homologação)
- histórico real de vendas via cupom de líder;
- pelo menos uma comissão com bônus configurado;
- convites já concedidos e/ou divergências históricas conhecidas;
- dados suficientes para validar faltantes, válidos e lixo.

