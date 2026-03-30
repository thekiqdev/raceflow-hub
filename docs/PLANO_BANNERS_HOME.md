# Plano: Banners / Slide na Home do Site

## 1. Objetivo

- Permitir que o **admin** configure **banners** exibidos na home do site (slider/carrossel).
- Cada banner pode ser **ativado ou desativado** sem ser excluído.
- Suportar **múltiplos banners** com ordem de exibição configurável.
- Acesso à gestão pelo menu do admin em **/banners** (ex.: `/admin/banners`).

---

## 2. Requisitos (resumo)

| # | Requisito | Detalhe |
|---|-----------|--------|
| 1 | Configuração pelo admin | Menu do admin com item "Banners" (path ex.: `/admin/banners`). |
| 2 | Múltiplos banners | CRUD de itens; cada item = imagem (URL ou upload), opcionalmente título/legenda, ordem. |
| 3 | Ativar/desativar | Campo `is_active` (ou equivalente); apenas banners ativos aparecem na home. |

---

## 3. Visão geral das etapas

| Etapa | Nome | Resumo |
|-------|------|--------|
| **1** | Banco de dados | Criar tabela `home_banners` e migration. |
| **2** | Backend – API | Service + controller + rotas: CRUD (admin) e GET público (banners ativos). |
| **3** | Frontend – API e menu | Cliente API de banners; item "Banners" no menu admin e rota `/admin/banners`. |
| **4** | Frontend – tela Admin Banners | Listagem, criar, editar, excluir, ativar/desativar e ordenar. |
| **5** | Frontend – Home | Exibir slider/carrossel na home com banners ativos. |
| **6** | Validação e documentação | Testes manuais e ajustes finais. |

---

## 4. Etapa 1 – Banco de dados

**Objetivo:** Persistir banners com imagem, ordem e status ativo.

**Tarefas:**

1. Criar migration (ex.: `096_create_home_banners.sql`).
2. Tabela `home_banners`:
   - `id` (UUID, PK)
   - `image_url` (TEXT NOT NULL) – URL da imagem do banner
   - `title` (VARCHAR, opcional) – título ou legenda
   - `link_url` (TEXT, opcional) – URL de destino ao clicar no banner
   - `is_active` (BOOLEAN, default true)
   - `display_order` (INTEGER, default 0) – ordem no slide (menor = primeiro)
   - `created_at`, `updated_at` (TIMESTAMPTZ)

**Entregáveis:**

- Migration aplicável sem conflito com schema existente.
- Tabela utilizável pelo service da Etapa 2.

**Critérios de conclusão:**

- [x] Migration criada e documentada (`backend/migrations/096_create_home_banners.sql`).
- [x] Tabela `home_banners` existe com os campos acima.

---

## 5. Etapa 2 – Backend (API)

**Objetivo:** API REST para gestão (admin) e leitura pública (banners ativos).

**Tarefas:**

1. **Service** (`homeBannersService.ts` ou equivalente):
   - `getActiveBanners()` – retorna banners com `is_active = true` ordenados por `display_order`.
   - `getAllBanners()` – retorna todos (admin).
   - `getBannerById(id)`
   - `createBanner(data)` – admin
   - `updateBanner(id, data)` – admin (inclui `is_active`, `display_order`, `image_url`, `title`, `link_url`)
   - `deleteBanner(id)` – admin
   - Opcional: `reorderBanners(orderedIds)` para definir ordem em lote.

2. **Controller** (`homeBannersController.ts`):
   - `GET /api/home-banners` – **público** – lista banners ativos (para a home).
   - `GET /api/admin/home-banners` – lista todos (admin).
   - `GET /api/admin/home-banners/:id` – um banner (admin).
   - `POST /api/admin/home-banners` – criar (admin).
   - `PUT /api/admin/home-banners/:id` – atualizar (admin), incluindo ativar/desativar.
   - `DELETE /api/admin/home-banners/:id` – excluir (admin).

