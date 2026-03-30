# Plano 1: Abas Premiação e Cronograma no cadastro de eventos

---

## 1. Contexto

As informações do evento são organizadas em **abas** (Detalhes, Modalidades, Categorias, Kits, Retirada, Pagamentos, Publicação, Inscrições). Não existem campos específicos para o organizador informar **premiação** nem **cronograma** do evento; essas informações, quando existem, costumam ficar em descrição ou em links externos. A **página de inscrição** do evento exibe dados do evento (título, data, local, descrição, etc.) mas não possui seções dedicadas para premiação e cronograma.

**Ponto importante:** Em eventos de corrida o cronograma costuma ser usado em **formato timeline** (ex.: 06:00 – abertura da arena; 07:00 – aquecimento; 07:30 – largada kids; 08:00 – largada 5km). Se houver apenas texto livre, organizadores tendem a escrever de forma inconsistente. Por isso o plano prevê, além do texto livre opcional, uma **versão visual/estruturada** do cronograma: itens com horário, título e descrição, exibidos como timeline na página de inscrição.

---

## 2. Objetivo

- Incluir duas novas **abas** no cadastro/edição de eventos: **Premiação** e **Cronograma**.
- **Premiação:** uso do editor **TipTap** para texto formatado (premiações, pódios, categorias premiadas); opcional.
- **Cronograma:**
  - **Versão estruturada (recomendada):** itens de cronograma com horário, título e descrição, ordenáveis, permitindo exibir na página de inscrição em **formato timeline** (ex.: 07:00  Aquecimento | 08:00  Largada 5km | 08:10  Largada 10km).
  - **Texto livre (opcional):** campo TipTap para informações adicionais de cronograma, quando o organizador quiser complementar.
- Premiação e cronograma devem **aparecer na página de inscrição** do evento, para o corredor visualizar antes ou durante a inscrição.

---

## 3. Estado atual

| Aspecto | Comportamento atual |
|--------|----------------------|
| **Edição do evento** | Dialog (ou tela) com abas: Detalhes, Modalidades, Categorias, Kits, Retirada, Pagamentos, Publicação, Inscrições. |
| **Premiação** | Não há campo específico; eventualmente descrição ou link externo. |
| **Cronograma** | Não há campo específico; eventualmente descrição ou link externo. |
| **Página de inscrição** | Exibe dados do evento (título, data, local, descrição, etc.); não exibe blocos “Premiação” nem “Cronograma”. |
| **Backend (events)** | Tabela `events` sem colunas `premiacao` nem `cronograma`; não existe tabela de itens de cronograma. |

---

## 4. Arquitetura alvo

### 4.1 Premiação

- **Cadastro:** Aba **Premiação** com editor **TipTap** (texto rico); campo opcional.
- **Backend:** Campo `premiacao` (TEXT, nullable) na tabela `events`, armazenando HTML.
- **Exibição (página de inscrição):** Bloco “Premiação” só aparece se houver conteúdo; renderização do HTML com **sanitização** (ex.: DOMPurify).

### 4.2 Cronograma – versão estruturada (timeline) + texto livre

- **Estrutura de dados (timeline):**
  - Nova tabela **`cronograma_items`**:
    - `id` (PK, UUID)
    - `event_id` (FK para `events`, ON DELETE CASCADE)
    - `time` (VARCHAR(5), formato **HH:mm** – ex.: "06:00", "07:30", "08:10")
    - `title` (VARCHAR(120) NOT NULL) – obrigatório, máx. 120 caracteres
    - `description` (TEXT, nullable) – texto opcional do item
    - `display_order` (INTEGER NOT NULL) – ordem de exibição (1, 2, 3…); **UNIQUE (event_id, display_order)** para evitar duplicidade no mesmo evento
    - Índices: `(event_id, display_order)` e `(event_id)`
  - Permite renderizar na página de inscrição em **formato timeline** (ex.: 07:00  Aquecimento | 08:00  Largada 5km), de forma consistente e visual.

- **Texto livre (complementar):**
  - Campo `cronograma` (TEXT, nullable) na tabela `events` para HTML do TipTap, quando o organizador quiser adicionar informações em texto livre além dos itens.
  - Opcional; pode ficar vazio se o organizador usar apenas os itens estruturados.

- **Cadastro (organizador):**
  - Aba **Cronograma** com:
    1. **Itens estruturados:** UI para adicionar/editar/remover/reordenar itens (horário, título, descrição). Cada linha = um item da timeline.
    2. **Texto livre (opcional):** Editor TipTap para “Observações” ou “Informações adicionais” de cronograma, se necessário.

- **Exibição (página de inscrição):**
  - Se existir **ao menos um item** em `cronograma_items`: exibir seção “Cronograma” em **formato timeline** (horário + título, e descrição se houver), ordenado por `display_order`.
  - Se existir conteúdo no campo **texto livre** (`cronograma`): exibir também (ou em seguida) o bloco de texto formatado com sanitização.
  - Se não houver nem itens nem texto: não exibir seção Cronograma.

- **Regras:**
  - Premiação e cronograma são opcionais; evento pode ser salvo sem nenhum dos dois.
  - Itens de cronograma são opcionais; organizador pode usar só texto livre, só itens, ou ambos.

---

## 5. Implantação por etapas

A implementação está organizada em **6 etapas** em sequência. Cada etapa tem pré-requisitos, tarefas e critérios de conclusão. Recomenda-se implementar na ordem e validar cada etapa antes de avançar.

### Visão geral das etapas

