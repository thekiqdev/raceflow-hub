# Análise: Variação/atributo no envio de convite e subtração de estoque

## 1. Contexto do problema

- **Sintoma:** O líder envia convite com kit que possui produto com variação (ex.: tamanho), escolhe a variante e envia. O frontend envia `product_selections` com `product_id` e `variant_id`. O sistema aceita (200 OK), porém:
  - A variação/atributo **não fica persistida** em alguns casos (não há linhas em `registration_product_selections` com aquele `variant_id`).
  - O **estoque da variante não é “subtraído”** (a contagem de uso da variante não considera essa inscrição), pois a contagem é feita por `registration_product_selections.variant_id`.
- **Requisito:** Produtos com variação não podem ficar sem seleção; a variante escolhida deve ser subtraída conforme a regra já existente no sistema (contagem por `registration_product_selections`).

---

## 2. Hipótese do erro

- O backend, ao receber `product_selections` com apenas `variant_id` (sem `attribute_selections`), tenta **derivar** os atributos a partir de:
  - `product_variants.name` (ex.: `"P"` ou `"P - Azul"`),
  - `kit_products.variant_attributes` (ex.: `["Tamanho"]` ou `["Tamanho", "Cor"]`).
- Se `kit_products.variant_attributes` for **null** ou **array vazio**, ou se o produto não for encontrado em `kit_products`, o código **não insere nenhuma linha** em `registration_product_selections`. Assim:
  - A variante não fica gravada.
  - O estoque não é contabilizado (a função `getVariantRemainingStock` conta apenas registros em `registration_product_selections` com aquele `variant_id`).

---

## 3. Diagnóstico técnico

### 3.1 Fluxo no envio de convite (`sendInvitationByCpf`)

- **Arquivo:** `backend/src/services/leaderInvitationsService.ts`.
- Quando o líder envia convite com `category_id`, `kit_id` e `product_selections` (com `variant_id`):
  1. Valida kit e estoque (`getVariantRemainingStock`).
  2. Faz `DELETE FROM registration_product_selections WHERE registration_id = bonusRegId`.
  3. Para cada `selection` em `product_selections`:
     - Se tem `attribute_selections`: insere uma linha por par (attribute_name, attribute_value), com `variant_id` quando existir.
     - **Se tem apenas `variant_id`:** busca `product_variants.name` e `kit_products.variant_attributes` (por `selection.product_id`). Só insere linhas **se** `variant_attributes` existir e tiver length > 0, e faz o parse de `variant.name` (split por `" - "`) para preencher `attribute_name` e `attribute_value`.
- **Problema:** Se `variant_attributes` for null ou vazio (ou produto não encontrado), **nenhuma linha é inserida** → variante não persistida → estoque não subtraído.

### 3.2 Fluxo na criação de inscrição (`createRegistration`)

- **Arquivo:** `backend/src/services/registrationsService.ts`.
- Mesmo padrão: quando só há `variant_id`, o código depende de `kit_products.variant_attributes` para montar as linhas. Se não houver atributos configurados, nenhuma linha é inserida.

### 3.3 Fluxo em “completar convite” (`completeInvitationRegistration`)

- **Arquivo:** `backend/src/services/registrationsService.ts`.
- Repete a mesma lógica ao persistir `product_selections`: se só vier `variant_id` e não houver `variant_attributes` (ou não bater o parse), nada é inserido.

### 3.4 Como o estoque é contabilizado

- **Função:** `getVariantRemainingStock(variantId, eventId, excludeRegistrationId?)`.
- Lê `product_variants.available_quantity` e subtrai o **número de inscrições (distintas)** que possuem em `registration_product_selections` alguma linha com aquele `variant_id` (inscrições não canceladas, do mesmo evento).
- Se não existir **nenhuma** linha em `registration_product_selections` com esse `variant_id` para a inscrição, ela **não entra na contagem** → o estoque não é “subtraído” para essa convite/inscrição.

### 3.5 Estrutura da tabela `registration_product_selections`

