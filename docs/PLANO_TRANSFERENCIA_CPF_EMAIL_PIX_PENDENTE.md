# Plano: Transferência por CPF, Pix embutido e pendência sem cadastro

**Status:** só documentação — não implantar ainda  
**Data:** 08/10/2026  
**Escopo:** fluxo de transferência de **ingressos de pedido** (`/api/checkout-transfers` + `CheckoutTransferDialog`). Legado permanece fora da 1ª leva, salvo menção de paridade.

---

## 1. Objetivo solicitado

1. **UI do dialog:** começar só com **CPF**.
   - Se existir cadastro com esse CPF → avançar para **gerar/pagar a taxa**.
   - Se não existir → revelar o campo **e-mail**.
2. **Sem cadastro:** permitir “liberar” a transferência mesmo sem conta, com estado do tipo **pendente aceitação** (ingresso já destinado ao CPF/e-mail; conta ainda não criada).
3. Destinatário deve conseguir **receber link no e-mail**, criar conta e **acessar o ingresso**.
4. **Pix da taxa** deve aparecer **no próprio popup** (QR / copia-e-cola), sem link para o Asaas.
5. Preferir **reaproveitar** caminhos existentes; evitar novas funções de domínio ou reescrever regras financeiras se possível.

---

## 2. Como funciona hoje (investigação)

### 2.1 Fluxo feliz com destinatário já cadastrado

| Etapa | Onde | Comportamento |
|-------|------|----------------|
| Abrir dialog | `CheckoutTransferDialog.tsx` | CPF **e** e-mail sempre visíveis |
| Criar solicitação | `POST /checkout-transfers/tickets/:id/requests` | `resolveRecipient(cpf\|email)`; grava `new_runner_id` se achar |
| Taxa zero + destinatário resolvido | `checkoutTransferWorkflow.create` | chama `finalizeCheckoutTransfer` na hora |
| Taxa > 0 | `POST .../payment` | cria cobrança Pix; `view()` devolve `payment.invoice_url` |
| UI da taxa | `CheckoutTransferDialog` | botão **“Pagar taxa com Pix”** = link HTTPS `invoice_url` (Asaas) |
| Pagamento confirmado | webhook / `read` / `sweep` | `finish` → `finalizeCheckoutTransfer` |
| Conclusão | `checkoutTransferService.processCheckoutTransfer` | exige **perfil completo** (`new_runner_id`); troca `runner_id`, rotaciona versão/código, enfileira e-mails |

Arquivos-chave:

- UI: `src/components/runner/CheckoutTransferDialog.tsx`, `OrderTicketActions.tsx`
- API FE: `src/lib/api/checkoutTransfers.ts`
- Workflow: `backend/src/services/checkoutTransferWorkflow.ts`
- Núcleo: `backend/src/services/checkoutTransferService.ts`
- Lista: `backend/src/services/myTicketsService.ts` (`transfer.pending` / `request_id`)
- Contrato já documentado: `docs/contratos-ux-checkout-ingressos.md` §5

### 2.2 Cenário sem cadastro — o que acontece hoje

**Não há fluxo completo de “transferir → e-mail → cadastro → ingresso” no checkout.**

1. A solicitação **pode ser criada** com CPF/e-mail e `new_runner_id = null` (contrato: *“Destino inexistente pode ter solicitação pendente…”*).
2. Em `pay` / `finish`, `resolvePending` tenta achar o usuário de novo.
3. Se continuar sem conta → erro: **“O novo titular precisa completar o cadastro antes de concluir a transferência.”**
4. A taxa, se gerada, fica paga/pendente, mas a **troca de titular não ocorre**.
5. **Não** há job de e-mail pedindo cadastro específico de transferência. Os e-mails de transferência (`athlete_confirmation` / `transfer_notice`) só entram **depois** do `finalize`, quando já existe `profile.id`.

Legado (`transferRequestController`): também só conclui se achar o usuário por CPF/e-mail; senão a consulta de pagamento retorna sem transferir. Não envia link de cadastro de transferência.

### 2.3 Padrões já existentes que resolvem pedaços do problema

Estes padrões devem ser a base do plano (reuso, sem inventar outro domínio):