| Etapa | Nome | Depende de | Resumo |
|-------|------|------------|--------|
| **1** | Backend – Migrations | — | Criar colunas e tabela no banco. |
| **2** | Backend – API de evento e cronograma | Etapa 1 | Estender GET/POST/PUT do evento; incluir/aceitar premiação, cronograma e itens. |
| **3** | Frontend – Aba Premiação | Etapa 2 | Editor TipTap na aba Premiação; salvar/carregar. |
| **4** | Frontend – Aba Cronograma | Etapa 2 | Itens (timeline) + texto livre (TipTap) na aba Cronograma; salvar/carregar. |
| **5** | Frontend – Exibição na página de inscrição | Etapa 2 | Mostrar Premiação e Cronograma (timeline + texto) para o corredor. |
| **6** | Validações, testes e documentação | Etapas 1–5 | Regras de validação, testes e documentação da API. |

---

### Etapa 1 – Backend: Migrations

**Objetivo:** Deixar o banco pronto para premiação, cronograma (texto) e itens de cronograma (timeline), sem quebrar eventos existentes.

**Pré-requisitos:** Nenhum.

**Tarefas:**

1. Criar migration que adicione em `events`:
   - `premiacao` (TEXT, nullable)
   - `cronograma` (TEXT, nullable)
2. Criar migration (ou na mesma) para a tabela **`cronograma_items`**:
   - `id` (UUID, PK, default gen_random_uuid())
   - `event_id` (UUID, FK → events.id ON DELETE CASCADE)
   - `time` (VARCHAR(5), formato **HH:mm** – ex.: "06:00", "07:30", "08:10")
   - `title` (VARCHAR(120) NOT NULL) – obrigatório, máx. 120 caracteres para evitar títulos gigantes na timeline
   - `description` (TEXT, nullable)
   - `display_order` (INTEGER NOT NULL)
   - **Constraint UNIQUE (event_id, display_order)** – garantir que não haja duplicidade de `display_order` dentro do mesmo evento (evita timeline fora de ordem)
   - **Índices:** (1) `(event_id, display_order)` para listagem ordenada; (2) `(event_id)` para GET/export por evento
3. Registrar a(s) migration(s) em `run-migrations.ts`.
4. Rodar migrations e conferir que eventos existentes continuam com NULL em `premiacao` e `cronograma` e sem linhas em `cronograma_items`.

**Entregáveis da etapa:**

- Arquivo(s) de migration aplicado(s).
- Colunas `premiacao` e `cronograma` em `events`; tabela `cronograma_items` com UNIQUE (event_id, display_order) e índices.

**Critérios de conclusão:**

- [ ] Migration aplicada sem erro.
- [ ] Eventos existentes inalterados (novas colunas NULL; sem itens).
- [ ] Constraint UNIQUE (event_id, display_order) existe.
- [ ] Índices em `cronograma_items(event_id, display_order)` e `cronograma_items(event_id)` existem.

---

### Etapa 2 – Backend: API de evento e cronograma

**Objetivo:** Expor premiação, cronograma e itens de cronograma na API de evento (GET/POST/PUT) e definir estratégia para itens (embed no PUT ou endpoints separados).

**Pré-requisitos:** Etapa 1 concluída.

**Tarefas:**

1. **Tipos:** Em `Event` (ou tipo de resposta do GET), incluir `premiacao`, `cronograma` e `cronograma_items`; criar tipo `CronogramaItem` se necessário.
2. **eventsService – getEventById (evitar N+1):** Incluir `premiacao` e `cronograma` no SELECT do evento. Buscar itens com **exatamente 2 queries no total:** (a) 1 query para o evento (atual + premiação/cronograma); (b) 1 query para todos os itens: `SELECT ... FROM cronograma_items WHERE event_id = $1 ORDER BY display_order ASC`. Anexar o array ao retorno (`cronograma_items: [...]`). **Não** executar query dentro de loop; usar uma única segunda query por evento.
3. **eventsService – createEvent:** Incluir `premiacao` e `cronograma` em `CreateEventData`, na lista de campos e valores (opcional/nullable).
4. **eventsService – updateEvent:** Incluir `premiacao` e `cronograma` em `UpdateEventData`; atualizar apenas os campos enviados (não zerar se omitidos). Implementar persistência de **cronograma_items** conforme opção escolhida:
   - **Opção A (recomendada):** PUT do evento aceita `cronograma_items: [{ time, title, description, display_order }]`; backend faz replace (apaga itens do evento e insere os enviados). **Normalização automática da ordem:** ao salvar, (1) ordenar os itens recebidos por `display_order`; (2) reatribuir `display_order` sequencialmente (1, 2, 3, …, n). Assim o banco evita lacunas (ex.: 1, 2, 3, 5, 8) e mantém consistência. Se houver constraint UNIQUE (event_id, display_order), a reatribuição evita conflitos.
   - **Opção B:** Endpoints separados (GET/POST/PUT/DELETE `/events/:eventId/cronograma-items`); aplicar a mesma normalização ao persistir.
5. **eventsController:** Estender schemas Zod de create/update para aceitar `premiacao` e `cronograma` (string opcional, limite ex.: 50.000 caracteres) e, se Opção A, `cronograma_items` (array opcional).
6. **Validação e normalização de itens:** `time` em formato **HH:mm** (regex); `title` obrigatório, **máx. 120 caracteres**; **aplicar `title = title.trim()`** no backend antes de persistir (evita " Largada 5km" ou "Largada 5km "); `display_order` ≥ 1; limite de 50 itens por evento. Garantir unicidade de display_order por event_id. **Horários duplicados (opcional):** não bloquear; se existirem dois ou mais itens com o mesmo `time`, o backend pode retornar um aviso (ex.: `warnings: ["Horários duplicados: 07:00"]`) ou o frontend pode validar antes de enviar e exibir **warning** (alerta) ao organizador — não impedir o save.

**Entregáveis da etapa:**

- GET do evento retorna `premiacao`, `cronograma` e `cronograma_items`.
- POST/PUT do evento aceitam e persistem `premiacao`, `cronograma` e (conforme opção) `cronograma_items`.

