# Plano: Alterar valor da inscrição na edição pelo admin e cobrar/reembolsar a diferença

**Versão:** 2.1 | **Última atualização:** inclusão da confirmação manual do pagamento da diferença pelo admin

---

## 0. Decisões tomadas (resumo)

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Fonte do cálculo | **Backend** como fonte da verdade |
| 2 | Lote na edição | **Admin escolhe o lote** (select explícito na tela de edição) |
| 3 | Novo valor > já pago | **OK** – cobrar diferença (cancelar/recriar se pendente; 2ª cobrança se já pago) |
| 4 | Novo valor < já pago | **Direção C** – reembolso feito **manualmente** fora do sistema |
| 5 | Comissões | **Não recalcular** – manter como está (valor na 1ª confirmação) |

**Requisitos adicionais:**
- **Pré-visualização** da edição com os novos valores antes de salvar
- **Taxa de atualização** – valor fixo configurável em Configurações > Taxas; aplicada em toda edição que altera valor
- **Pagamento da diferença pelo corredor** – o corredor deve poder pagar a diferença **diretamente na inscrição** (botão/link na tela de inscrição)
- **Admin confirma pagamento da diferença manualmente** – na visualização da inscrição, o admin pode receber a diferença (dinheiro, transferência, etc.) e **confirmar manualmente** que o pagamento foi realizado

---

## 1. Contexto atual

### 1.1 O que existe hoje
- **Edição pelo admin/organizador**: é possível alterar status, payment_status, category_id, kit_id, modality_id e atributos de produtos.
- **total_amount**: não é alterado na edição. O valor é definido apenas na criação da inscrição (enviado pelo frontend).
- **Pagamento**: uma cobrança por inscrição no Asaas (PIX ou cartão), gravada em `asaas_payments`.
- **Reembolso**: existe fluxo de solicitação de reembolso pelo atleta; não há hoje "recalcular valor e cobrar só a diferença".

### 1.2 Objetivo
Quando o admin editar a inscrição e a alteração mudar o valor: recalcular o novo total_amount, comparar com o já pago, cobrar a diferença (se maior) ou registrar reembolso manual (se menor).

---

## 2. Análise técnica

### 2.1 Cálculo do valor da inscrição (backend)
O backend deve calcular o total a partir de: event_id, category_id, kit_id, modality_id, batch_id (escolhido pelo admin), coupon_code (opcional), runner_id (desconto idoso), taxa da plataforma e **taxa de atualização**.

### 2.2 Lotes (batches) – Admin escolhe
- **Decisão**: o admin escolhe explicitamente qual lote usar (select na tela de edição).
- **Implementação**: listar os lotes da categoria selecionada; exibir nome e preço; admin seleciona. Se a categoria não tiver lotes, usar o preço base da categoria.
- **Padrão sugerido**: lote vigente na data da inscrição original, mas o admin pode alterar.

### 2.3 Taxa de atualização (novo)
- **Configuração**: novo campo `registration_edit_fee` (ou `update_fee`) em `system_settings`, valor fixo em R$, configurável em **Configurações > Taxas**.
- **Aplicação**: somar essa taxa ao novo total **apenas quando o valor calculado mudar** (novo_total ≠ valor_atual). Se a alteração não mudar o valor (ex.: troca kit A por kit B com mesmo preço), não cobrar taxa.
- **Exemplo**: novo total = R$ 150 + taxa de atualização R$ 10 = R$ 160 a cobrar (ou a diferença sobre o já pago).
- **Risco**: se a taxa for alta e o corredor não for avisado antes, pode gerar reclamação. **Mitigação**: exibir na pré-visualização: "Taxa de atualização: R$ X" de forma explícita.

### 2.4 Pré-visualização da edição (novo)
- **Objetivo**: mostrar ao admin (e ao corredor, se aplicável) os novos valores **antes** de confirmar a edição.
- **Implementação**:
  - Endpoint `POST /api/registrations/:id/preview-edit` (ou `GET` com query params) que recebe category_id, kit_id, modality_id, batch_id e retorna: `{ old_total, new_subtotal, update_fee, new_total, difference_to_pay, difference_to_refund }`.
  - Na tela de edição do admin: ao alterar categoria/kit/modalidade/lote, chamar o endpoint e exibir um card/bloco "Pré-visualização":
    - Valor atual da inscrição: R$ X
    - Novo valor (categoria + kit + taxa plataforma): R$ Y
    - Taxa de atualização: R$ Z
    - **Total após edição: R$ (Y + Z)**
    - Já pago: R$ W
    - **Diferença a cobrar: R$ (Y+Z - W)** ou **Diferença a reembolsar (manual): R$ (W - Y - Z)**