3. **Rotas:**
   - Registrar rota pública em `server.ts` (ex.: `/api/home-banners`).
   - Registrar rotas admin em `adminRoutes.ts` (ex.: `/admin/home-banners`).

4. **Validação:** Zod (ou equivalente) para payloads: `image_url` obrigatório, `title`/`link_url` opcionais, `is_active` boolean, `display_order` inteiro.

**Entregáveis:**

- Service, controller e rotas implementados.
- Endpoint público retornando apenas banners ativos ordenados.
- Endpoints admin protegidos por role admin.

**Critérios de conclusão:**

- [x] GET público retorna apenas banners ativos.
- [x] Admin consegue criar, editar (incl. ativar/desativar) e excluir banners.
- [x] Ordem de exibição respeitada (`display_order`).

---

## 6. Etapa 3 – Frontend: API e menu admin

**Objetivo:** Cliente API para banners e entrada "Banners" no menu do admin.

**Tarefas:**

1. **API client** (ex.: `src/lib/api/homeBanners.ts`):
   - `getActiveBanners()` – GET público (usado na home).
   - `getAllBanners()` – GET admin.
   - `getBanner(id)`
   - `createBanner(data)`
   - `updateBanner(id, data)` – inclui `is_active`, `display_order`, etc.
   - `deleteBanner(id)`
   - Tipos: `HomeBanner`, `CreateHomeBannerData`, `UpdateHomeBannerData`.

2. **Navegação admin:**
   - Em `ADMIN_SECTION_TO_PATH` e `ADMIN_SECTION_LABELS` (e em `AdminSidebar` se o menu for estático): adicionar seção `banners` → path `banners`, label "Banners".
   - Em `AdminDashboard.tsx`: no switch de seções, quando `activeSection === 'banners'` renderizar o componente da tela de Banners (Etapa 4).
   - Garantir que a URL `/admin/banners` (ou `/admin/banners` conforme path escolhido) mostre a tela de Banners.

**Entregáveis:**

- Funções de API e tipos TypeScript.
- Menu admin com item "Banners" levando à nova tela.

**Critérios de conclusão:**

- [x] Chamadas à API de banners funcionando (listar ativos, listar todos, CRUD).
- [x] Menu admin exibe "Banners" e ao clicar abre a tela da Etapa 4.

---

## 7. Etapa 4 – Frontend: tela Admin Banners

**Objetivo:** Tela em que o admin gerencia os banners (listar, criar, editar, ativar/desativar, excluir, ordenar).

**Tarefas:**

1. **Componente principal** (ex.: `AdminBanners.tsx` ou `BannersManagement.tsx` em `src/components/admin/`):
   - Listagem de todos os banners (card ou tabela) com: imagem (thumbnail), título, ativo (sim/não), ordem.
   - Botão "Novo banner" abrindo formulário (modal ou página).
   - Por item: ações Editar, Ativar/Desativar (toggle), Excluir (com confirmação).
   - Ordenação: possibilidade de alterar ordem (ex.: setas ou drag-and-drop) e salvar via `updateBanner` com novo `display_order`.

2. **Formulário de criar/editar:**
   - Campos: URL da imagem (ou uso do componente de upload existente, ex.: `FileUpload` tipo `banner`), título (opcional), link de destino (opcional), ativo (checkbox), ordem (número).
   - Validação: imagem obrigatória; título e link opcionais.

3. **Ativar/desativar:** ao alternar, chamar `updateBanner(id, { is_active: true/false })` e atualizar lista.

**Entregáveis:**

- Tela completa de gestão de banners.
- Criação, edição, exclusão e toggle de ativo funcionando.
- Ordem editável e persistida.

**Critérios de conclusão:**

- [x] Admin consegue adicionar vários banners.
- [x] Admin consegue ativar/desativar cada um sem excluir.
- [x] Admin consegue editar e excluir banners.
- [x] Ordem de exibição configurável e salva.

