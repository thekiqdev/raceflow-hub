# Plano: Reforço da regra de atributos pendentes (tamanho/variação do kit)

**Data:** 26/02/2026  
**Objetivo:** Garantir que inscrições antigas (ex.: cartão sem salvamento de variação) e qualquer caso em que falte seleção de tamanho/atributo do kit usem **a mesma mensagem e fluxo** já existente (“atributos pendentes”), e deixar a regra mais forte para evitar novos casos.

---

## 1. O que já está implantado

### 1.1 Detecção de “atributos pendentes”

- **Backend:** `getRegistrationsWithMissingAttributes(userId)` em `backend/src/services/registrationsService.ts`.
- **Lógica resumida:**
  1. Busca inscrições do usuário com status `confirmed` ou `pending`.
  2. Para cada inscrição **com** `kit_id`:
     - Busca em `kit_products` os produtos do kit onde:
       - `type = 'variable'`
       - `variant_attributes IS NOT NULL`
       - `variant_attributes` é um array JSONB com pelo menos um elemento.
    3. Para cada produto variável, consulta `registration_product_selections` (por `registration_id` e `product_id`).
    4. Compara os atributos obrigatórios (`variant_attributes`) com os atributos já selecionados.
    5. Se faltar algum atributo (ex.: Tamanho), o produto entra em `products_with_missing_attributes` e a inscrição entra no resultado.

- **Endpoint:** `GET /api/registrations/missing-attributes` (autenticado).
- **Efeito:** Tanto “admin removeu o tamanho” quanto “inscrição por cartão que não salvou seleção” têm o **mesmo estado** no banco: **nenhuma linha** (ou linhas incompletas) em `registration_product_selections` para aquele produto. Portanto a **mesma regra** já deveria listar os dois casos.

### 1.2 Exibição da mensagem e fluxo para o corredor

- **Alerta:** `MissingAttributesAlert` no dashboard do corredor (`RunnerDashboard`), em todas as abas.
  - Chama `getRegistrationsWithMissingAttributes()` e, se houver inscrições com atributos pendentes, exibe o alerta amarelo “Seleção de Atributos Pendente” com botão “Selecionar Agora”.
- **Modal:** `MissingAttributesModal` permite escolher tamanho/atributos por inscrição e produto e salvar via `POST /api/registrations/:id/complete-attributes`.
- **Admin remove atributos:** `POST /api/registrations/:id/remove-attributes` apaga linhas em `registration_product_selections`. Depois disso, na próxima vez que o corredor abrir o dashboard, a mesma detecção acima encontra a inscrição e o **mesmo alerta/modal** aparecem.

Ou seja: **não há mensagem diferente** para “admin removeu” vs “nunca salvou”. É o mesmo endpoint, mesmo alerta e mesmo modal. A diferença é **por que** às vezes a inscrição **não aparece** na lista (ver seção 2).

### 1.3 Bloqueio na inscrição (fluxo de compra)

- No **Step 4 (escolha do kit)** em `RegistrationFlow.tsx`:
  - Se o kit tiver produtos com `type === 'variable'` e variantes, o botão “Próximo” só é habilitado se houver **pelo menos uma variante selecionada** (`selectedProduct?.variantId`).
- Ou seja: **na tela de inscrição** já existe regra para “precisa selecionar tamanho/variação para avançar”. O problema que existia era apenas que, no pagamento por **cartão**, o payload não enviava `product_selections` (correção já feita em outro laudo).

---

## 2. Por que a regra pode não ter “aparecido” para inscrições antigas (ex.: cartão)

Possíveis causas:

### 2.1 Produto variável sem `variant_attributes` no banco

- A detecção considera **apenas** produtos do kit que tenham:
  - `type = 'variable'`
  - `variant_attributes IS NOT NULL`
  - `variant_attributes` como array JSONB com length > 0.
- Se o produto foi criado como “variável” mas o campo `variant_attributes` está **NULL** (ou não é array válido), ele **não entra** na query de “produtos com variações”. Com isso, a inscrição é ignorada e **nunca** aparece em “atributos pendentes”, mesmo tendo kit e produto variável na interface.
- **Conclusão:** Em eventos/kits onde o produto variável não tem `variant_attributes` preenchido no `kit_products`, as inscrições antigas (incluindo as por cartão sem salvamento) **não** serão listadas.

