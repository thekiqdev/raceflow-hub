# Plano: Campos personalizados por categoria

## Objetivo

Permitir que, ao cadastrar/editar um evento, o organizador possa definir **campos personalizados** por categoria (ex.: “Número da camisa”, “Tamanho do peito”). Esses campos:

- São configurados na tela de cadastro do evento, por categoria.
- Aparecem no fluxo de inscrição quando o corredor escolhe uma categoria que os possui.
- Têm valores gravados na inscrição (fluxo PIX e cartão).
- Passam a ser colunas na exportação da planilha de inscritos.

---

## Escopo funcional

| Item | Descrição |
|------|-----------|
| **Onde configurar** | Cadastro/edição de evento → aba **Categorias** → em cada categoria, seção “Campos personalizados”. |
| **Ação** | Botão **“Adicionar campo personalizado”**: ao clicar, permitir informar **nome do campo** e **tipo** (texto ou número). |
| **Onde preencher** | No fluxo de inscrição (site público e, se aplicável, inscrição pelo organizador/líder), após o corredor selecionar a categoria. Exibir apenas os campos da categoria escolhida. |
| **Onde gravar** | Valores salvos na inscrição (criação e edição), para pagamento via PIX e cartão. |
| **Exportação** | Planilha de inscritos: novas colunas, uma por campo personalizado (nome do campo = cabeçalho da coluna), preenchidas com o valor informado na inscrição. |

---

## Modelagem de dados

### 1. Definição dos campos (por categoria)

**Tabela: `category_custom_fields`**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | Identificador do campo. |
| `category_id` | UUID FK → categories(id) ON DELETE CASCADE | Categoria a que o campo pertence. |
| `label` | VARCHAR(255) NOT NULL | Nome do campo exibido ao usuário (ex.: “Número da camisa”). |
| `field_type` | VARCHAR(20) NOT NULL | `'text'` ou `'number'`. |
| `display_order` | INTEGER NOT NULL DEFAULT 0 | Ordem de exibição na tela. |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

- Índice em `category_id` para listar campos da categoria.
- Constraint: `field_type IN ('text', 'number')`.

### 2. Valores na inscrição

**Tabela: `registration_custom_field_values`**

| Coluna | Tipo | Descrição |
|--------|------|-----------|
| `id` | UUID PK | |
| `registration_id` | UUID FK → registrations(id) ON DELETE CASCADE | Inscrição. |
| `category_custom_field_id` | UUID FK → category_custom_fields(id) ON DELETE CASCADE | Campo da categoria. |
| `value` | TEXT NULL | Valor informado (para número, armazenado como texto; validação no backend/front). |
| `created_at` | TIMESTAMPTZ | |
| `updated_at` | TIMESTAMPTZ | |

- UNIQUE (`registration_id`, `category_custom_field_id`) para um valor por campo por inscrição.
- Índices: `registration_id`, `category_custom_field_id`.

---

## Etapas de implementação

### Etapa 1 – Banco de dados ✅

- **Arquivo:** `backend/migrations/099_create_category_custom_fields.sql`
  - Criar tabela `category_custom_fields`.
  - Criar tabela `registration_custom_field_values`.
  - Triggers `updated_at` se o projeto usar.
  - Registrar migração em `backend/scripts/run-migrations.ts`.

---

### Etapa 2 – Backend: CRUD de campos por categoria ✅

- **Serviço:** `backend/src/services/categoryCustomFieldsService.ts`
  - `getByCategoryId(categoryId): Promise<CategoryCustomField[]>`
  - `getById(id): Promise<CategoryCustomField | null>`
  - `create(data: { category_id, label, field_type, display_order? }): Promise<CategoryCustomField>`
  - `update(id, data: { label?, field_type?, display_order? }): Promise<CategoryCustomField>`
  - `deleteById(id): Promise<void>`

- **Controller / rotas**
  - `GET /api/categories/:categoryId/custom-fields` → lista campos da categoria (optionalAuth).
  - `POST /api/categories/:categoryId/custom-fields` → criar campo (organizer/admin).
  - `PUT /api/categories/:categoryId/custom-fields/:fieldId` → atualizar.
  - `DELETE /api/categories/:categoryId/custom-fields/:fieldId` → remover.
  - Ownership: organizador do evento da categoria ou admin.