- **Risco**: o preview pode ficar desatualizado se o admin demorar para salvar (ex.: lote expira). **Mitigação**: recalcular no backend no momento do save; o preview é apenas informativo.

### 2.5 Pagamento da diferença pelo corredor (novo)
- **Objetivo**: o corredor paga a diferença **diretamente na inscrição**, sem precisar de link externo ou e-mail.
- **Implementação**:
  - Quando existir cobrança pendente da diferença (2ª cobrança no Asaas), a inscrição deve expor essa informação.
  - Na tela **Minhas Inscrições** (MyRegistrations) e na **Visualizar Inscrição** (ValidateRegistration): se `pending_difference_amount > 0`, exibir botão **"Pagar diferença"** (ou "Pagar valor pendente").
  - Ao clicar: abrir modal ou navegar para tela com QR Code PIX (ou link de pagamento) da cobrança pendente. Reutilizar o fluxo de `generatePayment` ou criar endpoint `GET /api/registrations/:id/pending-payment` que retorna o PIX da cobrança da diferença (se houver).
  - **Backend**: o endpoint `generatePayment` já existe; pode ser estendido para retornar a cobrança pendente da diferença quando houver, em vez de criar nova. Ou criar `getPendingDifferencePayment(registrationId)` que busca a última cobrança pendente em `asaas_payments` para aquela inscrição e retorna o QR Code.
- **Riscos**:
  - Corredor não vê o botão (inscrição em aba "confirmadas" e a diferença está pendente). **Mitigação**: considerar inscrição com diferença pendente como "parcialmente paga" e exibir em destaque ou em aba "pendentes".
  - Múltiplas cobranças pendentes (improvável, mas possível). **Mitigação**: sempre retornar a mais recente pendente.

### 2.5b Admin confirma pagamento da diferença manualmente (novo)
- **Objetivo**: permitir que o admin/organizador receba o pagamento da diferença fora do sistema (dinheiro, transferência, PIX manual) e **confirme manualmente** na visualização da inscrição.
- **Cenário**: corredor paga a diferença diretamente ao organizador no balcão; admin acessa a inscrição e marca o pagamento como confirmado.
- **Implementação**:
  - Na tela de **visualização da inscrição** (AdminRegistrations / OrganizerRegistrations): quando existir `pending_difference_amount > 0`, exibir bloco "Pagamento da diferença pendente: R$ X" com botão **"Confirmar pagamento recebido"**.
  - Ao clicar: modal de confirmação ("O corredor pagou a diferença de R$ X? Esta ação marcará o pagamento como confirmado."); ao confirmar, chamar endpoint `POST /api/registrations/:id/confirm-difference-payment`.
  - **Backend**: endpoint marca a cobrança pendente em `asaas_payments` como paga (status CONFIRMED/RECEIVED) ou cria registro equivalente indicando "pagamento manual confirmado"; atualiza `payment_status` da inscrição para `paid` se a soma dos pagamentos ≥ total_amount.
  - **Alternativa mais simples**: não alterar `asaas_payments` (que reflete o Asaas); criar flag ou registro em `registration_amount_adjustments` indicando "diferença paga manualmente" e considerar esse valor na soma para decidir se a inscrição está paga. Ou: atualizar o status da cobrança no banco para "MANUAL_CONFIRMED" e na lógica de "valor pago" somar esse valor.
- **Risco**: admin confirma sem ter recebido. **Mitigação**: modal de confirmação explícito; auditoria (quem confirmou, quando).

### 2.6 Cupom
- Se a inscrição já tem `coupon_code`, o recálculo reutiliza o mesmo cupom (validar se ainda é válido).
- Se inválido, tratar como "sem cupom" e avisar no retorno.