### 2.2 Corredor não acessou o dashboard

- O alerta só é exibido quando o corredor entra no dashboard do corredor (qualquer aba). Se ele não abriu essa tela após a inscrição, nunca viu a mensagem.

### 2.3 Alerta descartado

- O usuário pode clicar em “Lembrar Depois” ou no X. O estado é salvo em `localStorage` (`missingAttributesAlertDismissed`). Enquanto estiver descartado, o alerta não aparece de novo na sessão (até recarregar e, dependendo do fluxo, até limpar o storage).

### 2.4 Resumo

- **Regra técnica:** “Inscrição com kit + produto variável (com `variant_attributes` válido) e sem seleção completa em `registration_product_selections`” já é a **mesma** para “admin removeu” e “cartão não salvou”.
- **Por que não vemos em alguns casos:** (1) `variant_attributes` NULL ou inválido no `kit_products`; (2) usuário não acessou o dashboard; (3) alerta descartado.

---

## 3. Solução: deixar a regra mais forte

Objetivos:

1. **Inscrições antigas (ex.: cartão):** Passem a aparecer na **mesma** mensagem de “atributos pendentes” que já existe quando o admin remove o tamanho.
2. **Novas inscrições:** Garantir que, ao escolher kit com produto variável, o tamanho/variação **tenha que** estar selecionado e **seja sempre salvo** (incluindo cartão – já corrigido).

### 3.1 Garantir que a detecção inclua todos os kits com produto variável (backend)

- **Problema:** Hoje só entram na detecção produtos com `variant_attributes IS NOT NULL` e array válido. Produtos `type = 'variable'` com `variant_attributes` NULL nunca geram “atributos pendentes”.
- **Ação sugerida:**
  - **Opção A (recomendada):** Incluir na detecção também produtos com `type = 'variable'` que tenham **ao menos uma variante** em `product_variants`, mesmo quando `variant_attributes` for NULL. Nesse caso, usar um atributo genérico (ex.: “Tamanho” ou o primeiro nome de variante disponível) para não quebrar o modal. Assim, inscrições antigas cujo kit tem produto variável sem `variant_attributes` preenchido passam a aparecer.
  - **Opção B:** Fazer um **backfill** em `kit_products`: para todo produto com `type = 'variable'` e `variant_attributes` NULL, preencher `variant_attributes` a partir das variantes existentes (ex.: extrair do nome das variantes ou usar `['Tamanho']` como padrão). Depois disso, a detecção atual já os inclui.
- **Documentar:** Qualquer nova criação/edição de produto `variable` no admin deve **obrigar** o preenchimento de `variant_attributes` (validação no backend e no frontend).

### 3.2 Mesma mensagem para todos os casos

- **Situação atual:** Já é a mesma mensagem e o mesmo fluxo (alerta + modal) para “admin removeu” e “nunca salvou”. Nenhuma alteração de texto ou tela é estritamente necessária.
- **Opcional:** Incluir no texto do alerta ou do modal uma linha do tipo: “Se você já se inscreveu e não escolheu o tamanho na hora, selecione agora abaixo.” Isso deixa explícito que cobre inscrições antigas.

### 3.3 Reforçar obrigatoriedade na inscrição (frontend)

- **Já existente:** Botão “Próximo” no step do kit desabilitado se houver produto variável sem variante selecionada.
- **Reforços sugeridos:**
  - Revisar se há **outro** caminho (ex.: outro step ou outro botão) que permita chegar ao pagamento sem passar por essa validação.
  - Na **montagem do payload** (PIX e cartão), garantir que, sempre que houver kit com produto variável, `product_selections` seja preenchido (cartão já corrigido; validar PIX e qualquer outro método de pagamento).
  - **Opcional:** No step de resumo (antes do pagamento), exibir de forma explícita “Tamanho: [valor]” para o kit selecionado, para o usuário confirmar antes de pagar.

### 3.4 Alerta e visibilidade