**Critérios de conclusão:**

- [ ] GET `/api/events/:id` inclui os novos campos e a lista de itens ordenada.
- [ ] **N+1:** Apenas 2 queries no GET (1 evento + 1 para cronograma_items por event_id); nenhuma query dentro de loop.
- [ ] POST e PUT aceitam e gravam premiação e cronograma (texto).
- [ ] Itens de cronograma são criados/atualizados conforme estratégia escolhida.
- [ ] Update parcial: omitir `premiacao`/`cronograma` no PUT não zera o valor atual.

---

### Etapa 3 – Frontend: Aba Premiação

**Objetivo:** Permitir que o organizador preencha e salve a premiação do evento na nova aba, com editor TipTap.

**Pré-requisitos:** Etapa 2 concluída (API retornando e aceitando `premiacao`).

**Tarefas:**

1. Instalar e configurar **TipTap** no projeto (ex.: `@tiptap/react` e extensões básicas: Bold, Italic, Listas, etc.).
2. No fluxo de cadastro/edição do evento (dialog ou tela com abas), adicionar a aba **Premiação**.
3. Na aba Premiação: um único editor **TipTap** vinculado ao campo `premiacao`; placeholder (ex.: “Descreva as premiações do evento…”).
4. Ao carregar o evento para edição, preencher o editor com o valor de `premiacao` (se houver).
5. Ao salvar o evento (botão Salvar do formulário), enviar o HTML do editor no campo `premiacao` na requisição PUT (ou POST na criação).

**Entregáveis da etapa:**

- Nova aba “Premiação” no cadastro/edição do evento.
- Editor TipTap funcional; conteúdo salvo e recarregado corretamente.

**Critérios de conclusão:**

- [ ] Aba Premiação visível e acessível.
- [ ] Conteúdo salvo aparece ao reabrir o evento para edição.
- [ ] Evento pode ser salvo sem preencher premiação (campo opcional).

---

### Etapa 4 – Frontend: Aba Cronograma

**Objetivo:** Permitir que o organizador cadastre itens de cronograma (timeline) e opcionalmente texto livre, e salve na API.

**Pré-requisitos:** Etapa 2 concluída; Etapa 3 desejável (TipTap já configurado para texto livre do cronograma).

**Tarefas:**

1. No fluxo de cadastro/edição do evento, adicionar a aba **Cronograma**.
2. **Itens estruturados (timeline):**
   - UI para listar itens existentes (horário, título, descrição), com opção de editar, remover e reordenar (arrastar-e-soltar ou campo `display_order`).
   - Campos por item: **horário** no formato HH:mm (ex.: input "07:00" ou time picker), **título** (obrigatório, máx. 120 caracteres), **descrição** (opcional).
   - **Placeholder de exemplo** na área de itens (ou no primeiro item vazio) para orientar o organizador, ex.: “Ex.: 07:00 – Aquecimento | 08:00 – Largada 5km | 08:10 – Largada 10km | 09:30 – Premiação”. Isso melhora a qualidade dos dados.
   - **Horários duplicados (opcional):** antes ou ao salvar, verificar se existem dois ou mais itens com o mesmo horário (ex.: 07:00 Aquecimento e 07:00 Largada). Se houver, exibir **alerta (warning)** no frontend (ex.: “Existem horários duplicados. Verifique se está correto.”). **Não bloquear** o envio — pode ser intencional; apenas alertar.
   - Botão “Adicionar horário” (ou similar) para incluir novo item.
   - Ao salvar o evento: enviar a lista de itens conforme API (ex.: `cronograma_items` no payload do PUT com replace).
3. **Texto livre (opcional):** Editor TipTap para “Observações / informações adicionais” de cronograma, vinculado ao campo `cronograma`; enviar no PUT ao salvar.
4. Ao carregar o evento, preencher lista de itens e editor de texto livre a partir dos dados retornados pelo GET.

**Entregáveis da etapa:**

- Aba Cronograma com lista de itens (timeline) e texto livre (TipTap).
- Persistência dos itens e do texto via API do evento.

**Critérios de conclusão:**

- [ ] Itens podem ser adicionados, editados, removidos e reordenados.
- [ ] Texto livre do cronograma é salvo e recarregado.
- [ ] Ordem dos itens é mantida (`display_order`).
- [ ] Se houver horários duplicados na lista, é exibido alerta (warning) sem bloquear o save.

---

### Etapa 5 – Frontend: Exibição na página de inscrição

**Objetivo:** Exibir Premiação e Cronograma (timeline + texto livre) na página de inscrição do evento para o corredor.

**Pré-requisitos:** Etapa 2 concluída (dados disponíveis na API). Etapas 3 e 4 garantem que há conteúdo para testar.

**Tarefas:**

1. Na página de inscrição do evento, garantir que a chamada ao GET do evento já traga `premiacao`, `cronograma` e `cronograma_items` (a API já retorna; conferir se o front consome).
2. **Seção Premiação (segurança):** Se `premiacao` tiver conteúdo, exibir bloco “Premiação” e renderizar o HTML **após sanitização** (ex.: DOMPurify): sem `<script>`, sem JS inline (onclick, onerror, href="javascript:", etc.). Nunca usar o HTML bruto em `dangerouslySetInnerHTML` sem sanitizar. Se vazio/null, não exibir a seção.
3. **Seção Cronograma:**
   - Se existir ao menos um item em `cronograma_items`: exibir seção “Cronograma” em **formato timeline**. Exibir **title** e **description** dos itens como **texto escapado** (não innerHTML): usar conteúdo em JSX (ex.: `{item.title}`) ou função de escape; não permitir HTML em title/description.
   - Se existir conteúdo em `cronograma` (texto livre): exibir o bloco **após sanitização** (mesmas regras: sem script, sem inline JS). Abaixo da timeline ou em subseção.
   - Se não houver itens nem texto: não exibir seção Cronograma.