### 2.7 Pagamentos existentes
- **Pendente**: cancelar cobrança no Asaas e criar nova com novo total (+ taxa de atualização).
- **Já pago**: criar segunda cobrança apenas da diferença (+ taxa de atualização); nova linha em `asaas_payments`.
- Inscrição "totalmente paga" quando soma dos pagamentos recebidos ≥ total_amount.

### 2.8 Reembolso (redução de valor)
- **Direção C**: atualizar `total_amount` e registrar "reembolso parcial pendente"; reembolso feito manualmente fora do sistema.

### 2.9 Comissões
- Não recalcular; manter valor na 1ª confirmação.

---

## 3. Pontos de risco (atualizados)

| Risco | Mitigação |
|-------|------------|
| Cálculo diferente frontend/backend | Backend como única fonte; testes com mesmos cenários do frontend |
| Lote errado | Admin escolhe explicitamente; pré-visualização mostra o valor antes de salvar |
| Taxa de atualização alta sem aviso | Exibir na pré-visualização: "Taxa de atualização: R$ X" |
| Corredor não encontra como pagar diferença | Botão "Pagar diferença" visível em Minhas Inscrições e Visualizar Inscrição; considerar badge "Valor pendente" |
| Preview desatualizado ao salvar | Recalcular no backend no momento do save; preview é informativo |
| Cupom inválido no recálculo | Tratar como "sem cupom" e avisar |
| 2ª cobrança confunde corredor | Descrição clara: "Complemento - Alteração da inscrição" |
| Reembolso manual esquecido | Status "reembolso parcial pendente" e lista para admin acompanhar |
| Múltiplos pagamentos e "pago" | Regra: soma dos pagamentos ≥ total_amount |
| Concorrência | Transação + checagem ao atualizar |
| Admin confirma sem ter recebido | Modal de confirmação explícito; registrar em auditoria quem confirmou e quando |

---

## 4. Direção adotada: C (híbrida)

- **Aumento de valor**: cobrar diferença (cancelar/recriar se pendente; 2ª cobrança se já pago). Incluir taxa de atualização.
- **Redução de valor**: atualizar total_amount; reembolso manual fora do sistema.
- **Comissões**: não recalcular.

---

## 5. Etapas de implementação (detalhadas)

### Etapa 1: Backend – Taxa de atualização
- [x] **Migration**: adicionar `registration_edit_fee DECIMAL(10,2) DEFAULT 0` em `system_settings`. → `082_add_registration_edit_fee.sql`
- [x] **Backend**: incluir em `getSystemSettings` e em `updateSystemSettings`; permitir atualização no controller (schema Zod). → `systemSettingsService.ts`, `systemSettingsController.ts`
- [x] **Frontend**: em Configurações > Taxas, adicionar campo "Taxa de Atualização (R$)" (valor fixo). → `SystemSettings.tsx`, `systemSettings.ts` (tipos)

### Etapa 2: Backend – Serviço de cálculo do total
- [x] **Serviço**: `registrationTotalService.ts` com `calculateRegistrationTotal(params)`.
- [x] **Parâmetros**: eventId, categoryId, kitId, modalityId, batchId?, couponCode?, runnerId?.
- [x] **Cálculo**: preço da categoria (batch ou base), preço do kit, desconto idoso (50% se ≥60 anos), cupom (validado), taxa da plataforma.
- [x] **Retorno**: `{ subtotal, seniorDiscount, couponDiscount, amountAfterDiscounts, platformFee, total, categoryPrice, kitPrice, couponApplied }`.

### Etapa 3: Backend – Endpoint de pré-visualização
- [x] **Migration**: confirmar que 082 foi executada (rodar `npx tsx scripts/run-migrations.ts` – 082 deve aparecer como "Pulando" ou "executada").
- [x] **Endpoint**: `POST /api/registrations/:id/preview-edit`.
- [x] **Body**: category_id?, kit_id?, modality_id?, batch_id? (usa valores atuais da inscrição se omitidos).
- [x] **Lógica**: chama `calculateRegistrationTotal`; aplica `registration_edit_fee` só quando o valor muda; obtém `amount_paid` (soma de asaas_payments com status pago).
- [x] **Retorno**: `{ old_total, new_subtotal, update_fee, new_total, amount_paid, difference_to_pay, difference_to_refund }`.
- [x] **Acesso**: apenas admin ou organizador do evento.

