# Investigação técnica: kits, produtos, variações, atributos e inscrições

**Escopo:** levantamento ponta a ponta (modelagem, fluxos, UI, CSV, estoque).  
**Data da análise:** 2026-04-21  
**Restrição:** nenhuma alteração de código foi feita para este documento; baseado apenas no repositório atual.

---

## A. Modelo atual do domínio

### A.1 Tabelas e relações (PostgreSQL)

| Tabela | Papel |
|--------|--------|
| `event_kits` | Kit do evento: nome, descrição, preço, `event_id`, `display_order` (migração 049). |
| `kit_categories` | N:N entre `event_kits` e `categories`. Se o kit **não** tiver linhas aqui, o backend trata como “aparece em todas as categorias” (compatibilidade retroativa). |
| `kit_products` | Produto pertencente a um kit: `type` ∈ `variable` \| `unique`, `variant_attributes` (JSONB, array de nomes de atributos na ordem, ex.: `["Tamanho","Cor"]`). |
| `product_variants` | Variação concreta de um produto: `name` (convencionalmente `"Valor1 - Valor2 - ..."` alinhado a `variant_attributes`), `available_quantity`, `sku`, `price`, `variant_group_name`. |
| `registrations` | Inscrição: `kit_id` → `event_kits.id` (kit escolhido na inscrição). **Não** armazena texto de variação nem atributos diretamente na linha principal. |
| `registration_product_selections` | **Fonte canônica** das escolhas de produto/variação/atributo por inscrição: `registration_id`, `product_id` → `kit_products`, `variant_id` → `product_variants` (nullable), `attribute_name`, `attribute_value` (NOT NULL). **Uma linha por par atributo/valor** (várias linhas por produto). |

Migrações de referência: `001_initial_schema.sql` (kits/produtos/variantes/registrations), `016_add_variant_attributes.sql`, `073_create_kit_categories.sql`, `074_create_registration_product_selections.sql`, `014_add_variant_quantity.sql`, `013_add_variant_group_name.sql`, `015_add_variant_sku_price.sql`.

### A.2 Estrutura conceitual

- **Kit:** conjunto comercial vinculado ao evento (e opcionalmente a categorias via `kit_categories`), com preço próprio em `event_kits.price`.
- **Produto do kit:** item lógico (`kit_products`); pode ser `unique` (sem escolha de variação) ou `variable` (exige definição de `variant_attributes` + variantes em `product_variants`).
- **Variação:** linha em `product_variants`; o **nome** costuma codificar os valores dos atributos na ordem de `variant_attributes`, separados por `" - "`.
- **Atributo:** dimensão de escolha (ex.: “Tamanho”); valores efetivos ficam em `registration_product_selections.attribute_name` / `attribute_value`, replicados por linha. O `variant_id` pode estar preenchido para amarrar à variante e para **estoque**.

### A.3 Contrato de persistência na inscrição

O payload de criação/edição usa `product_selections[]` com:

- `product_id`
- `variant_id` (opcional)
- `attribute_selections` (opcional, mapa nome → valor)

O serviço `createRegistration` converte isso em **INSERTs múltiplos** em `registration_product_selections` (ver B.2).

---

## B. Fluxo atual de ponta a ponta

### B.1 Configuração (admin/organizador)

- **API:** `POST /api/events/:eventId/kits` → `syncEventKitsController` com schema Zod (`eventKitsController.ts`): kits com `products[]` (`type`, `variant_attributes`, `variants[]` com nome, estoque, SKU, etc.).
- **Persistência:** `eventKitsService.syncEventKits` grava `event_kits`, `kit_categories`, `kit_products`, `product_variants` (criação/atualização/remoção de variantes conforme payload).
- **Leitura para telas:** `GET /api/events/:eventId/kits?category_id=` → `getEventKits` inclui produtos, variantes e **contagem de uso** por variante via `registration_product_selections` (inscrições não canceladas do evento).

**Possível divergência painel vs backend:** o painel deve enviar `variant_attributes` coerentes com o formato dos `name` das variantes (`" - "`). Se `variant_attributes` estiver vazio/null para produto `variable`, o fluxo de parse na inscrição cai em **fallback** (ver B.2).

### B.2 Inscrição — persistência

**Serviço:** `registrationsService.createRegistration` após `INSERT` em `registrations`:

1. Se `product_selections` não veio vazio:
   - Valida estoque por `variant_id` (`getVariantRemainingStock`).
   - Para cada seleção:
     - **Prioridade 1:** se `attribute_selections` veio preenchido → um INSERT por par (com `variant_id` opcional).
     - **Prioridade 2:** se só `variant_id` → busca `product_variants.name` e `kit_products.variant_attributes`; faz parse `name.split(' - ')` e grava um INSERT por atributo; se **não** conseguiu (`variant_attributes` vazio ou incompatível), insere **uma** linha fallback: `attribute_name = 'Variante'`, `attribute_value = <nome da variante ou id>`.
2. **Importante:** erros ao salvar seleções são **capturados e logados**; a mensagem no código indica que **não bloqueiam** a criação da inscrição (`⚠️ Erro ao salvar seleções... (não bloqueia inscrição)`). Isso permite inscrição “sem” linhas em `registration_product_selections` mesmo quando o front enviou seleções.

**Origens do payload no frontend (amostra verificada):**

- `RegistrationFlow.tsx`: monta `product_selections` a partir de `selectedProducts` / `variantSelections` (inclui `variant_id` e opcionalmente `attribute_selections`).
- `RegisterAthleteStaffDialog.tsx`: mesmo padrão para organizador/super admin.
- `CompleteInvitationModal.tsx`: envia apenas `{ product_id, variant_id }` por produto — depende do **parse no backend** (Prioridade 2) para expandir atributos.

### B.3 Leitura para API/UI

- **`GET /api/registrations/:id` (`getRegistration`):** após `getRegistrationById` (SQL agregado **sem** `product_selections`), o controller chama `getRegistrationProductSelections(id)` e anexa `product_selections: [...]` ao JSON.
- **Formato retornado:** lista **plana** de linhas: `product_id`, `product_name`, `variant_id`, `variant_name`, `attribute_name`, `attribute_value` (`registrationProductSelectionsService.ts`).
- **Listagem paginada `getRegistrations`:** `mapRegistrationRows` **não** inclui `product_selections`; só enriquece pendências financeiras, `custom_field_values`, etc. Ou seja, **a lista não traz atributos de kit sem requisição extra.**

### B.4 Edição de inscrição

- **`PUT /registrations/:id`:** allowlist **não** inclui `product_selections`. Alterar kit/categoria não reescreve automaticamente `registration_product_selections` no mesmo endpoint (pode ficar **desalinhado** com o novo kit se não houver limpeza explícita em outro fluxo).
- **Atributos pós-inscrição:** `POST /registrations/:id/complete-attributes` → `completeRegistrationAttributes`:
  - Apaga seleções por `product_id` recebido e reinsere a partir de `attribute_selections`; resolve `variant_id` comparando atributos aos nomes das variantes quando omitido.
  - Permissões: admin; organizador se `enabled_modules.organizer_edit_attributes`; corredor titular/registrante.
- **Administração rica:** `AdminRegistrations.tsx` / `OrganizerRegistrations.tsx` em modo edição carregam `kitProducts` do kit e permitem `completeRegistrationAttributes` com produtos variáveis.
- **Drawer `EventRegistrationDetailSheet`:** edição de categoria/kit/modalidade/lote; **não** implementa UI de atributos de produto; apenas alerta se há `product_selections` e o kit foi alterado — reforço para usar “edição completa”.

### B.5 Exportação CSV

**Controller:** `exportRegistrationsController` (`registrationsController.ts`).

- Para cada inscrição exportada:
  - **KIT:** `reg.kit_name` (join da listagem).
  - **VARIAÇÃO:** função `getKitVariation` — **sempre retorna string vazia**, com comentário explícito `TODO: Add variant storage when implementing variant selection in registration` (ou seja, a coluna **não** reflete dados de `registration_product_selections`).
  - **ATRIBUTO:** `getProductAttributes(reg.id)` → `getRegistrationProductSelections`, agrupa por produto e formata `"Produto (attr: val; ...)"` concatenado.

**Observação:** a informação de variação **existe** no banco (`variant_name` por linha em `getRegistrationProductSelections`), mas **não** é usada na coluna VARIAÇÃO; parte dela pode aparecer indiretamente em ATRIBUTO ou nos valores parseados.

---

