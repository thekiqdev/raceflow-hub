# Plano: Navegação e URLs intuitivas do sistema

**Status:** Etapas 1–5 implementadas. Tabela de referência em [docs/URLS_SISTEMA.md](./URLS_SISTEMA.md).

---

## Objetivo

Deixar a navegação de todas as páginas intuitiva, com **URLs completas em português** para cada área do sistema, em vez de manter sempre `/dashboard` com troca de conteúdo apenas por estado interno. Isso melhora:

- **Compartilhamento de links** (ex.: enviar "painel admin > configurações")
- **Histórico do navegador** e botão voltar
- **Favoritos** por seção
- **Clareza** de onde o usuário está (admin, organizador ou corredor)

---

## Situação atual

| Área        | URL atual           | Conteúdo real                                      |
|------------|---------------------|----------------------------------------------------|
| Entrada    | `/dashboard`        | Redireciona para o dashboard do perfil (admin/org/runner) |
| Admin      | `/admin/dashboard`  | Um único route; seções (Dashboard, Usuários, etc.) por estado (`activeSection`) |
| Organizador| `/organizer/dashboard` | Um único route; seções por estado (`activeSection`) |
| Corredor   | `/runner/dashboard` | Um único route; abas por estado + query `?tab=home\|registrations\|results\|profile` |
| Corredor   | `/runner/profile`   | Página de perfil (fora do dashboard)              |

**Problemas:**  
- Ao mudar de seção (ex.: Admin > Configurações), a URL continua `/admin/dashboard`.  
- Não dá para abrir ou compartilhar um link direto para "Configurações" do admin.  
- No corredor, só há `?tab=...`, sem paths como `/corredor/minhas-inscricoes`.

---

## Convenções adotadas

- **Prefixo por perfil:** `/admin`, `/organizador`, `/corredor` (em português para o organizador e corredor; admin pode manter `/admin` por ser termo técnico comum).
- **Paths em português**, minúsculas, com hífen: ex. `/organizador/eventos`, `/corredor/minhas-inscricoes`.
- **Um path por “página”** (tela principal de uma área), sem depender de estado interno para saber onde o usuário está.
- **Redirecionamento:** `/dashboard` continua redirecionando para o dashboard do perfil (admin/organizador/corredor) conforme role.

---

## Mapa de URLs proposto

### Rotas públicas (já existentes, mantidas)

| URL | Descrição |
|-----|-----------|
| `/` | Página inicial |
| `/auth` | Login |
| `/cadastro` | Cadastro |
| `/eventos` | Listagem de eventos |
| `/evento/:slug` | Detalhes do evento |
| `/inscricao/validar/:id` | Validar inscrição (alias sugerido para `/registration/validate/:id`) |
| … | Demais rotas públicas atuais |

### Admin (prefixo `/admin`)

| URL | Seção atual | Título no menu |
|-----|-------------|----------------|
| `/admin` ou `/admin/visao-geral` | overview | Dashboard / Visão geral |
| `/admin/usuarios` | users | Usuários |
| `/admin/eventos` | events | Eventos |
| `/admin/inscricoes` | registrations | Inscrições |
| `/admin/orcamentos` | quotes | Orçamentos |
| `/admin/financeiro` | financial | Financeiro |
| `/admin/transferencias` | transfers | Transferências |
| `/admin/lideres-de-grupo` | group-leaders | Líderes de Grupo |
| `/admin/relatorios` | reports | Relatórios |
| `/admin/base-de-conhecimento` | knowledge | Base de Conhecimento |
| `/admin/personalizar` | customize | Personalizar |
| `/admin/configuracoes` | settings | Configurações |
| `/admin/suporte` | support | Suporte |

**Comportamento:**  
- `/admin` → redireciona para `/admin/visao-geral` (ou exibe direto a visão geral).  
- Sidebar e links internos passam a usar essas URLs em vez de apenas `onSectionChange(id)`.

### Organizador (prefixo `/organizador`)

| URL | Seção atual | Título no menu |
|-----|-------------|----------------|
| `/organizador` ou `/organizador/visao-geral` | dashboard | Dashboard / Visão geral |
| `/organizador/eventos` | events | Eventos |
| `/organizador/inscricoes` | registrations | Inscrições |
| `/organizador/financeiro` | financial | Financeiro |
| `/organizador/lideres-de-grupo` | group-leaders | Líderes de Grupo |
| `/organizador/relatorios` | reports | Relatórios |
| `/organizador/resultados` | results | Resultados |
| `/organizador/mensagens` | messages | Mensagens |
| `/organizador/configuracoes` | settings | Configurações |