### Etapa 4: Backend – Atualização na edição com total e lote
- [x] **Migration**: adicionar `category_batch_id` (nullable) em `registrations` para auditoria (083; incluída em `run-migrations.ts`).
- [x] Incluir `batch_id` (ou `category_batch_id`) no allowlist do `updateRegistrationController`; validar que o lote pertence à categoria (nova ou atual).
- [x] Ao alterar category/kit/modality/batch: chamar `calculateRegistrationTotal`, somar `registration_edit_fee` só quando o valor mudar, obter novo `total_amount`.
- [x] Incluir `total_amount` e `category_batch_id` no payload de atualização; em `UpdateRegistrationData` e no `updateRegistration` do service.
- Regras de pagamento (criar/cancelar cobranças) → **Etapa 5**.

### Etapa 5: Backend – Regras de pagamento (diferença)
- [x] Obter valor já pago: `getTotalPaidForRegistration(registrationId)` em `asaasService` (soma asaas_payments com status CONFIRMED, RECEIVED, RECEIVED_IN_CASH, MANUAL_CONFIRMED).
- [x] Se novo total > já pago: cancelar cobranças pendentes (`getPendingPaymentsForRegistration` + `cancelPayment`); criar cobrança PIX com valor (novo total - já pago), descrição "Complemento - Alteração da inscrição" (ou "Inscrição - Alteração" se já pago = 0); `createPayment` com opção `setAsRegistrationPaymentId: false` quando for 2ª cobrança.
- [x] Se novo total < já pago: total_amount já atualizado no payload; inserir em `registration_amount_adjustments` (migration 084) com `adjustment_type = 'refund_pending'` e notes "Reembolso manual pendente (edição reduziu o valor)."
- Cobrança da diferença só criada se valor ≥ R$ 0,01; runner precisa ter `asaas_customer_id` (busca em asaas_customers).

### Etapa 6: Backend – Considerar inscrição "paga"
- [x] `getTotalPaidForRegistration(registrationId)` já existe em asaasService (Etapa 5); soma status CONFIRMED, RECEIVED, RECEIVED_IN_CASH, MANUAL_CONFIRMED.
- [x] Regra: `payment_status = 'paid'` quando soma ≥ total_amount. Implementada em `syncRegistrationPaymentStatus(registrationId)` (asaasService): atualiza `payment_status` e `status` com base na soma; se soma < total, define `payment_status = 'pending'` (exceto se já refunded/failed).
- [x] Webhook Asaas: em PAYMENT_CONFIRMED, PAYMENT_RECEIVED e PAYMENT_UPDATED (status CONFIRMED/RECEIVED), chama `syncRegistrationPaymentStatus(registrationId)` em vez de setar `paid` direto; assim a inscrição só fica paga quando a soma dos pagamentos ≥ total_amount.

### Etapa 7: Backend – Pagamento da diferença pelo corredor
- [x] Endpoint **GET /api/registrations/:id/pending-difference-payment**: se existir cobrança pendente (status PENDING ou OVERDUE) para a inscrição, retorna `{ pix_qr_code, value, due_date }`. Apenas o corredor dono da inscrição (`runner_id` ou `registered_by`); 404 se não houver cobrança pendente. Serviço `getLatestPendingPaymentForRegistration(registrationId)` em asaasService retorna a última cobrança pendente (ORDER BY created_at DESC).

### Etapa 8: Frontend – Admin – Pré-visualização e lote
- [x] Na tela de edição (AdminRegistrations): ao alterar categoria, carregar lotes da categoria (`getCategoryBatches`); select de lote (opção "Preço base" + lotes da categoria).
- [x] Ao alterar categoria/kit/modalidade/lote: chamar `previewRegistrationEdit`; exibir card "Pré-visualização da edição" com valor atual, novo valor, taxa de atualização, total após edição, já pago, diferença a cobrar ou a reembolsar.
- [x] Botão "Salvar" envia `batch_id` no payload quando selecionado; backend aplica recálculo e regras de pagamento (Etapas 4 e 5). API: `UpdateRegistrationData.batch_id`, `previewRegistrationEdit(id, body)`.

