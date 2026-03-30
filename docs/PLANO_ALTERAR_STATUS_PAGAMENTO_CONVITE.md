# Plano: Alterar status de pagamento para Convite na edição de inscrições

## 1. Objetivo geral

- Permitir que o **admin** (e organizador) altere o status de pagamento para **Convite** ao editar uma inscrição.
- Garantir que inscrições que **já são convite** não passem a aparecer como **pago** após edição (evitar valor indevido em relatórios).
- Ao mudar uma inscrição para **Convite**: zerar valores e taxa da plataforma.

---

## 2. Problema atual

| Situação | Comportamento atual | Desejado |
|----------|---------------------|----------|
| Admin edita inscrição que é **convite** | Ao salvar (ex.: alterando categoria/kit), o status pode ser tratado como pago ou o total recalculado, entrando valor no relatório. | Preservar status **convite**; manter total e taxas zerados. |
| Admin quer marcar inscrição como **Convite** na edição | O select "Status do Pagamento" não oferece a opção "Convite" (convidado). | Incluir opção **Convite** e permitir salvar. |
| Admin altera status para **Convite** | — | Zerar `total_amount`, `platform_fee_amount` e `registration_edit_fee_amount`. |

---

## 3. Visão geral das etapas

| Etapa | Nome | Depende de | Resumo |
|-------|------|------------|--------|
| **1** | Tipos e API (frontend) | — | Incluir `convidado` no tipo de `payment_status` e garantir que a API envie/receba o valor. |
| **2** | Opção Convite no frontend | Etapa 1 | Adicionar opção "Convite" no Select de status (Admin e Organizer). |
| **3** | Backend: zerar valores ao convite | — | No update, quando status for/mantiver convite: forçar total e taxas zerados; não recalcular preço. |
| **4** | Backend: preservar convite ao editar | Etapa 3 | Ao editar categoria/kit de inscrição convite, não sobrescrever status nem total. |
| **5** | Validação e relatórios | Etapas 2–4 | Garantir que relatórios não contem convite como receita; testes manuais. |

---

## 4. Etapa 1 – Tipos e API (frontend)

**Objetivo:** Permitir que o frontend envie e exiba `payment_status = 'convidado'` sem erro de tipo.

**Pré-requisitos:** Nenhum.

**Tarefas:**

1. Em `src/lib/api/registrations.ts`, no tipo **UpdateRegistrationData**, alterar `payment_status` para incluir `'convidado'`:  
   `payment_status?: 'pending' | 'paid' | 'partially_paid' | 'refunded' | 'failed' | 'convidado';`
2. Conferir se o tipo de retorno de inscrição (ex.: **Registration**) já inclui `payment_status: 'convidado'` na união de tipos; se não, incluir.

**Entregáveis:**

- Tipo `UpdateRegistrationData` com `convidado` em `payment_status`.
- Nenhum erro de TypeScript ao enviar ou exibir `payment_status: 'convidado'`.

**Critérios de conclusão:**

- [ ] Frontend compila sem erro ao usar `payment_status: 'convidado'`.
- [ ] Chamada a `updateRegistration` aceita `payment_status: 'convidado'`.

---

## 5. Etapa 2 – Opção Convite no frontend (Admin e Organizer)

**Objetivo:** Incluir a opção "Convite" no Select de status do pagamento na edição da inscrição.

**Pré-requisitos:** Etapa 1 concluída.

**Tarefas:**

1. Em **AdminRegistrations** (`src/components/admin/AdminRegistrations.tsx`), no Select "Status do Pagamento" (modo edição), adicionar:  
   `<SelectItem value="convidado">Convite</SelectItem>` (ex.: após "Pago" ou na ordem desejada).
2. Em **OrganizerRegistrations** (`src/components/organizer/OrganizerRegistrations.tsx`), no Select de status do pagamento na edição, adicionar a mesma opção **Convite** (`value="convidado"`).
3. Confirmar que, ao abrir o detalhe de uma inscrição que já é convite, `editingPaymentStatus` é inicializado com `registrationDetails.payment_status` (já deve ser `'convidado'`) e que o Select exibe "Convite".

**Entregáveis:**

- Select de status do pagamento com opção "Convite" em Admin e Organizer.
- Inscrição convite aberta para edição exibe "Convite" selecionado.

**Critérios de conclusão:**

- [ ] Opção "Convite" visível e selecionável em ambas as telas.
- [ ] Ao salvar com "Convite" selecionado, o payload inclui `payment_status: 'convidado'`.
- [ ] Ao abrir inscrição convite, o select mostra "Convite" e, ao salvar sem mudar, mantém convite.

---

## 6. Etapa 3 – Backend: zerar valores quando status for Convite

**Objetivo:** Ao atualizar inscrição com `payment_status = 'convidado'`, zerar total e taxas; não criar cobrança.

**Pré-requisitos:** Nenhum (pode ser desenvolvida em paralelo à Etapa 1/2).

**Tarefas:**

1. Em **registrationsController** (PUT que chama `updateRegistration`), **antes** do bloco que recalcula preço (`anyPriceChange`):
   - Definir:  
     `willBeConvite = (req.body.payment_status === 'convidado') || (registration.payment_status === 'convidado' && req.body.payment_status === undefined)`.
   - Se `willBeConvite`: adicionar ao payload que será enviado ao service:  
     `total_amount = 0`, `platform_fee_amount = 0`, `registration_edit_fee_amount = null` (ou 0). Opcional: `payment_method = 'free_bonus'`.
