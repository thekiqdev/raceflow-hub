# API de Eventos: Premiação e Cronograma

Documentação dos campos **premiação**, **cronograma** (texto livre) e **cronograma_items** (timeline) na API de eventos.

---

## 1. Visão geral

| Campo | Tipo | Onde | Descrição |
|-------|------|------|-----------|
| `premiacao` | string (HTML) ou null | Tabela `events` | Conteúdo HTML (TipTap) com informações de premiação. Opcional. |
| `cronograma` | string (HTML) ou null | Tabela `events` | Conteúdo HTML (TipTap) com texto livre de cronograma. Opcional. Complementar aos itens. |
| `cronograma_items` | array de objetos | Tabela `cronograma_items` | Itens da timeline (horário, título, descrição). Ordenados por `display_order`. Máx. 50 itens por evento. |

---

## 2. Endpoints

### GET `/api/events/:id`

Retorna o evento com os campos:

- **`premiacao`** (string | null): HTML da premiação.
- **`cronograma`** (string | null): HTML do texto livre de cronograma.
- **`cronograma_items`** (array): itens do cronograma, **ordenados por `display_order` ascendente**.

Formato de cada item em `cronograma_items`:

```json
{
  "id": "uuid",
  "event_id": "uuid",
  "time": "07:00",
  "title": "Largada 5km",
  "description": "Descrição opcional ou null",
  "display_order": 1
}
```

### POST `/api/events` (criar evento)

Corpo pode incluir:

- **`premiacao`** (opcional): string ou null. Máx. **50.000 caracteres**.
- **`cronograma`** (opcional): string ou null. Máx. **50.000 caracteres**.
- **`cronograma_items`**: **não** é aceito no POST. Para cadastrar itens após criar o evento, use PUT.

### PUT `/api/events/:id` (atualizar evento)

Corpo pode incluir (update parcial; omitir mantém o valor atual):

- **`premiacao`** (opcional): string ou null. Máx. **50.000 caracteres**.
- **`cronograma`** (opcional): string ou null. Máx. **50.000 caracteres**.
- **`cronograma_items`** (opcional): array de itens. Se enviado, o backend faz **replace**: remove todos os itens atuais do evento e insere os enviados. Ordem é **normalizada** para 1, 2, 3, …, n.

Formato de cada item no payload do PUT:

```json
{
  "time": "07:00",
  "title": "Largada 5km",
  "description": "Opcional ou null",
  "display_order": 1
}
```

- **`time`**: obrigatório, formato **HH:mm** (ex.: 06:00, 07:30, 23:59). Regex: `^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$`.
- **`title`**: obrigatório, **máx. 120 caracteres**. No backend é aplicado **trim** antes de persistir.
- **`description`**: opcional, string ou null. Máx. 5.000 caracteres.
- **`display_order`**: inteiro **≥ 1**. Na persistência, a ordem é reordenada e reatribuída sequencialmente (1..n), então lacunas ou duplicidades são normalizadas.

**Máximo de 50 itens** por evento. Acima disso a API retorna erro.

---

## 3. Validações aplicadas

| Regra | Onde |
|-------|------|
| `premiacao` e `cronograma`: máx. 50.000 caracteres | Zod (controller) |
| `cronograma_items`: máx. 50 itens | Zod + eventsService |
| `time`: formato HH:mm | Zod (regex) + eventsService |
| `title`: obrigatório, máx. 120 caracteres, trim no backend | Zod + eventsService (trim antes do INSERT) |
| `description`: opcional, máx. 5.000 caracteres | Zod (cronogramaItemSchema) |
| `display_order`: inteiro ≥ 1 | Zod + eventsService |
| Ordem única por evento | Constraint UNIQUE (event_id, display_order) + normalização 1..n no replace |

**Horários duplicados:** a API **não bloqueia** vários itens com o mesmo `time`. O frontend pode exibir um **alerta (warning)** quando detectar duplicidade; o envio continua permitido.

---

## 4. Segurança na exibição

- **`premiacao`** e **`cronograma`** (HTML): devem ser **sanitizados** antes de injetar no DOM (ex.: DOMPurify). Não usar `dangerouslySetInnerHTML` com o valor bruto.
- **`title`** e **`description`** dos itens: tratar como **texto plano** na exibição (ex.: JSX `{item.title}`, `{item.description}`); não usar HTML bruto.

---

## 5. Compatibilidade

- Eventos antigos têm `premiacao` e `cronograma` como **NULL** e nenhum registro em `cronograma_items`.
- GET retorna `premiacao: null`, `cronograma: null` e `cronograma_items: []` nesses casos.
- A página de inscrição não deve quebrar quando esses campos estiverem vazios.