4. Posicionar as seções após a descrição do evento (ou em abas “Sobre” / “Premiação” / “Cronograma”, conforme layout definido).

**Entregáveis da etapa:**

- Premiação visível na página de inscrição quando preenchida.
- Cronograma em formato timeline quando houver itens; texto livre quando preenchido; nenhuma quebra quando vazio.

**Critérios de conclusão:**

- [ ] Premiação exibida com HTML **sanitizado** (DOMPurify ou equivalente: sem `<script>`, sem JS inline).
- [ ] Cronograma (texto livre) exibido com HTML **sanitizado** (mesmas regras).
- [ ] Title e description dos itens de cronograma exibidos como **texto escapado** (sem innerHTML bruto).
- [ ] Timeline de cronograma exibida quando houver itens; ordem correta.
- [ ] Eventos sem premiação/cronograma não quebram a página.

---

### Etapa 6 – Validações, testes e documentação

**Objetivo:** Reforçar validações, testar cenários principais e documentar a API.

**Pré-requisitos:** Etapas 1 a 5 concluídas.

**Tarefas:**

1. **Validações:** Garantir limite de tamanho para `premiacao` e `cronograma`; validação de itens: `time` HH:mm, **title** obrigatório, **máx. 120 caracteres**, **trim de title no backend** antes de persistir, display_order ≥ 1 e único por evento, limite de 50 itens. **Horários duplicados:** alerta (warning) no front ao detectar mesmo `time` em mais de um item; não bloquear. **Segurança:** sanitização e escape conforme plano.
2. **Testes:** Testar criação/edição de evento com premiação; com itens de cronograma; com texto livre de cronograma; com ambos. Verificar exibição na página de inscrição. Confirmar que eventos antigos (sem premiação/cronograma/itens) continuam funcionando. **Cenários de timeline:** validar layout e comportamento com **0 itens** (não exibir seção), **1 item**, **10 itens** e **50 itens** (limite) para garantir que a timeline renderiza corretamente em todos os casos.
3. **Documentação:** Atualizar documentação da API (campos `premiacao`, `cronograma`, recurso ou payload `cronograma_items`; formato HH:mm; title máx. 120 caracteres). Se necessário, guia de uso para o organizador.

**Entregáveis da etapa:**

- Regras de validação aplicadas.
- Cenários principais testados.
- Documentação da API (e eventual guia) atualizada.

**Critérios de conclusão:**

- [ ] Validações aplicadas (time HH:mm, title máx. 120, trim de title no backend, display_order único, normalização 1..n); warning de horários duplicados no front (sem bloquear).
- [ ] Testes cobrindo premiação, cronograma (itens + texto) e exibição; **timeline testada com 0, 1, 10 e 50 itens**.
- [ ] Documentação atualizada.

---

## 6. Regras de implementação

- **Compatibilidade:** Eventos existentes devem ter `premiacao` e `cronograma` como NULL ou string vazia; eventos sem itens em `cronograma_items` não exibem timeline; a página de inscrição não deve quebrar.
- **Fonte da verdade:** Premiação e texto livre de cronograma ficam na tabela `events`; itens de cronograma na tabela `cronograma_items`; a página de inscrição consome via API de evento (incluindo lista de itens).
- **display_order:** Deve ser **único por event_id** (constraint UNIQUE (event_id, display_order) ou garantia no backend) para evitar timeline fora de ordem. Ao salvar itens, **normalizar a ordem:** ordenar por display_order e reatribuir sequencialmente 1..n, evitando lacunas (1, 2, 3, 5, 8).
- **title:** Obrigatório, **máximo 120 caracteres** (validar no backend). **Aplicar trim no backend:** `title = title.trim()` antes de persistir, para evitar espaços no início/fim (ex.: " Largada 5km", "Largada 5km ").
- **time:** Formato **HH:mm** (ex.: 06:00, 07:30); validar com regex no backend.
- **Horários duplicados:** Validar se existem itens com o mesmo `time` na lista; **alertar no frontend (warning)**, sem bloquear o save. Opcionalmente o backend pode retornar aviso.
- **Queries (evitar N+1):** No GET do evento, usar no máximo **2 queries:** 1 para o evento (com premiação/cronograma) e 1 para todos os `cronograma_items` desse evento (`WHERE event_id = $1 ORDER BY display_order`). Nenhuma query dentro de loop.
- **Segurança – HTML (premiacao, cronograma):** (1) **Sempre** sanitizar na renderização (ex.: DOMPurify) antes de injetar no DOM. (2) Não permitir `<script>` nem JS inline (onclick, onerror, href="javascript:", etc.). (3) Preferir whitelist de tags/atributos. (4) Opcional: sanitizar também no backend ao persistir.
- **Segurança – cronograma_items (title, description):** Tratar como texto plano; **escapar** na exibição (usar em JSX como texto ou função de escape); não usar innerHTML/dangerouslySetInnerHTML para esses campos.
- **Cronograma visual:** A versão estruturada (itens) é a forma recomendada para exibir cronograma de forma consistente (timeline); o texto livre permanece opcional para complementar.

---

## 7. Entregáveis (por etapa)

| Etapa | Entregável |
|-------|------------|
| **1** | Migrations aplicadas: colunas `premiacao` e `cronograma` em `events`; tabela `cronograma_items` com UNIQUE (event_id, display_order) e índices (event_id, display_order) e (event_id). |
| **2** | API estendida: GET retorna premiação, cronograma e itens; POST/PUT aceitam e persistem; update parcial garantido. |
| **3** | Aba **Premiação** com editor TipTap; salvar e recarregar. |
| **4** | Aba **Cronograma** com itens (timeline) e texto livre (TipTap); salvar e recarregar. |
| **5** | Página de inscrição exibindo Premiação (HTML sanitizado) e Cronograma (timeline + texto livre). |
| **6** | Validações aplicadas; testes realizados; documentação da API atualizada. |

