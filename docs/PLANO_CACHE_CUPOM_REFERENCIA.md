# Plano: Cache de cupom/referência para inscrição no evento

## 1. Contexto e problema

### Fluxo atual
- O **líder de grupo** compartilha um link de comissão por evento (ex.: `https://cronoteam.com.br/evento/corrida-xyz?cupom=ABC123`).
- O **corredor** acessa esse link, vê a página do evento com o cupom na URL.
- Ao clicar em "Inscrever-se", o **RegistrationFlow** (modal de inscrição) lê `searchParams.get('cupom')` e `searchParams.get('ref')` **somente da URL no momento em que o modal abre**.
- Se o corredor **sair** (fechar aba, ir para home, buscar o evento de outro lugar) e **voltar depois** para a página do evento **sem** os parâmetros na URL (ex.: `https://cronoteam.com.br/evento/corrida-xyz`), o cupom **não é aplicado**.

### Problema resumido
O cupom/ref existe apenas na URL. Quem não chega pelo link de comissão na hora da inscrição perde o desconto e a atrelagem ao líder, mesmo tendo acessado o link antes.

---

## 2. Objetivo

Persistir o **cupom** (e, se fizer sentido, o **ref**) quando o usuário acessar qualquer URL que contenha esses parâmetros, e **reutilizá-los** quando ele abrir o fluxo de inscrição no evento, **mesmo que retorne depois sem os parâmetros na URL**.

---

## 3. Escopo técnico atual (referência)

| Onde | O que usa | Observação |
|------|------------|------------|
| **Cadastro (novo usuário)** | `ref` na URL + `localStorage.registration_referral_code` | Já persiste ref para o formulário de cadastro. |
| **Inscrição no evento (RegistrationFlow)** | `searchParams.get('cupom')` e `searchParams.get('ref')` | Só lê da URL ao abrir o modal; **não há persistência**. |
| **Link do líder** | `commission.coupon.link` (URL completa com cupom) | Ex.: `/evento/:slug?cupom=CODIGO`. |

---

## 4. Proposta de solução: cache no cliente

### 4.1 Ideia geral
- **Gravar** em storage (localStorage recomendado) sempre que a aplicação detectar `cupom` ou `ref` na URL em páginas relevantes (página do evento, página de cadastro, etc.).
- **Ler** desse cache quando o fluxo de inscrição no evento abrir: se não houver cupom/ref na URL, usar o valor armazenado para aquele evento (ou regra global, conforme definido abaixo).
- **Limpar** o cache em situações definidas (ex.: após inscrição concluída para aquele evento, ou por TTL).

### 4.2 Onde gravar
- **Página do evento** (`/evento/:slug`): ao montar ou ao detectar `cupom`/`ref` na URL, gravar no cache.
- **Página de cadastro** (`/cadastro?ref=...`): já existe lógica com `registration_referral_code`; pode-se alinhar ou estender para o mesmo formato de cache, se quisermos um único mecanismo para ref/cupom.

### 4.3 Formato do cache (sugestão)

**Opção A – Por evento (recomendada)**  
- Chave: por exemplo `referral_coupon_event_{eventId}` (ou `event_slug` se for estável).
- Valor: `{ cupom: string, ref?: string, savedAt: string }`.
- Vantagem: cupom do evento A não interfere no evento B; ao abrir inscrição no evento A, usa o cupom salvo para A.

**Opção B – Global (último cupom/ref)**  
- Chave: `referral_coupon_global`.
- Valor: `{ cupom?: string, ref?: string, eventId?: string, savedAt: string }`.
- Vantagem: implementação simples; desvantagem: se o usuário acessar links de dois eventos, só o último fica salvo.

**Recomendação:** Opção A (por evento), com opcional de fallback para um cache global quando não houver evento no contexto (ex.: primeiro acesso pelo link de cadastro e depois navegação para um evento).

### 4.4 Quando ler no RegistrationFlow
- Ao abrir o modal de inscrição:
  1. Se houver `cupom` ou `ref` na URL → usar e (opcionalmente) atualizar o cache para aquele evento.
  2. Se **não** houver na URL → ler do cache por evento (`referral_coupon_event_{eventId}`); se existir e não estiver expirado, usar e pré-preencher/validar o cupom.

