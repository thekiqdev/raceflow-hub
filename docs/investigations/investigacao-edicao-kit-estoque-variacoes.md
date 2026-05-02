# Investigação: política de edição/troca de kit, estoque de variações e consistência com `registration_product_selections`

**Escopo:** análise técnica apenas (sem correção implementada neste documento).  
**Contexto:** domínio de kits/produtos/variações já mapeado; criação endurecida opcionalmente via `STRICT_KIT_SELECTIONS`; auditoria read-only para inscrições sem seleções canônicas.

---

## A. Modelo atual de estoque e variações

### Tabelas e campos relevantes

| Artefato | Papel |
|----------|--------|
| `product_variants` | Uma linha por variante (ex.: “P - Azul”). Campo **`available_quantity`**: inteiro **ou `NULL`**. Comentário na migration: **`NULL` = ilimitado**. |
| `kit_products` | Produto dentro do kit (`type`: `variable` \| `unique`). `variant_attributes` (JSON) define nomes dos atributos para parse/UI. |
| `registration_product_selections` | **Fonte canônica operacional** das escolhas: `registration_id`, `product_id` (FK → `kit_products.id`), **`variant_id`** (FK → `product_variants.id`, pode ser `NULL`), `attribute_name`, `attribute_value`. |
| `registrations` | `kit_id`, `status`, `event_id`, etc. **Não** armazena estoque; impacta estoque **indiretamente** via regras de contagem. |

### Relações importantes

- `registration_product_selections.registration_id` → `registrations(id)` **ON DELETE CASCADE**.
- `registration_product_selections.product_id` → `kit_products(id)` **ON DELETE CASCADE** (exclusão do produto do kit remove linhas de seleção).
- `variant_id` **SET NULL** na variante apagada (migration 074).

### Fonte de verdade do “estoque restante”

Não existe tabela de movimentação nem reserva explícita. O modelo é **híbrido**:

1. **Teto configurado:** `product_variants.available_quantity` (quando não `NULL`).
2. **Consumo derivado:** contagem de **inscrições** que referenciam aquela variante em `registration_product_selections`, com join em `registrations`.

Função central: **`getVariantRemainingStock`** (`backend/src/services/registrationsService.ts`):

- Lê `available_quantity` da variante.
- Se `NULL` → retorna `null` (**ilimitado** para validação de “esgotado”).
- Caso contrário, calcula uso com:

```sql
SELECT COUNT(DISTINCT rps.registration_id)::int AS cnt
FROM registration_product_selections rps
INNER JOIN registrations r ON r.id = rps.registration_id
  AND r.status != 'cancelled'
  AND r.event_id = $2
WHERE rps.variant_id = $1
  AND ($3::uuid IS NULL OR rps.registration_id != $3)
```

- **Saldo:** `max(0, available_quantity - uso)`.
- Parâmetro **`excludeRegistrationId`**: exclui a própria inscrição da contagem (útil ao **trocar** variante na mesma inscrição em fluxos que revalidam estoque).

### Exibição em listagem de kits (API)

Em **`getEventKits`** / montagem de kits (`backend/src/services/eventKitsService.ts`), o uso por evento é agregado assim:

- Agrupa `variant_id` com `COUNT(DISTINCT rps.registration_id)` para inscrições **`r.status != 'cancelled'`** e `r.event_id = evento`.
- `available_quantity` exposto ao cliente vira **restante** = `max(0, base - uso)` (coerente com `getVariantRemainingStock` no mesmo critério de status).

### Linhas sem `variant_id`

A contagem de uso filtra **`rps.variant_id = $1`**. Linhas canônicas **somente com atributos** e `variant_id IS NULL` **não entram** na contagem de nenhuma variante → **não consomem** o estoque configurado por variante, mesmo que semanticamente representem um tamanho escolhido.

---

## B. Fluxo atual de ponta a ponta

### Criação de inscrição (`createRegistration`)

- Se há `product_selections` com `variant_id`, **antes de inserir** linhas em `registration_product_selections`, valida estoque com `getVariantRemainingStock` (sem excluir a inscrição ainda inexistente).
- Persistência: múltiplas linhas por produto (uma por atributo ou fallback `attribute_name = 'Variante'`).
- **Não** decrementa `product_variants.available_quantity`: o “consumo” é **só pela contagem** das linhas com `variant_id` + inscrição ativa no sentido da query.
- **Status considerados no uso:** todos **exceto `cancelled`** (ver detalhe em D).

### Edição genérica (`PUT` → `updateRegistrationController` → `updateRegistration`)