---

## 8. Checklist final (pós-implementação)

- [ ] **Etapa 1:** Migrations aplicadas (UNIQUE + índices em cronograma_items); eventos existentes intactos.
- [ ] **Etapa 2:** GET/POST/PUT do evento incluem premiação, cronograma e itens; update parcial ok.
- [ ] **Etapa 3:** Aba Premiação com TipTap; conteúdo salvo e recarregado.
- [ ] **Etapa 4:** Aba Cronograma com itens e texto livre; persistência correta.
- [ ] **Etapa 5:** Premiação e Cronograma exibidos na página de inscrição (sanitização; timeline; sem quebra quando vazio).
- [ ] **Etapa 6:** Validações, testes e documentação concluídos.
- [ ] Eventos antigos continuam funcionando em todo o fluxo.

**Documentação da Etapa 6:**
- [API_EVENTOS_PREMIACAO_CRONOGRAMA.md](./API_EVENTOS_PREMIACAO_CRONOGRAMA.md) – Campos `premiacao`, `cronograma` e `cronograma_items`; validações; segurança.
- [TESTES_PREMIACAO_CRONOGRAMA.md](./TESTES_PREMIACAO_CRONOGRAMA.md) – Cenários de teste manuais (premiação, cronograma, timeline 0/1/10/50 itens, eventos antigos).

---

## 9. Análise técnica pré-implementação

Validação feita sobre o código atual (events, migrations, API) antes da implementação.

### 9.1 Modelagem das tabelas

- **`events`: novos campos `premiacao` e `cronograma`**
  - **Correto.** Ambos TEXT nullable; eventos existentes ficam com NULL. Padrão do projeto: `ADD COLUMN IF NOT EXISTS` (ex.: migration 063).
  - **Ajuste:** Nenhum.

- **`cronograma_items`**
  - **Ajuste recomendado:** Trocar o nome da coluna **`order`** por **`display_order`**.
  - **Motivo:** No projeto, ordenação é sempre `display_order` (modalities, categories, event_kits, document_types). Além disso, `order` é palavra reservada em SQL e exige aspas (`"order"`) em PostgreSQL, o que pode gerar erros em queries e em alguns drivers.
  - **Estrutura sugerida:**  
    `id` (UUID, PK), `event_id` (UUID, FK → events ON DELETE CASCADE), `time` (VARCHAR(5), formato **HH:mm**), `title` (VARCHAR(120) NOT NULL), `description` (TEXT NULL), **`display_order`** (INTEGER NOT NULL), **UNIQUE (event_id, display_order)**.  
  - **Índices:** (1) `(event_id, display_order)` para listagem ordenada; (2) `(event_id)` para GET/export por evento.
  - **Tipo de `time`:** **VARCHAR(5)** formato **HH:mm** (ex.: "06:00", "07:30", "08:10"); validar com regex no backend.
  - **title:** Máx. **120 caracteres** para evitar títulos gigantes na timeline.

### 9.2 Impactos no sistema atual de eventos

- **`eventsService.ts`:**
  - `getEventById`: o SELECT lista as colunas explicitamente (não usa `*`). É **obrigatório** incluir `premiacao` e `cronograma` no SELECT e, no retorno, incluir a lista de itens de cronograma (nova query ou subconsulta/join).
  - `createEvent`: a lista de campos e valores é fixa. Incluir `premiacao` e `cronograma` em `CreateEventData`, em `fields` e em `values` (opcional/nullable).
  - `updateEvent`: usa `Object.entries(data)`; qualquer campo enviado em `data` é atualizado. Incluir `premiacao` e `cronograma` em `UpdateEventData` e no schema Zod do controller; **não** passar campos não permitidos (whitelist implícita pelo tipo).
- **Tipos:** Em `backend/src/types/index.ts`, a interface `Event` deve ganhar `premiacao?: string | null`, `cronograma?: string | null` e `cronograma_items?: CronogramaItem[]` (ou só no tipo de resposta do GET, se preferir).
- **Views e outros:** Nenhuma view encontrada que faça `SELECT * FROM events`; views usam apenas contagens ou JOIN em `events`. Adicionar colunas em `events` **não** quebra views. Nenhum impacto em `organizer_dashboard_stats`, `admin_dashboard_stats` ou reports.

### 9.3 Migrations e eventos existentes

- **Premiação e cronograma em `events`:**
  - Usar `ADD COLUMN IF NOT EXISTS ... TEXT` (sem DEFAULT ou com DEFAULT NULL). Eventos já existentes recebem NULL; nenhuma linha precisa ser alterada.
- **Tabela `cronograma_items`:**
  - `CREATE TABLE IF NOT EXISTS` com FK `ON DELETE CASCADE` para `event_id`. Eventos antigos simplesmente não terão linhas; SELECT de itens retorna array vazio.
- **Ordem de execução:** Uma única migration pode: (1) adicionar `premiacao` e `cronograma` em `events`; (2) criar `cronograma_items`. Ou duas migrations separadas; em ambos os casos, aplicação é segura e **não quebra** eventos existentes.

### 9.4 Endpoints da API

- **Extensão, não quebra:**
  - **GET `/api/events/:id`** (ou `:eventId`): estender resposta com `premiacao`, `cronograma` e `cronograma_items` (array ordenado por `display_order`). Clientes antigos que ignoram esses campos continuam funcionando.
  - **POST `/api/events`** e **PUT `/api/events/:id`**: aceitar opcionalmente `premiacao` e `cronograma` (string). Não é necessário enviar; se não enviados, manter valor atual no PUT ou NULL no POST.
