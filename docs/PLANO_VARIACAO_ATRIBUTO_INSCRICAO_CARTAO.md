# Plano técnico: Variação e atributo na inscrição por cartão + ajustes de UI e compras anteriores

## 1. Contexto do problema

- **Sintoma:** Ao realizar inscrição pelo **cartão de crédito**, a variação (variant) e os atributos (attribute_selections) do produto do kit **não estão sendo enviados** junto com a inscrição. O backend grava a inscrição e o pagamento, mas não grava linhas em `registration_product_selections`, deixando a escolha de kit (ex.: tamanho da camiseta) em branco.
- **Outros pontos relatados:**
  - A **mensagem/escolha da variação** deve exibir somente os atributos (opções) que estão **disponíveis dentro do limite do cadastro do produto** (estoque).
  - **Compras anteriores** que têm kit escolhido com produto com variação precisam **realizar a escolha** (fluxo de “atributos pendentes”).

---

## 2. Hipótese do erro

- **Hipótese principal:** O fluxo de pagamento por cartão usa um **caminho de código diferente** do fluxo PIX/botão “Finalizar”: ao submeter o formulário de cartão (componente `CreditCardForm`), o payload enviado para `createRegistration` **não inclui** `product_selections`. Assim, o backend nunca recebe `variant_id` nem `attribute_selections` nesse fluxo.
- **Hipótese secundária:** Mesmo quando o frontend envia `product_selections` no fluxo principal (`handleSubmit`), o formulário de cartão é submetido por um callback que monta `registrationData` manualmente e **omite** essa montagem.

---

## 3. Diagnóstico técnico (investigação)

### 3.1 Onde a inscrição é criada

- **Fluxo 1 – `handleSubmit` (RegistrationFlow.tsx):** Usado quando o usuário escolhe PIX ou quando preenche dados do cartão **no próprio passo de resumo** e clica em “Finalizar”. Nesse fluxo:
  - `product_selections` é montado a partir de `selectedProducts` e `variantSelections`.
  - São enviados `product_id`, `variant_id` e `attribute_selections` corretamente.
- **Fluxo 2 – Submit do CreditCardForm (RegistrationFlow.tsx, ~linha 3140):** Quando o usuário paga com cartão usando o **formulário embutido** (CreditCardForm), o callback `submitWithCardData` monta `registrationData` com:
  - `event_id`, `runner_id`, `category_id`, `kit_id`, `modality_id`, `payment_method`, `total_amount`, `coupon_code`, `credit_card`, `credit_card_holder_info`.
  - **Não monta nem envia `product_selections`.**

Conclusão: a **hipótese confirma-se**. O segundo fluxo nunca envia variação nem atributos.

### 3.2 Chave de estado (productKey / kitKey)

- No passo de escolha do kit, a chave usada para guardar atributos é `productKey = \`${kit.id}-${product.id}\`` (Map `variantSelections`).
- No `handleSubmit`, a chave usada para montar `product_selections` é `kitKey = \`${selectedKit.id}-${selection.productId}\``.
- Ambas são equivalentes quando o kit e o produto selecionado são os mesmos. O problema não é chave errada e sim **ausência de montagem** de `product_selections` no callback do cartão.

### 3.3 Backend

- O controller aceita `product_selections` (opcional) no schema de criação.
- O serviço `createRegistration` persiste `product_selections` em `registration_product_selections` quando recebidos (com `variant_id` e/ou `attribute_selections`).
- Nenhum trecho do backend remove ou ignora `product_selections` no fluxo de cartão. O problema está apenas no payload enviado pelo frontend no submit do CreditCardForm.

### 3.4 Escopo “somente atributos dentro do limite do cadastro do produto”

- No frontend, as opções de variação já consideram **estoque** via `getValuesWithStock` (usa `available_quantity === null || available_quantity > 0`). Opções sem estoque aparecem **desabilitadas** (não ocultas).
- Interpretação do requisito: exibir **somente** as opções que estão disponíveis dentro do limite (estoque). Ou seja, **não exibir** (ou não permitir escolher) opções esgotadas. Ajuste recomendado: filtrar para mostrar apenas valores que tenham pelo menos uma variante com estoque disponível (ou manter desabilitadas, conforme regra de negócio desejada).

### 3.5 Compras anteriores com kit e variação

- Já existe fluxo de **atributos pendentes**: `getRegistrationsWithMissingAttributes`, `completeRegistrationAttributes`, `MissingAttributesModal`, e alerta em “Minhas Inscrições” (ex.: `openMissingAttributes=1`).
- Inscrições com kit que tem produto variável e **sem** registros em `registration_product_selections` (ou incompletos) devem ser consideradas “com atributos pendentes” e o corredor deve ser levado a completar a escolha. O backend já identifica inscrições com produtos variáveis sem seleção; falta garantir que todas as inscrições com kit variável entrem nesse fluxo (incluindo as criadas por cartão sem `product_selections`).