**Comportamento:**  
- `/organizador` → redireciona para `/organizador/visao-geral`.  
- Sidebar usa essas URLs.

### Corredor (prefixo `/corredor`)

| URL | Tab atual | Título |
|-----|-----------|--------|
| `/corredor` ou `/corredor/inicio` | home | Início |
| `/corredor/minhas-inscricoes` | registrations | Inscrições |
| `/corredor/resultados` | results | Resultados |
| `/corredor/perfil` | profile | Perfil |

**Comportamento:**  
- `/corredor` → redireciona para `/corredor/inicio`.  
- `/runner/profile` pode ser migrado para `/corredor/perfil` (e redirecionar o antigo).  
- Bottom nav e links internos usam esses paths.

### Ponto de entrada único

| URL | Ação |
|-----|------|
| `/dashboard` | Redireciona para `/admin/visao-geral`, `/organizador/visao-geral` ou `/corredor/inicio` conforme o role (mantendo lógica atual de `getDashboardRoute` adaptada aos novos paths). |

---

## Etapas de implementação

### Etapa 1 – Rotas e estrutura (Admin)

**Objetivo:** URLs do admin refletidas na barra de endereço e no histórico.

1. **Definir rotas no `App.tsx` (ou roteador)**  
   - Manter uma rota pai protegida para admin, ex.: `/admin/*`.  
   - Criar rotas filhas: `/admin/visao-geral`, `/admin/usuarios`, `/admin/eventos`, etc., todas renderizando o mesmo layout (sidebar + área de conteúdo) com um parâmetro de “seção” (path ou segmento).

2. **Sincronizar URL ↔ seção**  
   - Ao carregar a página: ler o path (ex. `/admin/configuracoes`) e setar `activeSection` correspondente (ex. `settings`).  
   - Ao clicar em um item do sidebar: navegar para o path (ex. `navigate('/admin/configuracoes')`) em vez de só `onSectionChange('settings')`.  
   - Manter um mapeamento path → sectionId (e vice-versa) em um único lugar (ex. `adminRoutes` em `navigation.ts` ou no próprio layout).

3. **Redirects**  
   - `/admin` e `/admin/dashboard` → redirecionar para `/admin/visao-geral`.  
   - Ajustar `getDashboardRoute()` para retornar `/admin/visao-geral` para admin (e depois o equivalente para organizador e corredor).

4. **Links internos e eventos**  
   - Onde hoje se dispara `admin:navigate-to-section` com um id, passar a usar `navigate('/admin/...')` com o path correspondente.  
   - Atualizar qualquer link ou botão que “vá para configurações” (ou outra seção) para usar a nova URL.

**Entregável:** Admin navegável por URL; ao mudar de seção, a URL muda; ao abrir `/admin/configuracoes`, abre direto em Configurações.

---

### Etapa 2 – Rotas e estrutura (Organizador)

**Objetivo:** Mesmo padrão do admin para o organizador.

1. **Rotas no `App.tsx`**  
   - Rota pai `/organizador/*` com layout (sidebar + conteúdo).  
   - Rotas filhas: `/organizador/visao-geral`, `/organizador/eventos`, `/organizador/inscricoes`, etc., mapeando para as `activeSection` atuais.

2. **Sincronizar URL ↔ seção**  
   - Ler path na montagem e ao mudar de rota; setar `activeSection`.  
   - Sidebar: ao clicar, `navigate('/organizador/...')`.

3. **Redirects**  
   - `/organizador` e `/organizer/dashboard` → redirecionar para `/organizador/visao-geral`.  
   - `getDashboardRoute()` para organizador retorna `/organizador/visao-geral`.

4. **Eventos e links**  
   - Substituir `organizer:navigate-to-section` por navegação por path onde fizer sentido.

**Entregável:** Organizador com URLs completas; comportamento análogo ao admin.

---

### Etapa 3 – Rotas e estrutura (Corredor)

**Objetivo:** Corredor com paths em português e sem depender só de `?tab=`.

1. **Rotas no `App.tsx`**  
   - Rota pai `/corredor/*` (ou equivalente) com o layout do corredor (conteúdo + bottom nav).  
   - Rotas: `/corredor/inicio`, `/corredor/minhas-inscricoes`, `/corredor/resultados`, `/corredor/perfil`.