- **Allowlist** de campos: inclui `category_id`, `kit_id`, `modality_id`, `category_batch_id`, `custom_field_values`, status/pagamento (admin), etc.
- **Não** inclui `product_selections`.
- **`updateRegistration` (serviço):** apenas `UPDATE registrations ...` e, se enviado, sincroniza **custom fields**; **não lê nem altera `registration_product_selections`**.

**Consequência direta:** ao **trocar `kit_id`** (admin/organizador/dono, conforme permissões), o registro passa a apontar para outro kit, mas **as linhas em `registration_product_selections` permanecem** ligadas aos **`kit_products.id` do kit antigo** e aos **`variant_id` antigos**. Não há política automática de limpeza, realinhamento nem revalidação de estoque do novo kit nesse endpoint.

### Pré-visualização de edição (`POST .../preview-edit`)

- Recalcula totais / diferenças financeiras (`calculateRegistrationTotal`, taxas).
- **Não** modela impacto em estoque nem em seleções.

### Troca de variante / atributos (fluxos dedicados)

| Fluxo | Comportamento |
|--------|----------------|
| **`completeRegistrationAttributes`** (corredor completa atributos faltantes) | Valida produtos do **kit atual** da inscrição; checa estoque com `excludeRegistrationId`; **apaga** seleções por `product_id` afetados e reinsere; resolve `variant_id` a partir de `attribute_selections` quando possível para alinhar estoque. |
| **`removeRegistrationAttributes`** | **DELETE** em `registration_product_selections` (total ou por produto). Comentário no código: *“estoque é calculado por contagem; não é preciso devolver”* — correto para o modelo derivado. |
| **`completeInvitationRegistration`** | Atualiza categoria/modalidade/kit; **apaga todas** as seleções e reinsere a partir do payload; valida estoque antes de inserir. |
| **Convite do líder com opções** (`leaderInvitationsService`, ramo `hasLeaderChoices`) | Ao persistir `product_selections`, faz **`DELETE FROM registration_product_selections`** da inscrição bônus e reinsere — alinhado com convite completo. |
| **“Corredor escolhe” no convite** (`runnerChoosesFlag`) | Zera `kit_id` (e categoria/modalidade) e **apaga** `registration_product_selections` — libera contagem de estoque associada a `variant_id` da inscrição bônus. |

### Cancelamento (`cancelRegistration`)

- Apenas **`UPDATE registrations SET status = 'cancelled'`**.
- **Não** apaga `registration_product_selections`.
- Como o uso conta só inscrições com **`r.status != 'cancelled'`**, a variante **deixa de contar** no saldo → efeito equivalente a **“liberar”** unidade no modelo derivado.

### Exclusão (`deleteRegistration`)

- **`DELETE FROM registrations`**; por **CASCADE**, remove linhas em `registration_product_selections` (e demais dependentes).
- Estoque “volta” pelo mesmo mecanismo (menos uma inscrição contando).

---

## C. O que está consistente hoje

- **Modelo único e previsível:** saldo = `available_quantity` (teto) − contagem de inscrições **não canceladas** com `variant_id` igual, **por evento**.
- **`COUNT(DISTINCT registration_id)`:** uma inscrição com várias linhas de atributo para a **mesma** variante conta **uma vez** no uso daquela variante — adequado para “1 kit / 1 unidade da variante por inscrição”.
- **Cancelamento e exclusão** “devolvem” capacidade sem atualizar coluna de estoque (coerente com desenho derivado).
- **Fluxos que regravam seleções** (completar atributos, completar convite, convite com escolhas do líder) **apagam e reinserem** `registration_product_selections` de forma alinhada ao kit informado.
- **Comentários no código** em `removeRegistrationAttributes` e `cancelRegistration` deixam explícita a intenção de estoque por contagem.
- **UI de alerta** (ex.: drawer de inscrição no evento) avisa quando há seleções e o kit é alterado — mitigação **só de UX**, não de backend.

---

## D. O que está inconsistente ou arriscado

### 1. Troca de `kit_id` via `updateRegistration` sem tocar em seleções

- **Dados órfãos / desalinhados:** `registrations.kit_id` novo × `registration_product_selections.product_id` ainda apontando para produtos do kit antigo.
- **Operação e relatórios:** CSV/export que assumem coerência kit × seleções podem exibir combinações impossíveis na prática.
- **Estoque:**
  - Variantes do **kit antigo** podem continuar **contando** uso enquanto a inscrição não for cancelada e as linhas não forem removidas.
  - Variantes do **kit novo** **não** são consumidas por essa inscrição até alguém corrigir seleções por outro fluxo.