- **Opcional:** Reduzir o efeito de “Lembrar Depois”: por exemplo, não persistir no `localStorage` indefinidamente, ou mostrar de novo após X dias / na próxima visita à aba “Minhas Inscrições”.
- **Opcional:** Na lista “Minhas Inscrições”, exibir um badge ou ícone nas inscrições que têm atributos pendentes, com link direto para abrir o modal de seleção.

### 3.5 Inscrições antigas sem seleção (opcional)

- **Relatório/admin:** Listar inscrições (por evento ou global) que tenham `kit_id` preenchido, kit com pelo menos um produto `variable`, e sem linhas (ou incompletas) em `registration_product_selections`. Isso permite disparar lembretes por e-mail ou notificação para “complete seu tamanho”.
- **Não é possível** recuperar automaticamente a escolha original (ex.: “M”) para quem pagou por cartão e não teve `product_selections` salvos; só é possível o corredor **informar agora** via fluxo de atributos pendentes.

---

## 4. Checklist de implementação (quando for fazer)

- [ ] **Backend – detecção:** Decidir entre Opção A (considerar `type = 'variable'` mesmo com `variant_attributes` NULL, usando fallback) ou Opção B (backfill de `variant_attributes`). Implementar e testar com um kit que tenha produto variable e `variant_attributes` NULL; conferir que a inscrição antiga aparece em `GET /registrations/missing-attributes`.
- [ ] **Backend – admin:** Garantir que produto `variable` não possa ser salvo sem `variant_attributes` (validação na API e, se aplicável, no frontend do admin).
- [ ] **Frontend – inscrição:** Confirmar que não há caminho que pule a validação de variante; confirmar que PIX e todos os métodos enviam `product_selections` quando houver kit variável.
- [ ] **Frontend – alerta/modal:** (Opcional) Ajustar texto para mencionar inscrições antigas; (opcional) política de “Lembrar Depois” ou badge em “Minhas Inscrições”.
- [ ] **Testes:** (1) Inscrição nova por cartão com kit variável → deve salvar seleção e não aparecer em atributos pendentes. (2) Inscrição antiga (ou após admin remover atributos) → deve aparecer no alerta e no modal e permitir completar. (3) Kit com produto variable e `variant_attributes` NULL → após reforço, deve passar a aparecer em atributos pendentes.

---

## 5. Referências no código

| Item | Local |
|------|--------|
| Detecção de atributos pendentes | `backend/src/services/registrationsService.ts` – `getRegistrationsWithMissingAttributes` |
| Endpoint missing-attributes | `backend/src/routes/registrations.ts` – `GET /missing-attributes` |
| Condição para produto variável na detecção | `registrationsService.ts` – query em `kit_products` com `type = 'variable'` e `variant_attributes` (JSONB array) |
| Alerta no dashboard | `src/components/runner/MissingAttributesAlert.tsx` |
| Modal de seleção | `src/components/runner/MissingAttributesModal.tsx` |
| Completar atributos | `POST /api/registrations/:id/complete-attributes` |
| Admin remove atributos | `POST /api/registrations/:id/remove-attributes` – `removeRegistrationAttributes` em `registrationsService.ts` |
| Bloqueio “Próximo” no step do kit | `src/components/event/RegistrationFlow.tsx` – step 4, `disabled` do botão com `variableProducts` e `selectedProduct?.variantId` |
| Envio de product_selections no cartão | `RegistrationFlow.tsx` – callback do `CreditCardForm` (já corrigido) |

---

## 6. Conclusão

- A **mesma** regra e a **mesma** mensagem já servem para “admin removeu o tamanho” e para “inscrição antiga por cartão sem salvamento”. O backend não distingue os dois casos; ambos resultam em “sem/com poucas linhas em `registration_product_selections`”.
- Para que essas inscrições antigas **apareçam** de forma confiável, é necessário **reforçar a detecção** (incluir produtos `variable` mesmo quando `variant_attributes` for NULL, ou garantir `variant_attributes` preenchido por backfill/validação).
- Reforçar também na **inscrição**: garantir envio de `product_selections` em todos os métodos de pagamento (cartão já corrigido) e manter o bloqueio de avanço quando houver produto variável sem seleção, para evitar novos casos sem tamanho.
