# Laudo: Variação/Atributo do Produto Não Salvo na Inscrição por Cartão de Crédito

**Data do laudo:** 26/02/2026  
**Assunto:** Inscrição por cartão de crédito não persiste seleção de variação/atributo do produto (ex.: Tamanho).  
**Status:** Causa raiz identificada; correção aplicável no frontend. Recuperação de inscrições antigas: possível apenas via fluxo de “atributos pendentes”.

---

## 1. Resumo

Ao finalizar inscrição com **pagamento por cartão de crédito**, a escolha de variação/atributo do produto (ex.: Tamanho = M) **não é enviada** na requisição `POST /api/registrations`, portanto não é salva em `registration_product_selections`. No fluxo **PIX** (e no submit genérico), `product_selections` é montado e enviado corretamente.

---

## 2. Evidência (log do usuário)

Payload enviado no `POST /api/registrations` com cartão:

```json
{
  "event_id": "8d88b8f3-453e-44c5-b6c9-6264bbad58e9",
  "runner_id": "c5cefa1a-0140-4957-ad79-60bae86ea327",
  "category_id": "1a1e42c0-29a0-4e72-85c6-118f07c41348",
  "kit_id": "f937e368-48ce-4ddc-be5f-dad4d931f35e",
  "modality_id": "d00d9046-fee9-4522-beb0-53b0e7a5bddc",
  "payment_method": "credit_card",
  "total_amount": 56,
  "credit_card": { ... },
  "credit_card_holder_info": { ... }
}
```

- **Ausente:** `product_selections` (que deveria conter `product_id`, `variant_id` e/ou `attribute_selections`, ex.: `{ "Tamanho": "M" }`).
- No mesmo fluxo, o log do frontend mostra `selections: { Tamanho: 'M' }` no step 4, ou seja, a escolha existe na UI mas não é incluída no payload do cartão.

---

## 3. Causa raiz

No frontend, existem **dois caminhos** de envio da inscrição:

| Caminho | Arquivo / trecho | Inclui `product_selections`? |
|--------|-------------------|------------------------------|
| **PIX / botão “Finalizar Inscrição”** | `RegistrationFlow.tsx` – `handleSubmit` (~linhas 1142–1168) | **Sim.** Monta `productSelections` a partir de `selectedProducts` e `variantSelections` e envia em `registrationData`. |
| **Cartão de crédito (formulário)** | `RegistrationFlow.tsx` – callback do `CreditCardForm` (~linhas 3143–3157) | **Não.** Monta `registrationData` apenas com `event_id`, `runner_id`, `category_id`, `kit_id`, `modality_id`, `payment_method`, `total_amount`, `coupon_code`, `credit_card` e `credit_card_holder_info`. Não monta nem envia `product_selections`. |

Conclusão: o bug é **somente no frontend**, no payload montado no submit do formulário de cartão. O backend já aceita e persiste `product_selections` quando recebidos.

---

## 4. Backend (verificação)

- **Controller:** `backend/src/controllers/registrationsController.ts` – valida `product_selections` (opcional) no schema da criação de inscrição.
- **Service:** `backend/src/services/registrationsService.ts` – ao criar inscrição, se `data.product_selections` existir e tiver itens, grava em `registration_product_selections` (variant_id, attribute_name, attribute_value, etc.).
- **Banco:** Tabela `registration_product_selections` (migration 074) com colunas: `registration_id`, `product_id`, `variant_id`, `attribute_name`, `attribute_value`.

Nenhuma alteração necessária no backend para esta correção.

---

## 5. Correção recomendada

**Arquivo:** `src/components/event/RegistrationFlow.tsx`  

**Onde:** No callback que chama `createRegistration` quando o usuário submete o formulário de cartão (por volta das linhas 3141–3157), **antes** de montar `registrationData**:

1. Montar `productSelections` com a **mesma lógica** usada em `handleSubmit`:
   - Se existir `selectedKit?.id` e entrada em `selectedProducts` para esse kit, obter `selection` (productId, variantId).
   - Obter `variantSelections` para a chave `${selectedKit.id}-${selection.productId}`.
   - Montar array de objetos `{ product_id, variant_id?, attribute_selections? }`.
2. Incluir em `registrationData` o campo `product_selections: productSelections.length > 0 ? productSelections : undefined`.

Assim, o payload do cartão passará a ser equivalente ao do PIX no que diz respeito a produtos e variações.

---

## 6. Recuperação de inscrições antigas

**Pergunta:** É possível recuperar inscrições antigas que não salvaram variação/atributo?

**Resposta:**

- **Recuperação automática da escolha original:** **não**. A escolha (ex.: Tamanho M) foi feita apenas no navegador e nunca enviada ao servidor; portanto não existe em banco nem em log de request. Não há como inferir retroativamente qual variante o usuário selecionou naquela sessão.
- **O que já existe no sistema:** fluxo de **“atributos pendentes”**:
  - Inscrições com kit que possui produtos variáveis e **sem** linhas em `registration_product_selections` (ou com atributos faltando) são consideradas “com atributos pendentes”.
  - Endpoint `GET /registrations/missing-attributes` e telas (ex.: dashboard do corredor, `MissingAttributesModal`) permitem que o **próprio corredor** complete tamanho/atributos depois.
  - Endpoint `POST /registrations/:id/complete-attributes` persiste essas escolhas em `registration_product_selections`.

**Recomendações:**

1. **Correção imediata:** Aplicar a alteração no `RegistrationFlow.tsx` para que todas as novas inscrições por cartão passem a enviar e salvar `product_selections`.
2. **Inscrições já realizadas sem variação:** Manter e divulgar o fluxo de “completar atributos” para que os corredores afetados possam informar tamanho/atributos quando necessário.
3. **Opcional:** Listar inscrições com kit variável e sem `registration_product_selections` (por evento/período) para envio de lembrete por e-mail ou notificação pedindo que completem os atributos.

---

## 7. Checklist pós-correção

- [ ] Incluir `product_selections` no payload do submit por cartão em `RegistrationFlow.tsx`.
- [ ] Testar: inscrição com kit variável (ex.: 1 produto com Tamanho P/M/G), pagamento por cartão; conferir em banco que existem linhas em `registration_product_selections` com `attribute_name`/`attribute_value` e `variant_id` corretos.
- [ ] Testar: inscrição por PIX no mesmo cenário (regressão) – deve continuar salvando normalmente.
- [ ] (Opcional) Comunicar aos usuários afetados sobre a possibilidade de completar atributos em “Minhas Inscrições” / dashboard.

---

## 8. Referências no código

| Item | Local |
|------|--------|
| Montagem de `product_selections` (fluxo PIX) | `src/components/event/RegistrationFlow.tsx` ~1142–1168 |
| Payload do cartão (sem product_selections) | `src/components/event/RegistrationFlow.tsx` ~3143–3157 |
| Tipo `CreateRegistrationData` / `ProductSelection` | `src/lib/api/registrations.ts` |
| Validação e criação da inscrição | `backend/src/controllers/registrationsController.ts` |
| Persistência em `registration_product_selections` | `backend/src/services/registrationsService.ts` ~593–671 |
| Tabela | `backend/migrations/074_create_registration_product_selections.sql` |
| Atributos pendentes | `GET /registrations/missing-attributes`, `POST /registrations/:id/complete-attributes` |
