# Plano de aplicação: Cache de cupom/referência em localStorage

Este documento detalha as **etapas** para implementar o cache de cupom e ref em localStorage, com as decisões já definidas.

**Decisões adotadas:**
- **TTL:** 7 dias (cache expira após 7 dias).
- **Limpeza:** remover cache daquele evento após inscrição concluída.
- **Ref no cache:** manter `ref` junto com `cupom` no mesmo objeto por evento.
- **Prioridade:** URL tem prioridade; se houver cupom/ref na URL, usar e atualizar o cache.

---

## Etapa 1 – Contrato e utilitário de cache

**Objetivo:** Definir formato do cache e criar o módulo que grava/lê/limpa.

**1.1 Contrato**
- **Chave:** `referral_coupon_event_{eventId}` (usar ID do evento, não slug).
- **Valor (JSON):**
  ```ts
  {
    cupom?: string;   // código do cupom (ex.: ABC123)
    ref?: string;     // código de referência do líder
    savedAt: string;  // ISO 8601 (ex.: "2025-01-15T10:30:00.000Z")
  }
  ```
- **TTL:** 7 dias. Ao ler, se `savedAt` + 7 dias < agora → considerar expirado, remover a chave e retornar `null`.

**1.2 Arquivo:** `src/lib/referralCouponCache.ts`

**1.3 Funções a implementar**

| Função | Comportamento |
|--------|----------------|
| `saveReferralCoupon(eventId: string, data: { cupom?: string; ref?: string })` | Grava `{ cupom, ref, savedAt: new Date().toISOString() }` em `referral_coupon_event_{eventId}`. Só grava se pelo menos um de `cupom` ou `ref` existir. |
| `getReferralCoupon(eventId: string)` | Lê a chave; se não existir ou estiver expirado (savedAt + 7 dias), remove a chave e retorna `null`; senão retorna `{ cupom?, ref?, savedAt }`. |
| `clearReferralCoupon(eventId: string)` | Remove `referral_coupon_event_{eventId}` do localStorage. |

**1.4 Constante**
- `REFERRAL_COUPON_TTL_DAYS = 7` (usar no cálculo de expiração dentro de `getReferralCoupon`).

**Critério de conclusão:** Módulo criado, tipado, e testável manualmente (ex.: no console chamar save/get/clear e verificar localStorage).

---

## Etapa 2 – Gravar cache na página do evento

**Objetivo:** Quando o usuário estiver na página do evento com `cupom` ou `ref` na URL, gravar no cache para aquele evento.

**2.1 Arquivo:** `src/pages/EventDetails.tsx`

**2.2 Onde**
- Dentro de um `useEffect` que dependa de: evento carregado (`event`), `searchParams` (ou equivalente para ler a URL).
- Condição: só executar quando `event` existir e tiver `event.id`.

**2.3 Lógica**
1. Ler `cupom = searchParams.get('cupom')` e `ref = searchParams.get('ref')`.
2. Se pelo menos um existir (após trim), chamar `saveReferralCoupon(event.id, { cupom: cupom?.trim() || undefined, ref: ref?.trim() || undefined })`.

**2.4 Dependências**
- Usar `useSearchParams()` do React Router (se ainda não existir no componente, adicionar).
- Garantir que o efeito rode quando a URL mudar (ex.: usuário cola link com cupom já na página do evento).

**Critério de conclusão:** Acessar `/evento/:slug?cupom=XXX` (ou `?ref=YYY`) e verificar no DevTools → Application → Local Storage que a chave `referral_coupon_event_{id}` foi criada com `cupom`, `ref` (se vier na URL) e `savedAt`.

---

## Etapa 3 – Ler cache e priorizar URL no RegistrationFlow

**Objetivo:** Ao abrir o modal de inscrição, usar cupom/ref da URL com prioridade; se não houver na URL, usar o cache (se válido).

**3.1 Arquivo:** `src/components/event/RegistrationFlow.tsx`

**3.2 Onde**
- No `useEffect` que hoje lê `couponFromUrl` e `refFromUrl` da URL e aplica o cupom (e que depende de `open`, `event.id`, `searchParams`).

**3.3 Lógica (ordem)**

1. **Se houver cupom ou ref na URL** (`searchParams.get('cupom')` ou `searchParams.get('ref')`):
   - Usar esses valores (como hoje).
   - Chamar `saveReferralCoupon(event.id, { cupom: cupomFromUrl || undefined, ref: refFromUrl || undefined })` para atualizar o cache com a URL (prioridade da URL).
   - Preencher e validar cupom quando for cupom da URL.