- **Risco:** superalocação “fantasma” no kit antigo + subutilização no novo; conferência física de tamanhos **incorreta** em relação ao kit entregue.

### 2. Status que ainda consomem estoque

A contagem usa **`r.status != 'cancelled'`** apenas. Portanto **ainda consomem** (se tiverem `variant_id` nas seleções), entre outros:

- `pending`, `confirmed`, `transferred`, `refund_requested`, `refunded`, etc.

**Implicações:**

- **Pendente paga ou não:** conta igual → funciona como **reserva desde a inscrição**, não desde o pagamento.
- **Transferida / reembolsada:** se a política de negócio for “só quem vai correr consome camiseta”, o modelo atual pode **manter** consumo até cancelamento ou remoção de seleções — possível **distorção** operacional.

### 3. Seleções sem `variant_id`

- **Não entram** na contagem de uso por variante.
- Cenários: falhas antigas de persistência, só atributos sem resolução de variante, bugs de parse.
- **Risco:** estoque **superestimado** (mais vagas na prática do que o número mostra) se a operação depender dessas linhas como “tamanho escolhido”.

### 4. Divergência possível entre `getVariantRemainingStock` e agregado em `getEventKits`

- Ambos usam **`status != 'cancelled'`** e contagem por `variant_id` no evento — **alinhados** na leitura atual do código.
- **Diferença conceitual:** em momentos de edição, `getVariantRemainingStock` pode receber `excludeRegistrationId`; o mapa global em `getEventKits` **não** exclui inscrição específica — normal para listagem, mas operadores devem entender o papel do parâmetro nas validações pontuais.

### 5. Inscrições “inconsistentes” (kit variável sem `registration_product_selections`)

- **Não consomem** estoque por variante (ausência de linhas com `variant_id`).
- **Risco operacional:** vaga de tamanho pode aparecer disponível na UI mas o corredor **sem tamanho definido** — já coberto pela auditoria read-only em outra frente.

### 6. Edição de categoria que muda kits disponíveis

- Só altera `category_id` (e eventualmente lote/modalidade); **não** limpa seleções.
- Mesma classe de problema da troca de kit: seleções podem ficar ligadas a produtos que **não pertencem** ao novo contexto operacional.

---

## E. Diagnóstico técnico (adequação ao caso real da plataforma)

### O que está bom para operação típica (camiseta por tamanho, limite por variante)

- **Configuração simples:** um número por variante em `available_quantity`.
- **Sem necessidade de job de “baixa”:** cancelar ou apagar inscrição ajusta o saldo exibido automaticamente.
- **Validação na criação e em fluxos de completar convite/atributos** reduz escolha de variante esgotada (quando `variant_id` está correto e a contagem reflete a realidade).

### O que é frágil

- **Ausência de política transacional única** entre `registrations.kit_id` e `registration_product_selections` na edição administrativa.
- **Semântica de “quem consome”** (pendente vs confirmado; transferido vs cancelado) **fixada implicitamente** pelo SQL (`!= cancelled`) sem documento de produto — pode não bater com regras de negócio de eventos reais.
- **Dependência de `variant_id`** para qualquer número confiável de estoque; dados só com atributos ou legados inconsistentes **furam** o controle.

### O que pode estar “errado” do ponto de vista de negócio (não necessariamente bug de código)

- Tratar **qualquer** status não cancelado como ocupando estoque pode ser **agressivo** (muitos pendentes) ou **correto** (reserva de material) — depende da política desejada.
- **Troca de kit** sem sincronizar seleções é o maior **desalinhamento** entre “estoque lógico”, “kit contratado” e “dado operacional de tamanho”.

**Conclusão:** o mecanismo de **saldo derivado** é **adequado como MVP** e fácil de operar, **desde que** (1) todas as escolhas relevantes tenham `variant_id` persistido, (2) edições de kit/categoria **ou** limpem/recriem seleções **ou** sejam proibidas sem fluxo dedicado, e (3) a regra “quem consome” por status esteja **explicitamente** aceita pelo negócio.

---

## F. Política segura recomendada (sem implementação neste documento)

### Troca / edição de kit (e categoria quando afeta kit)

1. **Nunca** atualizar só `kit_id` (ou categoria) sem **uma** das seguintes:
   - **Limpar** `registration_product_selections` e forçar nova coleta (modal, fluxo “completar atributos”, ou tela de edição que envia `product_selections` para um endpoint que faça delete+insert como no convite); **ou**
   - **Rejeitar** a alteração se existir kit com produto variável e seleções incompatíveis com o novo kit; **ou**
   - **Mapear** produtos/variantes entre kits (só quando houver regra de negócio clara — raro).