### Etapa 9: Frontend – Corredor – Pagar diferença
- [x] **Etapa 10 feita antes**: API expõe `pending_difference_amount` e `has_pending_difference` em getRegistrationById e getRegistrations (backend: getPendingDifferenceAmountForRegistration / getPendingDifferenceAmountsForRegistrationIds).
- [x] MyRegistrations: quando `has_pending_difference` ou `pending_difference_amount > 0`, exibir botão "Pagar diferença"; ao clicar chamar `getPendingDifferencePayment(id)` e abrir o mesmo modal PIX com QR Code (reutilizando PixQrCode).
- [x] ValidateRegistration: quando dono da inscrição e `has_pending_difference`, exibir botão "Pagar diferença (R$ X,XX)"; ao clicar abrir modal com PIX via `getPendingDifferencePayment` e PixQrCode.

### Etapa 9b: Backend e Frontend – Admin confirma pagamento da diferença manualmente (**apenas admin**)
- [x] **Escopo**: somente **admin** pode confirmar; organizador **não** tem esse recurso.
- [x] **Backend**: `POST /api/registrations/:id/confirm-difference-payment` (apenas **admin**). Para cada cobrança pendente: se já paga no Asaas (webhook), nada; senão `markPaymentAsManualConfirmed` + `deletePaymentInAsaasOnly` (invalida PIX). Ao final `syncRegistrationPaymentStatus(registrationId)`. asaasService: `markPaymentAsManualConfirmed`, `deletePaymentInAsaasOnly`.
- [x] **Frontend**: apenas **AdminRegistrations**: quando `pending_difference_amount > 0`, bloco "Pagamento da diferença pendente" com valor e botão "Confirmar pagamento recebido"; modal de confirmação; ao confirmar chama `confirmDifferencePayment(id)` e recarrega detalhes.

### Etapa 10: API – Expor pending_difference
- [x] Em `getRegistrationById`: após montar o objeto, chamar `getPendingDifferenceAmountForRegistration(registrationId)` e adicionar `pending_difference_amount` e `has_pending_difference` (true quando valor > 0,01).
- [x] Em `getRegistrations`: após obter a lista, chamar `getPendingDifferenceAmountsForRegistrationIds(ids)` e adicionar `pending_difference_amount` e `has_pending_difference` em cada item. Serviço asaasService: `getPendingDifferenceAmountForRegistration`, `getPendingDifferenceAmountsForRegistrationIds`.

### Próximas etapas (resumo)
| Etapa | Descrição | Responsável |
|-------|-----------|-------------|
| **9b** | Admin confirma pagamento da diferença manualmente (backend + frontend **apenas Admin**) | ✅ Concluído |
| **11** | Testes e documentação: edição com valor maior/menor, lote, taxa, cupom; doc para suporte | ✅ Concluído |
| **12** | (Opcional) Reembolso manual – marcar como concluído na inscrição | Fase 2 |

### Etapa 11: Testes e documentação
- [x] **Cenários de teste**: documento `docs/TESTES_EDICAO_INSCRICAO_VALOR.md` com checklist para QA: edição com valor maior (pendente e pago), menor (reembolso manual), com/sem lote, taxa de atualização, cupom, desconto idoso, admin confirma pagamento manual e regressão.
- [x] **Documentação para suporte**: documento `docs/SUPORTE_EDICAO_INSCRICAO_VALOR_DIFERENCA.md` explicando quando é criada 2ª cobrança, quando cancelar/recriar, reembolso manual e como o admin confirma pagamento recebido.

### Etapa 12 (opcional): Reembolso manual – marcar como concluído
- Na visualização da inscrição, quando status "reembolso parcial pendente": botão "Marcar reembolso como concluído". Ao clicar, atualizar registro em `registration_amount_adjustments` e remover o status pendente. Permite ao admin acompanhar o que já foi reembolsado.

---

## 6. Pontos que exigem atenção (revisão do plano)

### 6.1 Admin confirma manualmente × cobrança PIX pendente no Asaas
**Problema**: Se o admin confirma o pagamento manual (corredor pagou em dinheiro) mas existe cobrança PIX pendente no Asaas, o corredor poderia pagar duas vezes (dinheiro + PIX depois).