---

## 8. Etapa 5 – Frontend: Home com slider de banners

**Objetivo:** Na página inicial do site, exibir um slider/carrossel com os banners ativos.

**Tarefas:**

1. **Consumir API:** Na página da home (ex.: `Index.tsx`), chamar `getActiveBanners()` (ou endpoint público equivalente).
2. **Componente de slider/carrossel:**
   - Se não houver banners ativos: exibir o bloco atual do hero (ex.: `hero_image_url` de `home_page_settings`) ou área vazia/placeholder, conforme regra de negócio.
   - Se houver banners ativos: exibir carrossel (autoplay opcional, setas, indicadores de slide).
   - Cada slide: imagem do banner; se houver `link_url`, envolver em `<a>` ou tratar clique para navegação.
   - Usar componente existente (ex.: carousel do Shadcn) ou biblioteca leve (embla-carousel, swiper, etc.), alinhado ao design atual.
3. **Responsividade e acessibilidade:** alt text a partir de `title` ou da imagem; comportamento adequado em mobile.

**Entregáveis:**

- Home exibindo carrossel de banners ativos quando existirem.
- Comportamento definido quando não houver banners (fallback para hero atual ou outro).

**Critérios de conclusão:**

- [x] Banners ativos aparecem na home em formato de slide/carrossel.
- [x] Banners inativos não aparecem.
- [x] Ordem na home igual à configurada no admin.
- [x] Clique no banner (se tiver link) redireciona corretamente.

---

## 9. Etapa 6 – Validação e documentação

**Objetivo:** Garantir que o fluxo está correto e documentar decisões.

**Tarefas:**

1. **Testes manuais:**
   - Admin: criar vários banners, ativar/desativar, alterar ordem, editar, excluir.
   - Home: conferir que só ativos aparecem, na ordem certa; link funciona quando preenchido.
2. **Documentação:** Atualizar ou criar doc de API (ex.: endpoints `GET /api/home-banners` e `/api/admin/home-banners`) e, se útil, breve seção no README ou em doc de features (ex.: "Banners na Home").

**Entregáveis:**

- Checklist de testes: [TESTES_BANNERS_HOME.md](./TESTES_BANNERS_HOME.md).
- API de banners documentada em `backend/API_DOCUMENTATION.md` (seção "Banners da Home (slider)").

**Critérios de conclusão:**

- [x] Fluxo admin e exibição na home validados (checklist disponível).
- [x] API de banners documentada.

---

## 10. Riscos e observações

- **Upload de imagem:** O plano assume `image_url` (URL). Se for obrigatório upload no servidor, reutilizar o fluxo existente de upload (ex.: `upload/banner` já referenciado no projeto) e armazenar a URL retornada em `image_url`.
- **Compatibilidade com hero atual:** Definir se o slider **substitui** o hero atual da home quando há banners ativos ou se fica **acima/abaixo** do hero. Recomendação: slider no topo quando houver pelo menos um banner ativo; caso contrário, manter hero atual.
- **Performance:** Limitar quantidade de banners (ex.: máximo 10) e tamanho/qualidade de imagem nas instruções ao admin.
- **SEO/Acessibilidade:** Garantir `alt` nas imagens (usar `title` do banner quando existir).

---

## 11. Checklist final (resumo)

- [x] **Etapa 1:** Tabela `home_banners` criada via migration.
- [x] **Etapa 2:** API backend (pública + admin) implementada e protegida.
- [x] **Etapa 3:** API client e menu "Banners" no admin.
- [x] **Etapa 4:** Tela admin de gestão de banners (CRUD + ativar/desativar + ordem).
- [x] **Etapa 5:** Home exibindo slider com banners ativos.
- [x] **Etapa 6:** Testes (checklist em [TESTES_BANNERS_HOME.md](./TESTES_BANNERS_HOME.md)) e documentação da API concluídos.