- **Itens de cronograma – duas opções (escolher uma):**
  1. **Incluir no payload do evento:** PUT aceita `cronograma_items: [{ time, title, description, display_order }]` e o backend faz replace (delete todos do evento + insert dos enviados). GET já retorna `cronograma_items` dentro do evento. Sem novos endpoints.
  2. **Recursos separados:** GET/POST/PUT/DELETE `/api/events/:eventId/cronograma-items` (e talvez GET por item). Mais REST, mais chamadas no front (lista de itens + CRUD). O plano já menciona as duas opções; a opção 1 reduz round-trips e mantém consistência com o padrão de “sync” usado em categorias/kits.
- **Conclusão:** Nenhum endpoint precisa ser removido ou alterado de forma incompatível; apenas **estender** GET e POST/PUT (e, se for o caso, criar rotas específicas para itens).

### 9.5 Estrutura de `cronograma_items` para timeline

- **Campos (com `display_order`, UNIQUE por evento):** suficientes para a timeline (horário + título + descrição opcional, ordenado). Não é necessário, para a primeira versão: data do item (o dia é o do evento), timezone, ou “end time”. Se no futuro houver necessidade de intervalo (início/fim), pode-se adicionar `end_time` ou outro campo em nova migration.
- **Integridade de display_order:** **UNIQUE (event_id, display_order)** na tabela (ou garantia no backend) para evitar dois itens com o mesmo display_order no mesmo evento e timeline fora de ordem.
- **Normalização automática:** Ao salvar itens, ordenar por display_order e reatribuir 1..n sequencialmente; evita lacunas (1, 2, 3, 5, 8) após deleções.
- **Validação no backend:** `time` em formato **HH:mm** (regex); `title` obrigatório, **máx. 120 caracteres**; **`title = title.trim()`** antes de persistir; `display_order` ≥ 1; limite de 50 itens por evento. **Horários duplicados:** opcional validar e retornar aviso; não bloquear.

### 9.6 Duplicidade e inconsistência

- **Texto livre vs itens:** Não há duplicidade: `cronograma` (texto) e `cronograma_items` (timeline) são fontes distintas; um é complementar ao outro. Regra de exibição: mostrar itens (timeline) e, se houver, o texto livre em seguida — evita conflito.
- **Ordem dos itens:** A única fonte de ordem é `display_order`. **Unicidade:** constraint **UNIQUE (event_id, display_order)** (ou garantia no backend) para que não existam dois itens com o mesmo display_order no mesmo evento. **Normalização:** ao salvar (replace), o backend deve ordenar os itens por display_order e reatribuir 1, 2, 3, …, n sequencialmente, evitando lacunas e duplicidades.
- **Risco:** Se a API aceitar itens por um endpoint e texto por outro, garantir que o PUT do evento não apague `cronograma` quando só `cronograma_items` for enviado (e vice-versa). Ou seja: no update, tratar cada campo como opcional e atualizar apenas o que vier no body.
- **Evento excluído:** `ON DELETE CASCADE` em `cronograma_items.event_id` evita itens órfãos; não há risco de inconsistência por evento removido.

### 9.7 Resumo dos ajustes recomendados no plano

| Item | Ajuste |
|------|--------|
| Coluna de ordem em `cronograma_items` | Usar **`display_order`** em vez de `order`. |
| Unicidade de ordem | **UNIQUE (event_id, display_order)** ou garantia no backend; evita timeline fora de ordem. |
| Normalização da ordem | Ao salvar itens: ordenar por display_order e reatribuir 1..n sequencialmente. |
| Tipo de `time` | **VARCHAR(5)**, formato **HH:mm** (ex.: 06:00, 07:30); validar com regex no backend. |
| title | Obrigatório, **máx. 120 caracteres**; **trim no backend** (`title.trim()`) antes de persistir. |
| Horários duplicados | Validar e **alertar no front (warning)**; não bloquear. Backend pode retornar aviso. |
| Índices | **(event_id, display_order)** e **(event_id)** em `cronograma_items`. |
| API de itens | Definir se será **embed no PUT do evento** (replace) ou **endpoints separados**; o plano já contempla os dois. |
| Update parcial | No PUT do evento, atualizar apenas os campos enviados; não zerar `premiacao`/`cronograma` quando não vierem no body. |
| Testes de timeline | Validar layout com **0, 1, 10 e 50 itens**. |
| UX aba Cronograma | Placeholder de exemplo (ex.: 07:00 – Aquecimento \| 08:00 – Largada 5km …). |

### 9.8 GET /events/:id – evitar N+1 ao carregar cronograma_items

**Requisito:** O endpoint deve usar no máximo **2 queries** para evento + itens: **1 query para o evento** e **1 query para todos os cronograma_items daquele evento**. Nenhuma query dentro de loop.

**Padrão correto (recomendado):**

1. **Query 1 – evento:** Manter a query atual de `getEventById` (SELECT em `events` + LEFT JOIN em `profiles`), acrescentando as colunas `premiacao` e `cronograma`. Uma única linha retornada.
2. **Query 2 – itens:** Após obter o `id` do evento (ou em paralelo usando o mesmo `eventIdOrSlug` resolvido para `id`), executar uma única query:
   - `SELECT id, event_id, time, title, description, display_order FROM cronograma_items WHERE event_id = $1 ORDER BY display_order ASC`
   - Parâmetro: o `id` (UUID) do evento já obtido na query 1. Uma única chamada ao banco; nenhum loop sobre eventos ou sobre itens.

**O que NÃO fazer:**