### 4.5 Quando limpar
- **Inscrição concluída** para aquele evento: remover a chave `referral_coupon_event_{eventId}` (evita reutilizar cupom em nova inscrição no mesmo evento, se a regra de negócio for “um cupom por inscrição”).
- **TTL (tempo de vida):** opcional. Ex.: expirar após 7 ou 30 dias (`savedAt` + dias); ao ler, se expirado, ignorar e remover.
- **Logout:** opcional limpar todo o cache de cupom/ref, para não vincular próximo usuário ao anterior no mesmo dispositivo.

### 4.6 Privacidade e segurança
- Cache apenas no cliente (localStorage); não enviar o cupom salvo para o backend além do que já é enviado hoje ao criar a inscrição.
- Cupom continua validado no backend ao criar a inscrição; o cache só afeta qual valor é enviado a partir do front.

---

## 5. Passos de implementação sugeridos

1. **Definir contrato do cache**
   - Nome das chaves, formato do valor (cupom, ref, savedAt, eventId/slug), TTL em dias (se houver).

2. **Camada de utilidade (ex.: `src/lib/referralCouponCache.ts`)**
   - `saveReferralCoupon(eventId: string, cupom?: string, ref?: string)`
   - `getReferralCoupon(eventId: string): { cupom?, ref?, savedAt } | null`
   - `clearReferralCoupon(eventId: string)` (após inscrição concluída)
   - (Opcional) `clearExpired()` ou checagem de TTL dentro de `get`.

3. **EventDetails (página do evento)**
   - No mount ou no efeito que observa a URL: se `searchParams` tiver `cupom` ou `ref`, chamar `saveReferralCoupon(event.id, cupom, ref)`.

4. **RegistrationFlow**
   - Ao abrir o modal: além da URL, chamar `getReferralCoupon(event.id)`. Se não houver cupom/ref na URL e houver no cache (e não expirado), usar e pré-preencher/validar o cupom.
   - Após criar inscrição com sucesso: chamar `clearReferralCoupon(event.id)`.

5. **Cadastro (opcional)**
   - Se quisermos que um `ref` vindo de `/cadastro?ref=...` também sirva para um evento depois, podemos gravar em formato global ou por evento quando houver evento na sessão; caso contrário, manter apenas `registration_referral_code` como hoje.

6. **Testes manuais**
   - Acessar `/evento/:slug?cupom=XXX`, fechar o modal, navegar para home e voltar para `/evento/:slug` (sem params). Abrir inscrição e conferir se o cupom aparece aplicado.
   - Concluir uma inscrição e verificar se, ao abrir nova inscrição no mesmo evento, o cupom não vem pré-preenchido (ou conforme regra desejada).

---

## 6. Alternativas consideradas (resumo)

| Abordagem | Prós | Contras |
|-----------|------|--------|
| **Cache no cliente (localStorage)** | Não depende de backend; rápido de implementar; funciona offline/recarregar | Limpeza de cache depende de regras claras (TTL, após inscrição) |
| **Cookie** | Pode ser enviado em toda requisição ao mesmo domínio | Mais sensível a expiração e path; não necessário para esse caso |
| **Backend (sessão)** | Controle centralizado | Exige login/sessão antes de inscrever; corredor pode ainda não estar logado |
| **Só URL (manter como está)** | Nenhuma mudança | Problema atual permanece |

---

## 7. Decisões a tomar antes de implementar

1. **Cache por evento vs global**  
   - Recomendação: **por evento** (Opção A).

2. **TTL do cache**  
   - Ex.: 7, 15 ou 30 dias; ou sem TTL e limpar só ao concluir inscrição ou ao logout.

3. **Limpar ou não após uma inscrição concluída**  
   - Recomendação: **limpar** para aquele evento, para evitar reutilizar o mesmo cupom em outra inscrição no mesmo evento (se a regra for uma inscrição por cupom).

4. **Manter `ref` no cache junto com `cupom`**  
   - Útil se o backend ou o fluxo usam `ref` em algum passo da inscrição; manter ambos no mesmo objeto salvo por evento.

5. **Comportamento quando há cupom na URL e cupom no cache**  
   - Proposta: **URL tem prioridade**; ao usar cupom da URL, atualizar o cache para aquele evento.

---

## 8. Resumo

- **Problema:** Cupom/ref só é lido da URL; ao sair e voltar sem os parâmetros, o cupom não é aplicado.
- **Solução:** Cache em localStorage (por evento), gravado ao detectar `cupom`/`ref` na página do evento e lido ao abrir o fluxo de inscrição; limpeza ao concluir inscrição (e opcionalmente por TTL ou logout).
- **Próximo passo:** Definir as decisões do §7 e implementar conforme os passos do §5.