2. **Se não houver cupom/ref na URL:**
   - Chamar `getReferralCoupon(event.id)`.
   - Se retornar dados não expirados e houver `cupom`:
     - `setCouponCode(cupom)` e disparar validação do cupom (ex.: `handleValidateCoupon(cupom)` após pequeno delay).
   - Se houver `ref` no cache e o fluxo de criação de inscrição usar `ref`, garantir que esse `ref` seja enviado na requisição (manter comportamento atual de ref onde já for usado).

**3.4 Não alterar**
- A lógica atual de envio de `coupon_code` e `referral_code` na criação da inscrição continua igual; apenas a origem do valor pode ser URL ou cache.

**Critério de conclusão:**  
- Com cupom na URL: cupom aplicado e cache atualizado.  
- Sem cupom na URL mas com cache válido para aquele evento: cupom pré-preenchido e validado.

---

## Etapa 4 – Limpar cache após inscrição concluída

**Objetivo:** Ao concluir com sucesso a criação da inscrição no evento, remover o cache daquele evento para não reutilizar o cupom em nova inscrição no mesmo evento.

**4.1 Arquivo:** `src/components/event/RegistrationFlow.tsx`

**4.2 Onde**
- No bloco de sucesso após criar a inscrição (ex.: após `createRegistration` ou equivalente retornar sucesso, antes ou depois de fechar o modal / mostrar toast).

**4.3 Lógica**
- Chamar `clearReferralCoupon(event.id)`.

**Critério de conclusão:** Fazer uma inscrição com cupom (via URL ou cache), concluir até o fim. Abrir novamente o modal de inscrição no mesmo evento e verificar que o cupom não aparece mais pré-preenchido (cache removido).

---

## Etapa 5 – Testes manuais e ajustes

**Objetivo:** Validar o fluxo completo e casos de borda.

**5.1 Casos a testar**

| # | Cenário | Resultado esperado |
|---|---------|---------------------|
| 1 | Acessar `/evento/:slug?cupom=XXX`, fechar modal, ir para home, voltar para `/evento/:slug` (sem params) e abrir inscrição | Cupom XXX aplicado (vindo do cache). |
| 2 | Mesmo que 1, mas esperar 8 dias (ou alterar TTL para 1 minuto para teste) e abrir inscrição | Cupom não aparece (cache expirado). |
| 3 | Inscrição concluída com sucesso no evento; abrir novamente o modal de inscrição no mesmo evento | Cupom não pré-preenchido (cache limpo). |
| 4 | Abrir `/evento/:slug?cupom=AAA` e, na mesma sessão, abrir inscrição | Cupom AAA da URL aplicado; cache atualizado com AAA. |
| 5 | Ter cache com cupom BBB para o evento; acessar `/evento/:slug?cupom=CCC` e abrir inscrição | Cupom CCC (URL tem prioridade); cache atualizado com CCC. |

**5.2 Ajustes**
- Remover ou reduzir `console.log` de debug deixados no RegistrationFlow (ex.: logs de URL params).
- Verificar se em algum fluxo (ex.: inscrição para outra pessoa) o `event.id` está sempre disponível onde se chama clear/save/get.

**Critério de conclusão:** Todos os cenários acima passando e código sem logs desnecessários.

---

## Conclusão Etapa 5 (ajustes realizados)

- **Logs:** Removidos os `console.log` de URL params (já feitos na Etapa 3) e o log de envio de dados de inscrição (`📤 Enviando dados de inscrição`) em `RegistrationFlow.tsx`.
- **event.id:** Em `EventDetails` usa-se `event?.id` no efeito; em `RegistrationFlow` o `event` é prop obrigatória, então `event.id` existe quando o modal está aberto e nas chamadas a clear/save/get.
- **Testes manuais:** Use a tabela da seção 5.1 acima para validar os cenários quando for testar em ambiente local ou staging.

---

## Ordem sugerida de implementação

1. **Etapa 1** – Utilitário de cache.  
2. **Etapa 2** – Gravar cache em EventDetails.  
3. **Etapa 3** – Ler cache e prioridade da URL em RegistrationFlow.  
4. **Etapa 4** – Limpar cache após inscrição em RegistrationFlow.  
5. **Etapa 5** – Testes manuais e ajustes.

---

## Resumo das mudanças por arquivo

| Arquivo | Alterações |
|---------|------------|
| `src/lib/referralCouponCache.ts` | **Novo.** Funções `saveReferralCoupon`, `getReferralCoupon`, `clearReferralCoupon` e TTL de 7 dias. |
| `src/pages/EventDetails.tsx` | `useEffect` que lê `cupom`/`ref` da URL e chama `saveReferralCoupon(event.id, …)`. |
| `src/components/event/RegistrationFlow.tsx` | No efeito de abertura do modal: priorizar URL; se vazio, usar `getReferralCoupon(event.id)`; ao usar URL, atualizar cache. No sucesso da inscrição: `clearReferralCoupon(event.id)`. |

Com isso, o plano está pronto para ser aplicado etapa a etapa.
