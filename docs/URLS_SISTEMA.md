# URLs do sistema (referência)

Navegação com URLs completas em português (Etapas 1–5). Fonte centralizada: `src/lib/utils/navigation.ts`.

---

## Ponto de entrada

| URL | Comportamento |
|-----|----------------|
| `/dashboard` | Redireciona conforme o perfil: admin → `/admin/visao-geral`, organizador → `/organizador/visao-geral`, corredor → `/corredor/inicio`. Requer login. |

---

## Admin

| URL | Tela |
|-----|------|
| `/admin` | Redireciona para `/admin/visao-geral` |
| `/admin/dashboard` | Redireciona para `/admin/visao-geral` (compatibilidade) |
| `/admin/visao-geral` | Visão geral |
| `/admin/usuarios` | Usuários |
| `/admin/eventos` | Eventos |
| `/admin/inscricoes` | Inscrições |
| `/admin/orcamentos` | Orçamentos |
| `/admin/financeiro` | Financeiro |
| `/admin/transferencias` | Transferências |
| `/admin/lideres-de-grupo` | Líderes de Grupo |
| `/admin/relatorios` | Relatórios |
| `/admin/base-de-conhecimento` | Base de Conhecimento |
| `/admin/personalizar` | Personalizar |
| `/admin/configuracoes` | Configurações |
| `/admin/suporte` | Suporte |

---

## Organizador

| URL | Tela |
|-----|------|
| `/organizador` | Redireciona para `/organizador/visao-geral` |
| `/organizer/dashboard` | Redireciona para `/organizador/visao-geral` (compatibilidade) |
| `/organizador/visao-geral` | Visão geral |
| `/organizador/eventos` | Eventos |
| `/organizador/inscricoes` | Inscrições |
| `/organizador/financeiro` | Financeiro |
| `/organizador/lideres-de-grupo` | Líderes de Grupo |
| `/organizador/relatorios` | Relatórios |
| `/organizador/resultados` | Resultados |
| `/organizador/mensagens` | Mensagens |
| `/organizador/configuracoes` | Configurações |

---

## Corredor

| URL | Tela |
|-----|------|
| `/corredor` | Redireciona para `/corredor/inicio` |
| `/runner/dashboard` | Redireciona para `/corredor/inicio` (compatibilidade) |
| `/runner/profile` | Redireciona para `/corredor/perfil` (compatibilidade) |
| `/corredor/inicio` | Início (explorar eventos) |
| `/corredor/minhas-inscricoes` | Minhas inscrições |
| `/corredor/resultados` | Resultados |
| `/corredor/perfil` | Perfil |

---

## Rotas públicas (existentes)

| URL | Descrição |
|-----|-----------|
| `/` | Página inicial |
| `/auth` | Login |
| `/cadastro` | Cadastro |
| `/eventos` | Listagem de eventos |
| `/evento/:slug` | Detalhes do evento |
| `/registration/validate/:id` | Validar inscrição |
| `/results` | Resultados (público) |
| `/orcamento` | Orçamento |
| `/faq` | FAQ |

---

## Funções e constantes (navigation.ts)

- **getDashboardRoute(user)** – rota pós-login e ao acessar `/dashboard`
- **getAdminPath(sectionId)**, **getAdminSectionFromPath(pathname)**, **getAdminSectionLabel(sectionId)**
- **getOrganizerPath(sectionId)**, **getOrganizerSectionFromPath(pathname)**, **getOrganizerSectionLabel(sectionId)**
- **getCorredorPath(tabId)**, **getCorredorTabFromPath(pathname)**, **getCorredorTabLabel(tabId)**
- **getBreadcrumbForPath(pathname)** – retorna `{ area, sectionLabel }` para breadcrumb
- **ADMIN_SECTION_LABELS**, **ORGANIZER_SECTION_LABELS**, **CORREDOR_TAB_LABELS** – labels em português