| Necessidade | Padrão existente | Onde |
|-------------|------------------|------|
| Ingresso “válido” sem conta | `registrations.runner_id IS NULL` + `participant_cpf` + identidade `deliveryMode: 'email'` | reserva/checkout (`checkoutOrdersService`) + entrega |
| E-mail pedindo cadastro | Trecho `needsAccount` no HTML da entrega, link genérico `/cadastro` | `checkoutDeliveryService.render` |
| Vincular conta ao ingresso após cadastro/CPF validado | `linkVerifiedCheckoutTickets(userId)` | `checkoutTicketsService.ts` (chamado em `listCheckoutTickets`) |
| Consultar se CPF já tem perfil | `isCpfRegisteredInPlatform` | `authService.ts` |
| Pix embutido (QR) no checkout de pedido | coluna `pix_qr_code` + `gateway.pixQr` + UI `PixQrCode` | migração `125`, `checkoutPaymentsService`, `components/payment/PixQrCode` |
| Convite líder sem conta (link JWT / senha) | fluxo de convite / completar cadastro | `docs/PLANO_CONVITE_NOTIFICACOES_POS_CADASTRO.md` — **outro domínio**; só reutilizar se o link genérico `/cadastro` for insuficiente |

### 2.4 Política anterior vs pedido atual

Em `contratos-ux-checkout-ingressos.md` (03/10/2026):

- Destino sem cadastro **espera completar perfil antes** da cobrança/conclusão.
- Foi registrado: *“Não será acrescentado aceite do atleta nem uma nova política de autorização.”*

O pedido atual **altera essa política** para pedidos: após a taxa, a transferência pode ficar **destinada** sem conta (“pendente aceitação” = conta ainda não criada / vínculo ainda não feito). Isso **não** é “aceite opcional do atleta”; é **reserva de titularidade por CPF/e-mail** até o claim automático no cadastro — alinhado ao padrão `runner_id IS NULL` da compra em grupo.

---

## 3. Lacunas em relação ao pedido

| Pedido | Hoje | Lacuna |
|--------|------|--------|
| Só CPF no início; e-mail se não achar | CPF e e-mail sempre | UI + critério de lookup |
| Avançar para taxa se CPF existir | Create já resolve, mas UI não guia | Orquestração de etapas no dialog |
| Liberar transferência sem conta | Bloqueado em `resolvePending` / `finalize` | Caminho de conclusão sem `new_runner_id` |
| E-mail com link de cadastro | Só após finalize com conta | Job/e-mail no caminho sem conta |
| Conta criada → ver ingresso | `linkVerifiedCheckoutTickets` só para compra com `runner_id` null | Garantir que a transferência sem conta deixe o mesmo formato claimável |
| QR Pix no popup | Só `invoice_url` | Persistir/expor `pix_qr_code` na taxa de transferência + UI |

---

## 4. Princípio de mudança (mínimo impacto)

**Não criar um segundo motor de transferência.** Estender o workflow/núcleo atuais e o padrão de ingresso sem `runner_id` já usado na compra.

Evitar:

- Nova tabela de “aceites”
- Novo status financeiro de taxa
- Novo gateway
- Reabrir mutação legada (`transferRegistration`) para pedidos

Preferir:

1. Ajustes aditivos em `checkout_transfer_payments` (Pix QR), espelhando a migração 125.
2. Um caminho no **mesmo** `finish` / `finalize` (ou ramo curto nele) para destinatário sem conta.
3. Reuso de `linkVerifiedCheckoutTickets` + e-mail com `/cadastro` (como `needsAccount`).
4. UI em etapas no `CheckoutTransferDialog` sem novas rotas de produto, salvo 1 lookup leve de CPF se necessário.

---

## 5. Desenho proposto

### 5.1 UX do dialog (etapas)

```
[1] CPF
      │
      ├─ encontrado ──────────────► [3] Taxa (gerar / QR / status)
      │
      └─ não encontrado ─► [2] E-mail ─► [3] Taxa
                                      │
                                      └─ após taxa paga / taxa 0:
                                           · com conta → completed (igual hoje)
                                           · sem conta → “pendente aceitação” (claimável)
```

- Manter cancelamento pelo solicitante (já implantado) para corrigir CPF/e-mail **antes** da conclusão/claim.
- Após “pendente aceitação”, cancelar exige regra explícita (ver §5.4): ou bloquear, ou cancelar só se ainda `runner_id` null e sem claim.

### 5.2 Lookup de CPF

**Opção A (preferida, menos superfície):**  
No client, ao confirmar CPF, chamar `POST .../requests` só com CPF + `request_key`.

- Backend já resolve destinatário.
- Resposta inclui se `new_runner_id` veio preenchido.
- Se 4xx “precisa e-mail” / código estável → UI abre e-mail e reenvia com a **mesma** `request_key` e mesmos dados + e-mail  
  *(hoje a chave é rígida: mudar e-mail depois da create falha com “Chave já utilizada”. Por isso a create com CPF sem conta **não** deve persistir até ter e-mail, **ou** a primeira create sem e-mail nem grava — só valida.)*

**Opção B (lookup dedicado, ainda reutilizando função):**  
Expor leitura fina sobre `isCpfRegisteredInPlatform` / `resolveRecipient` (ex. `POST /checkout-transfers/lookup-cpf`) **sem** criar solicitação. UI só então chama `create`.