2. Ordem sugerida em implementação futura: validar novo kit → opcionalmente recalcular preço (já existe) → **sincronizar ou apagar seleções** → validar estoque das **novas** variantes → persistir.

3. **Auditoria:** reutilizar critérios existentes (kit variável sem linhas) + eventual relatório “`kit_id` da inscrição não contém o `product_id` das seleções”.

### Estoque

1. **Manter** `available_quantity` como teto e contagem como uso **se** a política de status for clarificada e documentada.
2. **Documentar oficialmente:** pendentes consomem ou não; transferidos/reembolsados consomem ou não — ajustar SQL futuramente se necessário (ex.: só `confirmed` ou `confirmed` + `paid`).
3. **Curto prazo sem mudar schema:** garantir que todo fluxo que representa “tamanho” persista **`variant_id`** (já é direção da investigação anterior).
4. **Médio prazo (opcional):** tabela de **movimentos** ou **reservas** se o negócio exigir histórico, auditoria fina ou timeouts de reserva — não obrigatório se a regra de status for bem definida.

### Ordem segura para correções futuras (sugerida)

1. Fechar **política de negócio** por status (consumo de estoque).
2. Endurecer **edição de kit/categoria** (backend + UI) com sincronização explícita de seleções.
3. Revisar legado: inscrições com seleções incompatíveis com `kit_id` atual (relatório, correção manual ou assistida — **sem** backfill automático sem critério).
4. Só então avaliar **refino** (reserva explícita, múltiplos eventos compartilhando variantes globais, etc.).

---

## G. Arquivos e áreas envolvidas

### Backend — serviços

| Arquivo | Tópico |
|---------|--------|
| `backend/src/services/registrationsService.ts` | `getVariantRemainingStock`; `createRegistration` (validação de estoque + insert em `registration_product_selections`); `updateRegistration` (**não** altera seleções); `completeRegistrationAttributes`; `removeRegistrationAttributes`; `completeInvitationRegistration`; `cancelRegistration`; `deleteRegistration`; `getRegistrationsWithMissingAttributes` (usa estoque para `in_stock`). |
| `backend/src/services/eventKitsService.ts` | Listagem de kits: uso por variante no evento; `available_quantity` como **restante** na API. |
| `backend/src/services/registrationProductSelectionsService.ts` | Leitura plana das seleções (join com kit via `kit_products`). |
| `backend/src/services/kitSelectionPolicyService.ts` | Política de criação estrita (não altera estoque diretamente; indiretamente reduz inscrições sem seleção). |
| `backend/src/services/registrationKitSelectionAuditService.ts` | Auditoria sem linhas em `registration_product_selections`. |
| `backend/src/services/leaderInvitationsService.ts` | Limpeza de seleções quando corredor escolhe; regravação com `DELETE` + insert ao definir kit/variantes pelo líder; validação de estoque. |

### Backend — controllers / rotas

| Área | Tópico |
|------|--------|
| `backend/src/controllers/registrationsController.ts` | `updateRegistrationController` (mudança de `kit_id` **sem** `product_selections`); `previewRegistrationEditController` (só financeiro). |
| `backend/src/routes/registrations.ts` | Rotas `PUT /:id`, `POST /:id/preview-edit`, atributos, cancelar, excluir. |

### Migrations / schema

| Arquivo | Tópico |
|---------|--------|
| `backend/migrations/014_add_variant_quantity.sql` | `product_variants.available_quantity`. |
| `backend/migrations/074_create_registration_product_selections.sql` | Tabela canônica e FKs. |

### Frontend (impacto operacional / UX, não regra de estoque)

- `src/components/event/RegistrationFlow.tsx` — criação com `product_selections`.
- `src/components/event-registrations/EventRegistrationDetailSheet.tsx` — alerta ao mudar kit com seleções existentes.
- `src/components/admin/AdminRegistrations.tsx`, `src/components/organizer/OrganizerRegistrations.tsx` — edição de inscrição / remoção de atributos / exibição agrupada.
- `src/components/runner/CompleteInvitationModal.tsx`, `MissingAttributesModal.tsx` — convite e atributos pendentes.

---

**Fim do documento de investigação.** Próximo passo recomendado: validação de produto/negócio sobre **status que consomem estoque** e decisão explícita sobre **troca de kit** antes de qualquer patch em `updateRegistration` ou na UI de edição.