2. Se `willBeConvite`, **não** executar a lógica de "confirmar pagamento" (marcar cobranças como confirmadas, criar cobrança de diferença, etc.). Executar essa lógica apenas quando o status efetivo não for convite.
3. Garantir que o **service** `updateRegistration` (ou o tipo de dados que ele recebe) aceite `total_amount`, `platform_fee_amount` e `registration_edit_fee_amount` no objeto de update (se o controller passar esses campos).

**Entregáveis:**

- Payload de update com valores zerados quando status for ou permanecer convite.
- Nenhuma criação de cobrança nem confirmação de pagamento quando for convite.

**Critérios de conclusão:**

- [x] Enviar `payment_status: 'convidado'` (com ou sem mudança de categoria/kit) resulta em `total_amount = 0`, `platform_fee_amount = 0`, `registration_edit_fee_amount` zerado.
- [x] Não é criada cobrança de diferença nem marcadas cobranças como confirmadas nesse caso.

---

## 7. Etapa 4 – Backend: preservar convite ao editar categoria/kit

**Objetivo:** Ao editar apenas categoria/kit/modalidade/lote de uma inscrição que **já é convite**, manter status convite e totais zerados (não recalcular preço).

**Pré-requisitos:** Etapa 3 concluída.

**Tarefas:**

1. No mesmo controller, no bloco em que há **recálculo de preço** quando `anyPriceChange` é true:
   - Se `willBeConvite` for true (já calculado na Etapa 3), **não** sobrescrever `total_amount`, `platform_fee_amount` nem `registration_edit_fee_amount` com o resultado de `calculateRegistrationTotal`. Manter os zeros já definidos no payload.
2. Garantir que `willBeConvite` considere também o caso em que o frontend **não** envia `payment_status` (edição só de categoria/kit): nesse caso, usar `registration.payment_status === 'convidado'` para definir que a inscrição continua convite e deve manter totais zerados.

**Entregáveis:**

- Edição de categoria/kit/modalidade/lote em inscrição convite não altera status nem preenche total/taxas com valor > 0.
- Relatórios continuam sem contabilizar essa inscrição como receita.

**Critérios de conclusão:**

- [x] Inscrição convite editada (só categoria/kit) permanece com `payment_status = 'convidado'`, `total_amount = 0`, taxas zeradas.
- [x] Nenhum valor da inscrição convite entra em relatório de receita.

---

## 8. Etapa 5 – Validação e relatórios

**Objetivo:** Validar fluxos e garantir que relatórios não contem convite como valor pago.

**Pré-requisitos:** Etapas 2, 3 e 4 concluídas.

**Tarefas:**

1. **Testes manuais:**
   - Editar inscrição que já é convite (alterar só categoria/kit): deve manter convite e totais zerados; não deve aparecer valor em relatório.
   - Alterar status de uma inscrição (ex.: pendente ou paga) para **Convite**: deve zerar total e taxas; relatório não deve contabilizar.
   - Inscrição paga alterada para Convite: valores zerados; relatório atualizado (sem essa inscrição na receita).
2. **Relatórios:** Verificar queries/agregações que usam "receita" ou "valor pago" e confirmar que excluem `payment_status = 'convidado'` (ou tratam à parte). Ajustar se necessário.

**Entregáveis:**

- Checklist de testes executado e aprovado.
- Relatórios conferidos para não incluir convite como receita.

**Entregáveis (Etapa 5):**

- Checklist de testes: [TESTES_CONVITE.md](./TESTES_CONVITE.md).
- Relatórios conferidos: todas as queries de receita usam `payment_status = 'paid'`; convite já está excluído.

**Critérios de conclusão:**

- [x] Editar inscrição convite (só categoria/kit): continua convite, total 0, sem valor em relatório.
- [x] Alterar status para Convite: total e taxas zerados; relatório não contabiliza.
- [x] Inscrição paga alterada para Convite: valores zerados; relatório reflete a mudança.
- [x] Relatórios de receita/valor pago não incluem inscrições com `payment_status = 'convidado'`.

---

## 9. Riscos e observações

- **Comissões / bônus de convite:** Ao marcar inscrição como convite (zerar valor), avaliar se comissão atrelada deve ser cancelada ou ajustada (pode ser etapa futura).
- **Cobranças existentes:** Ao mudar de pago para convite, pode ser desejável cancelar/invalidar cobranças pendentes no Asaas; definir se entra neste plano ou em outro.
- **EventViewEditDialog:** Hoje só "Confirma inscrição" (paid). Incluir opção de marcar como convite nessa tela é opcional (extensão do plano).

---

## 10. Checklist final (resumo)

- [x] **Etapa 1:** Tipo e API com `convidado` em `payment_status`.
- [x] **Etapa 2:** Opção "Convite" no Select (Admin e Organizer); convite mantido ao abrir e salvar.
- [x] **Etapa 3:** Backend zera total e taxas ao status convite; não dispara fluxo de pagamento.
- [x] **Etapa 4:** Edição de categoria/kit em convite não recalcula preço; mantém zeros.
- [x] **Etapa 5:** Testes manuais (checklist em [TESTES_CONVITE.md](./TESTES_CONVITE.md)) e relatórios validados.