2. **Sincronizar URL ↔ aba**  
   - Path atual define a aba ativa (início, inscrições, resultados, perfil).  
   - Bottom nav: ao tocar, `navigate('/corredor/...')` em vez de só `onTabChange`.

3. **Redirects e compatibilidade**  
   - `/corredor` → `/corredor/inicio`.  
   - `/runner/dashboard` e `/runner/profile` → redirecionar para `/corredor/inicio` e `/corredor/perfil` (mantendo compatibilidade com links antigos).  
   - `getDashboardRoute()` para runner retorna `/corredor/inicio`.

4. **Query `?tab=`**  
   - Opcional: ainda aceitar `?tab=...` no `/corredor` e redirecionar para o path correspondente, para não quebrar favoritos antigos.

**Entregável:** Corredor navegável por URL; bottom nav atualiza a URL; links antigos de runner redirecionam.

---

### Etapa 4 – Ponto de entrada e redirecionamentos globais

**Objetivo:** Um único `/dashboard` que leve cada perfil para a primeira tela certa.

1. **`/dashboard`**  
   - Continua redirecionando conforme role, mas para os novos paths:  
     - Admin → `/admin/visao-geral`  
     - Organizador → `/organizador/visao-geral`  
     - Corredor → `/corredor/inicio`

2. **`getDashboardRoute()`**  
   - Atualizar para retornar esses paths (e usá-lo em login, pós-cadastro, multi-step, etc.).

3. **Proteção de rotas**  
   - Garantir que `/admin/*` exija role admin, `/organizador/*` role organizador, `/corredor/*` role runner (e políticas de múltiplos roles, se houver).

**Entregável:** Entrada única por `/dashboard` e por login/cadastro levando às URLs novas.

---

### Etapa 5 – Constantes, acessibilidade e documentação

**Objetivo:** Um único lugar com o mapa de paths e labels; links acessíveis e documentados.

1. **Arquivo de rotas/navegação (ex. `src/lib/utils/navigation.ts` ou `src/config/routes.ts`)**  
   - Listas de paths por área (admin, organizador, corredor).  
   - Mapeamento path ↔ id de seção/aba.  
   - Labels em português para cada rota (para breadcrumb, título, etc.).  
   - Funções: `getAdminPath(sectionId)`, `getOrganizerPath(sectionId)`, `getCorredorPath(tabId)`, e inversas (path → section/tab).

2. **Breadcrumbs (opcional)**  
   - Usar as labels para exibir “Admin > Configurações” ou “Organizador > Eventos” quando fizer sentido.

3. **Documentação**  
   - Atualizar este plano com os paths finais implementados.  
   - Incluir na doc do projeto (README ou docs) uma tabela “URLs do sistema” para referência.

4. **Testes manuais**  
   - Navegar por cada área; recarregar na URL; compartilhar link; voltar/avançar do navegador; login pós-cadastro indo para a URL correta.

**Entregável:** Código organizado em um mapa de rotas centralizado, e documentação atualizada.

---

## Resumo das URLs por área (referência rápida)

- **Admin:** `/admin`, `/admin/visao-geral`, `/admin/usuarios`, `/admin/eventos`, `/admin/inscricoes`, `/admin/orcamentos`, `/admin/financeiro`, `/admin/transferencias`, `/admin/lideres-de-grupo`, `/admin/relatorios`, `/admin/base-de-conhecimento`, `/admin/personalizar`, `/admin/configuracoes`, `/admin/suporte`.
- **Organizador:** `/organizador`, `/organizador/visao-geral`, `/organizador/eventos`, `/organizador/inscricoes`, `/organizador/financeiro`, `/organizador/lideres-de-grupo`, `/organizador/relatorios`, `/organizador/resultados`, `/organizador/mensagens`, `/organizador/configuracoes`.
- **Corredor:** `/corredor`, `/corredor/inicio`, `/corredor/minhas-inscricoes`, `/corredor/resultados`, `/corredor/perfil`.
- **Entrada:** `/dashboard` → redireciona conforme perfil para uma das URLs acima.

Implementação concluída (Etapas 1–5). A navegação está intuitiva e com links completos em português. Mapa de rotas e labels centralizados em `src/lib/utils/navigation.ts`; breadcrumb "Área > Seção" no header do admin e do organizador; documentação em [URLS_SISTEMA.md](./URLS_SISTEMA.md).