- Não fazer um loop “para cada evento” (no GET por :id há só um evento) nem “para cada item” com query adicional.
- Evitar padrão similar ao de `getEventKits` em que, após buscar os kits, há um `for (const kit of kits)` com queries internas (getKitCategories, kit_products). Para `cronograma_items` não há relação one-to-many aninhada; basta uma segunda query por evento.

**Alternativa em uma única query (opcional):** Usar agregação no PostgreSQL (ex.: `JSON_AGG` / `json_agg` dos itens na query do evento com LEFT JOIN em `cronograma_items` e GROUP BY nos campos do evento). Isso resulta em 1 query só. Se preferir clareza e manutenção simples, o padrão **2 queries** (evento + itens) é suficiente e evita N+1.

### 9.9 Segurança: HTML (premiacao, cronograma) e escape (cronograma_items)

**Campos que armazenam HTML (TipTap):** `premiacao`, `cronograma`.

**Requisitos obrigatórios:**

1. **Sanitização na renderização (frontend):** Sempre que o HTML de `premiacao` ou `cronograma` for exibido (ex.: página de inscrição), deve ser passado por uma biblioteca de sanitização (ex.: **DOMPurify**) **antes** de ser injetado no DOM (ex.: `dangerouslySetInnerHTML` ou equivalente). Nunca renderizar o valor bruto.
2. **Não permitir tags de script:** A configuração do sanitizador deve remover ou desabilitar `<script>`, `</script>` e quaisquer tags que executem código (ex.: `<iframe>`, `<object>` com dados executáveis). DOMPurify, por padrão, remove scripts; manter esse comportamento.
3. **Não permitir JavaScript inline:** Remover ou desabilitar atributos que executam JS: `onclick`, `onerror`, `onload`, `href="javascript:..."`, etc. Em DOMPurify, usar opções que proíbam event handlers e `javascript:` em URLs (ex.: `ALLOWED_ATTR`, sem handlers; ou `ADD_ATTR` restrito; `FORBID_TAGS`/`FORBID_ATTR` conforme documentação).
4. **Política restritiva:** Preferir whitelist de tags e atributos permitidos (ex.: `<p>`, `<strong>`, `<em>`, `<ul>`, `<li>`, `<br>`, `<a>` com `href` seguro) em vez de blacklist. Documentar no código ou no plano quais tags/atributos são permitidos.

**Backend (opcional mas recomendado):** Ao persistir `premiacao` e `cronograma` (POST/PUT), aplicar sanitização no servidor (ex.: `sanitize-html` em Node) com as mesmas regras (sem script, sem inline JS), para que o banco não armazene HTML malicioso. Isso é uma camada extra; a sanitização na renderização continua obrigatória.

**Campos de texto simples (não HTML):** `title` e `description` de **cronograma_items**.

**Requisitos:**

1. **Escape na renderização:** Como são texto plano (não HTML intencional), devem ser tratados como conteúdo textual e **escapados** ao exibir em HTML (ex.: substituir `<` por `&lt;`, `>` por `&gt;`, `"` por `&quot;`, `&` por `&amp;`). No React, não usar `dangerouslySetInnerHTML` para título ou descrição dos itens; usar conteúdo de texto no JSX (ex.: `{item.title}`, `{item.description}`), que escapa por padrão. Se forem renderizados em string HTML manualmente, usar função de escape (ex.: `escapeHtml` ou equivalente da lib de sanitização).
2. **Persistência:** No backend, validar que são strings; opcionalmente limitar tamanho. Não interpretar como HTML no servidor ao enviar para o cliente; o cliente exibe como texto escapado.

**Resumo:**

| Campo | Armazena | Na renderização |
|-------|----------|------------------|
| `premiacao` | HTML (TipTap) | Sanitizar com DOMPurify (sem `<script>`, sem JS inline); depois injetar. |
| `cronograma` | HTML (TipTap) | Idem. |
| `cronograma_items.title` | Texto plano | Escape (ou usar texto no JSX); não usar innerHTML. |
| `cronograma_items.description` | Texto plano | Idem. |

---

## 10. Análise pré-implementação: inconsistências, performance, conflitos e segurança

Lista de pontos a resolver ou validar **antes** de começar a implementação.

### 10.1 Inconsistências no plano

| # | Inconsistência | Onde | Ajuste |
|---|----------------|------|--------|
| 1 | No plano estava escrito "ordenado por `order`" em vez de `display_order`. | Seção 4.2 (Exibição) | **Corrigido** no plano: usar `display_order`. |
| 2 | Duas opções de API para itens (embed no PUT vs endpoints separados) sem decisão explícita. | Etapa 2, 9.4 | Definir **uma** opção antes de codar (recomendado: Opção A – embed no PUT). |
| 3 | `updateEvent` trata qualquer chave em `data` como coluna de `events`; `cronograma_items` não é coluna. | Ver conflitos abaixo | Backend deve **extrair** `cronograma_items` do body, **não** passá-lo ao `UPDATE events`. |

### 10.2 Possíveis problemas de performance

| # | Problema | Onde | Mitigação |
|---|----------|------|-----------|
| 1 | **GET /events/:id:** hoje `getEventById` chama `checkSlugColumnExists()` no início (1 query extra). Com a 2ª query de itens, seriam **3 queries** por chamada, não 2. | `eventsService.getEventById` | Considerar cache da existência da coluna slug (ex.: em memória por processo) ou aceitar 3 queries; documentar. |
| 2 | **TipTap no front:** carregar editor em todas as abas pode aumentar bundle e tempo inicial. | EventFormDialog, EventViewEditDialog | Considerar **lazy load** das abas Premiação e Cronograma (carregar TipTap só ao abrir a aba). |
| 3 | **Payload grande:** evento com 50 itens + premiação/cronograma em HTML pode gerar resposta GET pesada. | GET evento | Limites já previstos (50 itens, 50k caracteres); monitorar em produção. |
| 4 | **Replace de itens:** DELETE + vários INSERTs sem transação pode deixar dados inconsistentes em falha. | Etapa 2 (persistência de cronograma_items) | Usar **transação** (BEGIN; DELETE cronograma_items WHERE event_id; INSERTs; COMMIT). |