## C. O que está consistente hoje

- **Modelo relacional** claro: escolhas operacionais em `registration_product_selections`; estoque por variante com `available_quantity` e contagem de usos via `variant_id` + inscrições ativas.
- **API de detalhe** (`getRegistration`) devolve `product_selections` de forma previsível para telas que consomem o detalhe completo.
- **Serviço de estatísticas** `getAttributeSelectionStats` agrega por evento para visão operacional (contagens por atributo/valor).
- **Fluxo de configuração** de kits via `syncEventKits` alinhado ao schema Zod do controller.
- **Completar atributos** (`completeRegistrationAttributes`) é o caminho mais rigoroso para validar atributos vs variantes existentes e estoque.
- **CSV coluna ATRIBUTO** usa a mesma fonte que o detalhe (`getRegistrationProductSelections`), quando há linhas salvas.

---

## D. O que está inconsistente hoje

| Área | Problema |
|------|----------|
| **CSV** | Coluna **VARIAÇÃO** sempre vazia por implementação (`getKitVariation`), apesar de `variant_id`/`variant_name` existirem na leitura de seleções. |
| **CSV vs expectativa** | Operadores podem achar que “variação” está em VARIAÇÃO, mas o sistema coloca detalhes em **ATRIBUTO** (texto agregado). |
| **Criação de inscrição** | Falha ao persistir `registration_product_selections` **não falha** a transação principal → risco de inscrição com kit sem seleções persistidas. |
| **Produto variable sem `variant_attributes`** | Backend cai no fallback `attribute_name = 'Variante'`, que pode **não** refletir tamanhos nomeados esperados na operação. |
| **Listagem** | Tabelas de inscrições (ex.: painel por evento) mostram **nome do kit**, não atributos — exige abrir detalhe ou exportar. |
| **Drawer de evento** | Não exibe nem edita `product_selections`; só alerta ao mudar kit. |
| **PUT inscrição** | Mudança de `kit_id` sem reescrita coordenada de seleções pode gerar **dados órfãos ou semanticamente inválidos** (seleções de produto de kit antigo). |
| **Convite (`CompleteInvitationModal`)** | Só manda `variant_id`; depende do parse `" - "` e de `variant_attributes` corretos no cadastro do produto. |

---

## E. Diagnóstico técnico

### E.1 Hipóteses mais prováveis para “variação não aparece na edição/CSV”

1. **CSV:** causa **certa** para coluna VARIAÇÃO vazia — não é falta de dado no banco, é **lógica de export** não implementada.
2. **Edição (drawer evento):** **não há** UI de atributos — não é necessariamente perda de dado; é **escopo da tela**.
3. **Dados ausentes em `registration_product_selections`:** possível por (a) erro silencioso no insert na criação, (b) fluxo que nunca chamou `complete-attributes`, (c) produto mal configurado (`variable` sem `variant_attributes`), (d) remoção via `removeRegistrationAttributes`.
4. **Desalinhamento kit vs seleções:** após edição de kit pela API sem atualizar seleções, a UI pode mostrar kit novo e seleções antigas ou vazias conforme o caso.

### E.2 Gravidade por área

| Área | Gravidade | Comentário |
|------|-----------|------------|
| Exportação VARIAÇÃO | Média | Impacto operacional e confiança na planilha; dado pode existir em ATRIBUTO. |
| Insert silencioso na criação | **Alta** | Pode gerar inscrições sem rastreio de tamanho em produção. |
| Edição de kit sem seleções | Média/Alta | Risco de inconsistência e conferência errada. |
| Exibição só no detalhe | Baixa/Média | Esperado pelo design atual da listagem. |

### E.3 Impacto na produção atual

- **Estoque:** baseado em `variant_id` nas seleções + `available_quantity`; se seleções não foram gravadas, **subutilização** de estoque ou decisões manuais erradas.
- **Entrega / conferência:** depende de CSV ou telas; CSV pode estar **incompleto na coluna errada** (VARIAÇÃO vazia).
- **Histórico:** linhas antigas podem não ter `registration_product_selections` (pré-migração 074 ou falha silenciosa).

---

## F. Estratégia segura de correção (futura — não implementada aqui)

Ordem sugerida para minimizar risco a inscrições existentes:

1. **Auditoria somente leitura em produção:** consultas agregadas — inscrições com `kit_id` preenchido e **zero** linhas em `registration_product_selections` onde o kit tem produtos `variable` com `variant_attributes`; amostra por evento.
2. **Corrigir export CSV sem mudar dados:** popular VARIAÇÃO a partir de `variant_name` ou agregação de atributos; documentar semântica das colunas para operação.
3. **Endurecer criação (opcional, com feature flag):** falhar ou reprocessar se `product_selections` obrigatórios não persistirem — **só** após métricas da auditoria.
4. **Alinhar edição de kit:** ao mudar `kit_id` no `PUT`, política explícita: limpar seleções, bloquear até `complete-attributes`, ou copiar apenas se produtos compatíveis (definir regra de negócio).
5. **Drawer / painel evento:** leitura somente de `product_selections` (agrupada) antes de permitir edição avançada; edição de atributos reutilizando `completeRegistrationAttributes` ou fluxo igual `AdminRegistrations`.
6. **Monitoramento:** reduzir logs de debug em export em produção após estabilizar (hoje há `console.log` nas primeiras linhas).

Sempre: migrações de **backfill** apenas após critérios claros (ex.: inferir variante a partir de dados legados é arriscado).

---

## G. Arquivos e áreas envolvidos

### Backend

| Caminho | Papel |
|---------|--------|
| `backend/migrations/001_initial_schema.sql` | Schema base kits/produtos/variantes/inscrições. |
| `backend/migrations/016_add_variant_attributes.sql` | `kit_products.variant_attributes`. |
| `backend/migrations/073_create_kit_categories.sql` | N:N kit–categoria. |
| `backend/migrations/074_create_registration_product_selections.sql` | Tabela de seleções. |
| `backend/src/services/eventKitsService.ts` | CRUD/sync kits, produtos, variantes, uso por variante. |
| `backend/src/controllers/eventKitsController.ts` | API + validação Zod. |
| `backend/src/services/registrationsService.ts` | `createRegistration` (insert seleções), `getVariantRemainingStock`, `completeRegistrationAttributes`, `removeRegistrationAttributes`, `completeInvitationRegistration`, `mapRegistrationRows` (sem product_selections). |
| `backend/src/services/registrationProductSelectionsService.ts` | Leitura seleções + estatísticas. |
| `backend/src/controllers/registrationsController.ts` | `getRegistration`, export CSV, `completeRegistrationAttributesController`, create/update registration. |
| `backend/src/routes/registrations.ts` | Rotas registradas. |

### Frontend

| Caminho | Papel |
|---------|--------|
| `src/components/event/RegistrationFlow.tsx` | Montagem `product_selections` na inscrição pública. |
| `src/components/registration/RegisterAthleteStaffDialog.tsx` | Inscrição staff. |
| `src/components/runner/CompleteInvitationModal.tsx` | Convite — só `variant_id`. |
| `src/components/admin/AdminRegistrations.tsx` | Visualização agrupada + edição + `completeRegistrationAttributes`. |
| `src/components/organizer/OrganizerRegistrations.tsx` | Idem organizador (com flag módulo). |
| `src/components/event-registrations/EventRegistrationDetailSheet.tsx` | Sem bloco de `product_selections` (alerta ao mudar kit). |
| `src/components/event-registrations/EventRegistrationsPanel.tsx` | Listagem sem atributos de produto. |
| `src/lib/api/registrations.ts` | Tipos `ProductSelection`, APIs `createRegistration`, `completeRegistrationAttributes`, export. |
| `src/lib/api/eventKits.ts` | Tipos kit/produto/variação no front. |

---

## Resumo executivo

- A **verdade operacional** das escolhas de produto/variação/atributo está em **`registration_product_selections`**, alimentada na criação (com risco de falha silenciosa) e refinada por **`complete-attributes`**.
- O **detalhe autenticado** da inscrição expõe `product_selections` corretamente para quem consome `GET /registrations/:id`.
- A **listagem** e o **drawer do evento** não expõem esses dados na mesma profundidade que a central de inscrições.
- O **CSV** mistura conceitos: coluna **VARIAÇÃO** está deliberadamente vazia; **ATRIBUTO** carrega o texto agregado a partir das seleções — isso explica parte das “inconsistências” relatadas sem necessariamente indicar perda no banco.

Fim do documento de investigação.