- **Incluir campos na resposta de categorias**
  - `getCategoriesByEvent`, `getCategoriesByModality` e `getCategoryById` passam a retornar `custom_fields: CategoryCustomField[]` em cada categoria.

---

### Etapa 3 – Backend: inscrição (criar/atualizar) com valores de campos ✅

- **Payload de criação/edição de inscrição**
  - `custom_field_values?: Record<string, string>` (category_custom_field_id -> value) em CreateRegistrationData e UpdateRegistrationData; schema Zod e allowlist do update incluem o campo.

- **Serviço de inscrições**
  - Na criação: após inserir `registrations` e product_selections, validar cada chave de `custom_field_values` pertence à categoria (getByCategoryId), inserir em `registration_custom_field_values` (ON CONFLICT DO UPDATE).
  - Na edição: extrair `custom_field_values` do payload; atualizar apenas colunas da tabela `registrations`; se `custom_field_values` foi enviado, apagar linhas antigas e inserir novas, validando que cada field_id pertence à categoria efetiva da inscrição.

- **Resposta de “detalhe da inscrição” / listagem**
  - `getRegistrationById` e `getRegistrations` carregam valores de `registration_custom_field_values` e retornam `custom_field_values: { [fieldId]: value }` em cada inscrição.

---

### Etapa 4 – Backend: exportação planilha ✅

- No controller/serviço que gera o CSV de inscritos:
  - Para o conjunto de inscrições exportadas, obter todas as categorias envolvidas e seus `category_custom_fields` (getByCategoryId por categoria).
  - Colunas extras: um cabeçalho por campo (label sanitizado: remove `;` e quebras de linha).
  - Para cada inscrição, preencher as colunas de campos personalizados com `reg.custom_field_values[field_id]` (já retornado por getRegistrations); se a inscrição for de outra categoria que não tem aquele campo, célula vazia.
  - Colunas atuais mantidas; novas colunas de campos personalizados ao final.

---

### Etapa 5 – Frontend: cadastro de evento (campos por categoria) ✅

- **Componente:** aba Categorias em `EventFormDialog` (ou equivalente).
  - Em cada card de categoria, após “Lotes de Preço” (ou em seção própria), incluir:
    - Título: **“Campos personalizados”**.
    - Botão: **“Adicionar campo personalizado”**.
  - Ao clicar:
    - Abrir pequeno formulário (inline ou modal): **Nome do campo** (input texto), **Tipo** (select: “Texto” ou “Número”).
    - Ao salvar, chamar API de criação do campo (Etapa 2) e atualizar lista local (ou recarregar categorias).
  - Listar campos já criados para a categoria com opção de **editar** (nome/tipo) e **remover**.
  - Ordem: pode ser por `display_order` (ex.: drag-and-drop ou botões “subir/descer”); mínimo é manter a ordem retornada pela API.

- **Salvar evento**
  - Os campos são gerençados via API de custom-fields por categoria; não é obrigatório enviar tudo no “save” do evento se já forem criados/alterados/removidos em tempo real. Se preferir “salvar tudo ao salvar evento”, a sincronização pode ser feita no submit: comparar lista de campos da categoria com a do servidor e chamar create/update/delete conforme necessário.

---

### Etapa 6 – Frontend: fluxo de inscrição (exibir e enviar valores) ✅

- **Onde**
  - Fluxo público de inscrição (ex.: `RegistrationFlow.tsx`).
  - Inscrição pelo organizador (ex.: `OrganizerRegistrations.tsx`).
  - Inscrição por líder (ex.: `LeaderDashboard.tsx`).
  - Completar convite (ex.: `CompleteInvitationModal.tsx`), quando o corredor escolhe categoria.

- **Comportamento**
  - Quando o usuário **seleciona a categoria**, buscar os `custom_fields` dessa categoria (já podem vir em `categories` se a API retornar assim).
  - Renderizar, abaixo da seleção de categoria, um bloco “Campos da categoria” com:
    - Para cada campo: `<label>`, input tipo `text` ou `number` conforme `field_type`, opcionalmente `required` (se for definido no plano; inicialmente pode ser tudo opcional).
  - No payload de **criação** (e, se houver, **edição**) da inscrição, enviar `custom_field_values: { [fieldId]: value }` com os valores preenchidos.