### 10.3 Possíveis conflitos com o código atual

| # | Conflito | Código atual | Ação necessária |
|---|----------|--------------|------------------|
| 1 | **updateEvent** monta o `SET` com `Object.entries(data)`. Se `data` tiver `cronograma_items`, será gerado `cronograma_items = $n`, e a tabela `events` **não tem** essa coluna → erro SQL. | `eventsService.updateEvent` (linhas ~576–586) | **Extrair** `cronograma_items` de `data` antes do loop; **não** incluir no UPDATE de `events`. Tratar itens em bloco separado (replace em transação). |
| 2 | **"No fields to update":** se o cliente enviar **apenas** `cronograma_items` no PUT (sem outros campos), após extrair itens o `data` fica vazio e `fields.length === 0` → `throw new Error('No fields to update')`. | `eventsService.updateEvent` (linha ~587) | Permitir atualização **só de itens**: se após extrair itens não restar nenhum campo de evento, não executar UPDATE em `events` (ou executar um no-op), mas **executar** o replace de cronograma_items se ele foi enviado. |
| 3 | **Abas:** `EventFormDialog` usa array `["info", "modalities", "categories", "kits", "pickup", "payment", "publish"]`; `EventViewEditDialog` usa valores "details", "modalities", etc. Inserir Premiação e Cronograma exige alterar **os dois** e a lógica de próximo/anterior (índices). | EventFormDialog.tsx (linhas ~640, 4173, 4200); EventViewEditDialog.tsx (TabsTrigger) | Incluir novas abas nos dois componentes e **atualizar** todos os arrays/índices usados para navegação (próximo/voltar). |
| 4 | **Tipos:** `CreateEventData` e `UpdateEventData` não têm `premiacao` nem `cronograma`; a interface `Event` em `types/index.ts` também não. Qualquer código que use esses tipos pode não refletir a API após a mudança. | eventsService.ts; backend/src/types/index.ts | Incluir `premiacao?`, `cronograma?` e, na resposta do GET, `cronograma_items?` nos tipos. **Não** colocar `cronograma_items` como campo do UPDATE de `events` no tipo (ou documentar que o controller extrai antes de chamar updateEvent). |
| 5 | **Número da migration:** a próxima migration deve ser **095** (ou 097 se houver convenção com zeros). | run-migrations.ts (última é 094) | Registrar a nova migration (ex.: `095_add_premiacao_cronograma_and_cronograma_items.sql`) em `run-migrations.ts`. |

### 10.4 Possíveis falhas de segurança

| # | Risco | Onde | Mitigação |
|---|--------|------|-----------|
| 1 | **XSS em `event.description` (já existente):** em `EventDetails.tsx` a descrição é renderizada com `dangerouslySetInnerHTML={{ __html: event.description.replace(/\n/g, '<br />') }}` **sem** sanitização. Se `description` tiver HTML/script, há XSS. | src/pages/EventDetails.tsx (linha ~524) | O plano não altera isso; **recomendado** corrigir na mesma frente: sanitizar (ou escapar) `event.description` antes de injetar, ou aplicar DOMPurify. |
| 2 | **Premiação e cronograma:** se forem exibidos sem sanitização, HTML malicioso (script, onclick, etc.) causa XSS. | Etapa 5 (página de inscrição) | Plano já exige DOMPurify antes de `dangerouslySetInnerHTML`; **garantir** na implementação que **nunca** se injeta HTML bruto de `premiacao`/`cronograma`. |
| 3 | **title/description dos itens:** se forem exibidos com `dangerouslySetInnerHTML` ou concatenação em HTML, podem virar vetor de XSS. | Etapa 5 (timeline) | Plano já exige exibir como texto (JSX ou escape); **não** usar innerHTML para title/description. |
| 4 | **HTML no backend:** se a API aceitar HTML em `premiacao`/`cronograma` e gravar sem sanitizar, o banco pode armazenar conteúdo malicioso; qualquer cliente que renderize sem sanitizar fica vulnerável. | Etapa 2 (POST/PUT) | Plano recomenda sanitização no backend (ex.: `sanitize-html`) ao persistir; **implementar** para reduzir risco mesmo que o front falhe. |
| 5 | **cronograma_items.description** é TEXT sem limite no plano; descrições enormes podem causar DoS (payload, memória, layout). | Migration / validação | Definir **limite máximo** (ex.: 2.000 ou 5.000 caracteres) e validar no backend e, se desejado, no front. |
| 6 | **Limite de 50.000 caracteres** para premiação/cronograma: um único request com 50k de HTML pode sobrecarregar parser/sanitizador. | Etapa 2 (validação) | Manter limite; considerar timeout ou tamanho máximo de body no Express. |

### 10.5 Resumo de ações antes de implementar

- **Obrigatório:** Extrair e tratar `cronograma_items` fora do UPDATE de `events`; permitir PUT só com itens; usar transação no replace de itens; registrar nova migration; sanitizar premiação/cronograma no front; exibir title/description como texto; **aplicar `title.trim()` no backend** antes de persistir itens; **validar horários duplicados e alertar no front (warning**, sem bloquear).
- **Recomendado:** Sanitizar `event.description` em EventDetails; sanitizar HTML no backend ao persistir; limite de tamanho para `cronograma_items.description`; lazy load do TipTap nas abas; cache de `checkSlugColumnExists` (ou aceitar 3 queries).
- **Definir:** Opção A (embed) vs B (endpoints separados) para itens; posição exata das abas Premiação e Cronograma na ordem das tabs.