---

## 4. Correção

### 4.1 Incluir `product_selections` no submit do CreditCardForm (RegistrationFlow.tsx)

- No callback que chama `createRegistration` ao submeter o formulário de cartão (por volta da linha 3140):
  - Montar `product_selections` **da mesma forma** que em `handleSubmit`:
    - Se `selectedKit?.id` e `selectedProducts.has(selectedKit.id)`:
      - Obter `selection = selectedProducts.get(selectedKit.id)`.
      - Definir `kitKey = \`${selectedKit.id}-${selection.productId}\``.
      - Obter `variantSelection = variantSelections.get(kitKey)`.
      - Incluir um item em `productSelections`: `{ product_id: selection.productId, variant_id: selection.variantId, attribute_selections: variantSelection || undefined }`.
    - Atribuir `registrationData.product_selections = productSelections.length > 0 ? productSelections : undefined`.
- Garantir que `selectedKit`, `selectedProducts` e `variantSelections` estejam no closure (já estão no mesmo componente).

### 4.2 Mostrar somente opções com estoque na escolha da variação (implementado)

- Na UI de escolha de variação (RegistrationFlow): filtrar as opções exibidas para **apenas** as que têm estoque disponível (`getValuesAvailableOnly`), de modo que a mensagem/escolha da variação mostre somente os atributos dentro do limite do cadastro do produto. Opções esgotadas não aparecem na lista.

### 4.3 Compras anteriores – garantir escolha de variação

- O backend já retorna inscrições com “missing attributes” quando o kit tem produto variável e não há seleção completa em `registration_product_selections` (`getRegistrationsWithMissingAttributes`). Inscrições com `kit_id` preenchido e sem (ou com seleção incompleta em) `registration_product_selections` já entram nessa lista. O fluxo existente (MissingAttributesModal, `completeRegistrationAttributes`) cobre compras anteriores que tenham kit com variação e precisem realizar a escolha; não foi necessária alteração no backend para esse ponto.

---

## 5. Regras de negócio envolvidas

- Inscrição com **kit** que possui produto **variável** deve ter sempre `product_selections` com `variant_id` e/ou `attribute_selections` preenchidos, para qualquer método de pagamento (PIX, cartão, boleto, etc.).
- O **estoque** das variantes é considerado no evento (ex.: `getVariantRemainingStock`); opções sem estoque não devem ser selecionáveis (e, se desejado, não devem aparecer na lista).
- Inscrições já existentes com kit variável e **sem** escolha de variação/atributos devem ser tratadas como “atributos pendentes” e o corredor deve completar a escolha antes de usar a inscrição (ou ser bloqueado até completar, conforme produto).

---

## 6. Impacto em dados antigos + migração

- **Dados antigos:** Inscrições já criadas por cartão **sem** `product_selections` permanecem com `registration_product_selections` vazias para o kit. Não há migração automática que “invente” escolha de variante.
- **Comportamento desejado:** Essas inscrições devem ser tratadas como **atributos pendentes**:
  - Incluídas em `getRegistrationsWithMissingAttributes` quando o kit tiver produto variável.
  - O corredor deve completar a escolha via fluxo “completar atributos” (MissingAttributesModal / endpoint `completeRegistrationAttributes`).
- **Migração de dados:** Não é necessária migração em banco. É necessária apenas a **garantia** de que a regra de “missing attributes” considere “kit com produto variável e sem seleção” (e que o frontend exija/ mostre o modal para essas inscrições).

---

## 7. Critérios de teste

- **Cartão – envio de variação/atributo:**
  - Criar inscrição com evento que tenha kit com produto variável; escolher categoria, kit, produto e **preencher todos os atributos** (ex.: tamanho).
  - Escolher pagamento por **cartão** e preencher o formulário de cartão; submeter.
  - Verificar que a inscrição é criada e que existem linhas em `registration_product_selections` com o `variant_id` e os `attribute_name`/`attribute_value` corretos.
  - Repetir com PIX e conferir que o comportamento é o mesmo (já funcionando).
- **Somente opções disponíveis (estoque):**
  - Com pelo menos uma variante com estoque zero, verificar que essa opção não aparece na lista (se implementada Opção B) ou aparece desabilitada (Opção A).
- **Compras anteriores:**
  - Inscrição antiga (ou criada por cartão antes da correção) com kit variável e sem `registration_product_selections`: deve aparecer em “atributos pendentes” e o fluxo de completar atributos deve gravar `registration_product_selections` corretamente após a escolha.

---

## Referências

- `src/components/event/RegistrationFlow.tsx`: `handleSubmit` (montagem de product_selections), submit do CreditCardForm (~linha 3140).
- `docs/PLANO_B_KIT_OBRIGATORIO_VARIACAO_UI.md`: item F1 (correção do cartão).
- Backend: `registrationsService.createRegistration`, `registration_product_selections`; `getRegistrationsWithMissingAttributes`.