Recomendação: **Opção B** para não tensionar a idempotência da `request_key` e não gerar solicitação “pela metade”. Reusa consulta existente; não é novo domínio, só endpoint fino.

### 5.3 “Pendente aceitação” sem conta (modelo de dados)

Reaproveitar o modelo da compra por e-mail:

Após taxa paga (ou taxa 0) **e** destinatário ainda inexistente:

1. Atualizar a **mesma** `registrations`:
   - `runner_id = NULL` (antigo titular perde papel de atleta)
   - `participant_cpf = CPF informado`
   - `checkout_current_identity` ≈  
     `{ runnerId: null, cpf, email, deliveryMode: 'email', fullName: …, birthDate/gender: se conhecidos ou placeholders controlados }`
   - incrementar `checkout_ticket_version` + novo `confirmation_code` (igual finalize atual)
2. Registrar `checkout_ticket_transfers` com `new_runner_id` null **ou** coluna/valor sentinela — **ponto a fechar** (§7), porque a migração 123 provavelmente assume UUID.
3. `transfer_requests.status`:
   - **Preferência A:** novo valor `awaiting_recipient` / alias de produto “pendente aceitação” (migração de CHECK).
   - **Preferência B (ainda menos regra nova):** manter `completed` no request + ingresso com `runner_id` null; a UI deriva “pendente aceitação” de `!runner_id && transfer recente`.  
     B evita status novo, mas mistura “concluída” com “ainda sem conta”.
4. Enfileirar `checkout_delivery_jobs` com `recipient = e-mail informado`, kind reutilizando `athlete_confirmation` (já acrescenta CTA `/cadastro` quando `needsAccount`).

**Claim:** ao cadastrar/logar com CPF Brasil validado, `linkVerifiedCheckoutTickets` já faz `UPDATE runner_id` nas linhas `runner_id IS NULL AND participant_cpf = cpf`.  
Ajustes mínimos possíveis nesse ponto:

- Garantir que identidade/transferência sem conta entre no mesmo predicado.
- Se `birthDate` da identidade não bater com o perfil (compra exige match), o claim atual **pula** a linha — para transferência sem dados demográficos, o match de birthDate precisa ser **afrouxado ou preenchido no claim** (único ponto sensível do reuso).

Categoria/idade: hoje o finalize **exige** perfil. Sem conta não há gênero/idade. Opções compatíveis com “pouca regra nova”:

| Abordagem | Prós | Contras |
|-----------|------|---------|
| **C1** Validar categoria só no claim (ao setar `runner_id`) | Permite liberar agora | Precisa mensagem se CPF cadastrar e for incompatível |
| **C2** Exigir que o destinatário já exista para categorias restritas | Menos mudança no finalize | Fura o pedido “sempre sem cadastro” |
| **C3** Copiar elegibilidade do titular anterior | Simples e frágil | Pode aceitar titular inválido |

Recomendação: **C1**, concentrando a validação de categoria que já existe no finalize em um re-check no momento do link (mesmo código de regras, outro momento).

### 5.4 Quem vê o quê enquanto pendente

| Papel | Comportamento proposto |
|-------|-------------------------|
| Antigo titular | Perdeu `runner_id`; se for só atleta, some das ativas; se for comprador, continua vendo por `buyer` (como pós-transferência atual) |
| Comprador | Vê ingresso no pedido; badge **Pendente aceitação** quando `runner_id` null pós-transferência |
| Destinatário sem conta | Só e-mail + `/cadastro`; ainda não aparece em Minhas Inscrições |
| Destinatário após cadastro+CPF validado | `linkVerifiedCheckoutTickets` vincula; passa a ver/baixar |

Cancelamento após “pendente aceitação”:

- Se ainda `runner_id` null → permitir cancelamento do solicitante/admin **com** regras de estorno da taxa (iguais às de hoje).
- Se já claimado → igual transferência `completed` (sem cancelamento runner).

### 5.5 Pix no popup (sem Asaas)

Espelhar o checkout de pedido:

1. Migração aditiva: `checkout_transfer_payments.pix_qr_code text` (como `125_checkout_payment_pix_qr.sql`).
2. Em `pay` / `apply` / reconcile: gravar `p.pixQrCode` ou `gateway.pixQr(provider_id)`.
3. Em `view()`: expor `payment.pix_qr_code` quando `state === 'pending'` (e manter `invoice_url` opcional/oculto na UI).
4. Em `CheckoutTransferDialog`: reutilizar `PixQrCode` (já usado em `MyRegistrations`); remover CTA de link Asaas como caminho principal.

Nenhuma mudança no gateway além do que `create`/`pixQr` já fazem.

### 5.6 O que **não** fazer nesta leva