**Solução**: Ao confirmar manualmente, **cancelar a cobrança pendente no Asaas** (via `cancelPayment`). Assim o PIX deixa de ser válido e evita duplicidade. O plano deve deixar isso explícito na Etapa 9b.

### 6.2 Taxa de atualização: quando cobrar?
**Dúvida**: Cobrar taxa sempre que houver alteração de category/kit/modality/batch, ou apenas quando o **valor total calculado mudar**?

**Sugestão**: Cobrar apenas quando `novo_total ≠ valor_atual`. Se o admin troca kit A (R$ 50) por kit B (R$ 50), não cobrar taxa. Evita cobrança indevida quando a alteração não muda o valor.

### 6.3 Armazenar batch_id na inscrição
**Gap**: Hoje `registrations` não tem `category_batch_id`. Para auditoria e para saber qual preço foi usado, faz sentido armazenar. Incluir na migration junto com as alterações de edição.

### 6.4 Múltiplas cobranças: função de "valor já pago"
**Gap**: `getPaymentByRegistrationId` retorna apenas a **última** cobrança (`LIMIT 1`). Para múltiplas cobranças, precisamos de `getTotalPaidForRegistration(registrationId)` que soma o valor de **todas** as cobranças com status pago (CONFIRMED, RECEIVED, etc.). Incluir na Etapa 6.

### 6.5 Valor mínimo da cobrança
**Gap**: Asaas pode ter valor mínimo (ex.: R$ 1). Se a diferença for R$ 0,50, a criação da cobrança pode falhar. Definir: (a) valor mínimo (ex.: R$ 1) – se diferença menor, considerar pago/arredondar; ou (b) não criar cobrança e permitir confirmação manual apenas.

### 6.6 Produtos com variantes e preço
**Gap**: Kits podem ter produtos variáveis com `product_variants.price` (preço adicional por variante). O `calculateRegistrationTotal` precisa considerar as `product_selections` da inscrição (variantes escolhidas) para calcular o preço correto? Avaliar na Etapa 2; se os kits têm preço fixo por kit (sem preço por variante), pode ficar para fase 2.

### 6.7 Reembolso manual: como marcar como concluído?
**Gap**: O plano registra "reembolso parcial pendente" mas não define como o admin marca que o reembolso foi feito. Opções: (a) botão "Marcar reembolso como concluído" na visualização da inscrição; (b) lista em Admin > Financeiro de reembolsos pendentes com ação de concluir. Incluir na especificação.

### 6.8 Concorrência: webhook e admin ao mesmo tempo
**Risco**: Corredor paga PIX → webhook processa; ao mesmo tempo admin confirma manualmente. Pode gerar processamento duplicado. **Mitigação**: ao confirmar manualmente, primeiro verificar se a cobrança já foi paga (webhook chegou); se sim, não fazer nada (idempotente). Se não, marcar como paga e cancelar no Asaas.

### 6.9 Ordem das etapas
**Sugestão**: Etapa 10 (expor `pending_difference_amount`) deve ser feita **antes** das Etapas 9 e 9b, pois o frontend depende desses dados. Reordenar: Etapa 10 → Etapa 9 → Etapa 9b.

### 6.10 Inscrição com total_amount = 0 após edição
**Cenário**: Inscrição paga (R$ 200); edição muda para categoria/kit gratuitos → novo total R$ 0. Diferença a reembolsar: R$ 200. O plano trata (Direção C). Garantir que `calculateRegistrationTotal` retorne 0 quando categoria e kit forem gratuitos.

---

## 7. Sugestões adicionais (mantidas)

1. **E-mail ao corredor**: ao criar cobrança da diferença, enviar e-mail informando: "Sua inscrição foi alterada. Há um valor pendente de R$ X. Acesse Minhas Inscrições para pagar."
2. **Histórico de ajustes**: tabela `registration_amount_adjustments` para auditoria (old_total, new_total, update_fee, difference, created_by, created_at). Incluir registro quando admin confirma pagamento da diferença manualmente (created_by, created_at).
3. **Taxa de atualização zero**: se configurada como 0, não cobrar; o campo permite desativar a taxa.
4. **Validação**: não permitir edição que resulte em total negativo (após descontos).

---

*Plano atualizado com decisões e requisitos. Pronto para implementação por etapas.*