- Colunas: `registration_id`, `product_id`, `variant_id`, `attribute_name`, `attribute_value`.
- `attribute_name` e `attribute_value` são **NOT NULL** (não é possível inserir só `variant_id` sem atributo).
- Para o estoque, o que importa é existir **pelo menos uma linha** com o `variant_id` preenchido para aquela inscrição.

---

## 4. Conclusão da análise

| Ponto | Conclusão |
|-------|-----------|
| Por que a variação “não está sendo enviada”? | O frontend envia corretamente `product_selections` com `variant_id`. O backend **aceita** a requisição, mas em muitos casos **não persiste** a variante porque só insere linhas quando consegue derivar atributos de `variant_attributes` + `variant.name`. |
| Por que o sistema “aceita” sem variante? | A validação exige que, se o kit tem produto variável, haja `product_selections` com `variant_id` (ou attribute_selections). Não verifica se **após** a persistência realmente existem linhas em `registration_product_selections` com esse `variant_id`. |
| Por que o estoque não é subtraído? | Porque a subtração é feita por contagem de linhas em `registration_product_selections` com o `variant_id`. Se nenhuma linha é inserida (quando `variant_attributes` está vazio/null), essa inscrição não entra na contagem. |

**Causa raiz:** Sempre que o backend processa `product_selections` com `variant_id` mas **sem** conseguir montar linhas a partir de `variant_attributes` (null, vazio ou produto não encontrado), ele **não insere nenhuma linha**, deixando a variante não persistida e o estoque não contabilizado.

---

## 5. Correção proposta

- **Regra:** Sempre que houver `selection.variant_id`, deve existir **pelo menos uma** linha em `registration_product_selections` com esse `variant_id` para a inscrição em questão.
- **Implementação:**
  - Manter o comportamento atual quando existir `variant_attributes` e for possível fazer o parse de `variant.name` (inserir uma linha por atributo).
  - **Fallback:** Quando não houver `variant_attributes` (null ou length === 0) ou quando o produto não for encontrado em `kit_products`, inserir **uma única linha** com:
    - `registration_id`, `product_id`, `variant_id` = os já usados;
    - `attribute_name` = `'Variante'` (ou similar);
    - `attribute_value` = `variant.name` (nome da variante em `product_variants`).
- Assim a tabela continua com `attribute_name` e `attribute_value` NOT NULL, a variante fica sempre persistida e o estoque é subtraído corretamente.

### Onde alterar

1. **leaderInvitationsService.ts** – bloco que insere `registration_product_selections` em `sendInvitationByCpf` (quando há apenas `variant_id`): após o uso de `variant_attributes`, adicionar `else` que insere uma linha com `('Variante', variant.name)`.
2. **registrationsService.ts** – mesmo fallback em:
   - `createRegistration` (persistência de `product_selections`);
   - `completeInvitationRegistration` (persistência de `product_selections` ao completar convite).

---

## 6. Regras de negócio reforçadas

- Produtos do kit com tipo “variável” devem ter seleção de variante ao enviar convite (já validado).
- A variante escolhida deve ser persistida em `registration_product_selections` com `variant_id` preenchido para que a regra de estoque (contagem por variante) seja aplicada.
- Nenhuma inscrição/convite com variante escolhida pode ficar sem pelo menos uma linha em `registration_product_selections` com esse `variant_id`.

---

## 7. Critérios de teste

- Enviar convite com kit que tem produto variável, selecionando uma variante; verificar que existe linha em `registration_product_selections` com o `variant_id` e que o estoque restante da variante diminui.
- Idem para kit cujo produto em `kit_products` tem `variant_attributes` null ou array vazio: a variante deve ser gravada (fallback com `attribute_name = 'Variante'`) e o estoque contabilizado.
- Completar convite (corredor escolhe categoria/kit/variante): mesma verificação de persistência e estoque.
- Inscrição normal (criação com `product_selections` só com `variant_id`): deve persistir e subtrair estoque.