- Não migrar fluxo legado para o novo modelo (exceto se sobrar tempo de paridade depois).
- Não criar JWT específico de transferência se `/cadastro` + claim por CPF for suficiente (JWT de convite é outro produto).
- Não alterar webhook Asaas além de continuar reconciliando a taxa.
- Não exigir “aceite” explícito (botão do destinatário); o “pendente aceitação” é **conta ainda não vinculada**.

---

## 6. Plano de implantação por etapas (quando for implementar)

### Etapa 0 — Decisão de produto (bloqueante)

Fechar §7 antes de codar o ramo sem conta.

### Etapa 1 — Pix QR no popup (baixo risco, independente)

- Migração `pix_qr_code` em `checkout_transfer_payments`
- Persistência + exposição na API
- UI `PixQrCode` no dialog; regressão browser da taxa

### Etapa 2 — UI CPF → (e-mail?) → taxa

- Lookup CPF (Opção B) ou create guiada
- Dialog em etapas; textos claros
- Manter cancelar solicitação / nova `request_key`

### Etapa 3 — Conclusão sem conta (“pendente aceitação”)

- Ramo no finalize/finish reutilizando identidade e-mail + `runner_id` null
- Job de e-mail com CTA `/cadastro`
- Ajuste mínimo em `linkVerifiedCheckoutTickets` / identidade para claim
- Revalidação de categoria no claim (C1)
- Badges na lista (`myTickets` / card)

### Etapa 4 — Testes e contrato

- Integração em `checkoutDelivery.test.ts` (criar sem conta → pagar → runner null → registrar CPF → link → acesso)
- Browser: CPF só; e-mail condicional; QR visível; sem link Asaas como CTA principal
- Atualizar `docs/contratos-ux-checkout-ingressos.md` §5 (política 03/10 fica supersedida neste ponto)

---

## 7. Decisões em aberto (responder antes de codar o §5.3)

1. **Status da solicitação** após taxa paga sem conta: novo status (`awaiting_recipient`) **ou** `completed` + ingresso `runner_id` null?
2. **`checkout_ticket_transfers.new_runner_id`:** aceitar null (migração) ou gravar só após claim?
3. **Nome exibido** no ingresso pendente (só CPF mascarado vs. “Aguardando cadastro”)?
4. **Elegibilidade de categoria** sem perfil: confirmar **C1** (validar no claim)?
5. **Link de e-mail:** basta `/cadastro` genérico (padrão compra) ou querem link JWT estilo convite?
6. **Cancelamento** com taxa já paga e ingresso já “pendente aceitação”: estorno obrigatório como no admin de hoje?
7. Escopo legado nesta entrega: **sim/não**?

---

## 8. Riscos

| Risco | Mitigação |
|-------|-----------|
| Claim por CPF exige `cpf_brasil_api` validado | Já é regra de `linkVerifiedCheckoutTickets`; comunicar no e-mail |
| Birth date mismatch impede claim | Ajustar predicado só para identidades de transferência sem DOB |
| FK / NOT NULL em `new_runner_id` no histórico | Verificar migração 123 antes; tornar nullable se preciso |
| Solicitante paga taxa e destinatário nunca se cadastra | Política de cancelamento/estorno + prazo opcional depois |
| Dupla inscrição no evento com mesmo CPF | Manter check de duplicidade do finalize (por CPF) antes de liberar |

---

## 9. Critérios de aceite (futuros)

1. Dialog inicia só com CPF; e-mail só se CPF não cadastrado.
2. CPF cadastrado segue para taxa sem pedir e-mail.
3. QR Pix (e copia-e-cola) no popup; sem depender de abrir Asaas.
4. Sem conta: após taxa (ou taxa 0), ingresso fica destinado (antigo titular não é mais atleta); e-mail com caminho de cadastro é enviado.
5. Após cadastro com mesmo CPF validado, o ingresso aparece em Minhas Inscrições sem intervenção admin.
6. Cancelamento pelo solicitante continua disponível nos estados em que a taxa ainda não “amarrou” um claim (conforme decisão §7.6).
7. Testes de integração + browser cobrindo os três caminhos: com conta, sem conta+claim, Pix embutido.

---

## 10. Resumo executivo

Hoje a transferência de pedido **só conclui com conta existente**; sem cadastro a taxa pode existir, mas a troca trava, e **não há** e-mail de cadastro de transferência. O produto já sabe emitir ingresso **sem `runner_id`**, mandar `/cadastro` e **vincular por CPF** depois — esse é o caminho de menor atrito para “pendente aceitação”. Pix embutido é cópia direta do padrão da migração 125 + componente `PixQrCode`. UI CPF-first é mudança de orquestração no dialog + lookup fino.  
**Próximo passo:** fechar as decisões do §7; só então iniciar Etapa 1 (Pix) e Etapa 2 (UI), que podem ir à frente da Etapa 3 se desejado.