- **Validação**
  - Tipo número: no front, usar `input type="number"` e/ou validação; no backend, validar que é número quando `field_type === 'number'` (e opcionalmente range min/max se for especificado depois).

---

### Etapa 7 – Exibição/edição de campos na inscrição (admin/organizador) ✅

- Nas telas de **detalhe/edição de inscrição** (admin e organizador), exibir os campos personalizados da categoria da inscrição e permitir editar valores (salvando em `registration_custom_field_values` via API de atualização de inscrição).
- Garantir que, ao trocar a categoria da inscrição na edição, os campos exibidos sejam os da nova categoria e os valores antigos (de campos que não existem mais) sejam ignorados ou removidos.

---

### Etapa 8 – Testes e documentação

- **Testes manuais**
  - Criar evento, adicionar categoria, adicionar 2 campos (texto e número); salvar; abrir inscrição, escolher categoria, preencher campos; concluir com PIX e com cartão; verificar na base e na exportação CSV se as colunas e valores aparecem.
  - Editar inscrição (admin/organizador) e alterar valor de campo personalizado; exportar novamente.
  - Categoria sem campos: inscrição sem bloco de campos; CSV sem colunas extras para essa categoria.
- **Documentação**
  - Atualizar `API_DOCUMENTATION.md` (ou equivalente) com os novos endpoints e formato de `custom_field_values` no payload de inscrição e na resposta.
  - Atualizar este plano com “Concluído” em cada etapa após implementação.

---

## Resumo de arquivos impactados (estimativa)

| Camada | Arquivos |
|--------|----------|
| **DB** | `backend/migrations/099_create_category_custom_fields.sql`, `run-migrations.ts` |
| **Backend** | `categoryCustomFieldsService.ts` (novo), `categoriesService.ts` (incluir custom_fields), `registrationsService.ts` (create/update/export), `registrationsController.ts` (payload, export CSV), rotas admin/organizer |
| **Frontend** | `EventFormDialog.tsx` (aba Categorias), `RegistrationFlow.tsx`, `OrganizerRegistrations.tsx`, `LeaderDashboard.tsx`, `CompleteInvitationModal.tsx`, telas de detalhe/edição de inscrição (admin/organizer), `src/lib/api/` (tipos e chamadas para custom-fields e payload de inscrição) |

---

## Tipos (TypeScript) sugeridos

```ts
// Backend / Front
interface CategoryCustomField {
  id: string;
  category_id: string;
  label: string;
  field_type: 'text' | 'number';
  display_order: number;
  created_at: string;
  updated_at: string;
}

// Inscrição: valores
interface RegistrationCustomFieldValue {
  category_custom_field_id: string;
  value: string | null;
}

// Payload criação/edição inscrição
// custom_field_values: Record<string, string>  // fieldId -> value
```

---

## Observações

- **Obrigatoriedade:** inicialmente todos os campos podem ser opcionais; depois pode-se adicionar `required BOOLEAN` em `category_custom_fields` e validar no front e no backend.
- **Ordem de exibição:** `display_order` permite ordenar os campos; no front, ordenar por esse valor antes de renderizar.
- **Exportação:** colunas dinâmicas por evento (cada evento pode ter categorias com conjuntos diferentes de campos); o exportador deve montar o conjunto de colunas a partir dos `category_custom_fields` das categorias das inscrições exportadas.
- **Compatibilidade:** inscrições antigas não têm linhas em `registration_custom_field_values`; na exportação e na tela de detalhe, essas colunas/campos ficam vazios.

---

## Checklist de conclusão (para marcar após implementação)

- [x] Etapa 1 – Migração e run-migrations
- [x] Etapa 2 – CRUD backend e inclusão de custom_fields nas categorias
- [x] Etapa 3 – Gravar/recuperar valores na inscrição (criar/editar)
- [x] Etapa 4 – Colunas na exportação CSV
- [x] Etapa 5 – UI “Adicionar campo personalizado” no cadastro de evento
- [x] Etapa 6 – Exibir e enviar campos no fluxo de inscrição (público, organizador, líder, convite)
- [ ] Etapa 7 – Ver/editar campos na tela de detalhe/edição da inscrição
- [ ] Etapa 8 – Testes e documentação da API
