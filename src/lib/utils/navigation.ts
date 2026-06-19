import { User } from '@/lib/api/auth';

// ========== Admin (Etapa 5: mapa centralizado + labels para breadcrumb) ==========

/** Mapeamento seção admin (id interno) ↔ segmento da URL (path em português) */
export const ADMIN_SECTION_TO_PATH: Record<string, string> = {
  overview: 'visao-geral',
  users: 'usuarios',
  'runner-manual': 'cadastro-corredor',
  events: 'eventos',
  registrations: 'inscricoes',
  quotes: 'orcamentos',
  financial: 'financeiro',
  transfers: 'transferencias',
  'group-leaders': 'lideres-de-grupo',
  reports: 'relatorios',
  knowledge: 'base-de-conhecimento',
  customize: 'personalizar',
  banners: 'banners',
  settings: 'configuracoes',
  support: 'suporte',
  'audit-cpf': 'auditoria/cpf',
  'audit-data-quality': 'auditoria/data-quality',
};

/** Labels em português para cada seção admin (breadcrumb, título) */
export const ADMIN_SECTION_LABELS: Record<string, string> = {
  overview: 'Visão geral',
  users: 'Usuários',
  'runner-manual': 'Cadastro de Corredor',
  events: 'Eventos',
  registrations: 'Inscrições',
  quotes: 'Orçamentos',
  financial: 'Financeiro',
  transfers: 'Transferências',
  'group-leaders': 'Líderes de Grupo',
  reports: 'Relatórios',
  knowledge: 'Base de Conhecimento',
  customize: 'Personalizar',
  banners: 'Banners',
  settings: 'Configurações',
  support: 'Suporte',
  'audit-cpf': 'Auditoria — CPF',
  'audit-data-quality': 'Auditoria — Qualidade dos Dados',
};

const ADMIN_PATH_TO_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(ADMIN_SECTION_TO_PATH).map(([k, v]) => [v, k])
);

/** URL completa da seção admin (ex.: /admin/configuracoes) */
export function getAdminPath(sectionId: string): string {
  if (sectionId === 'audit-cpf') {
    return '/admin/auditoria/cpf';
  }
  if (sectionId === 'audit-data-quality') {
    return '/admin/auditoria/data-quality';
  }
  const segment = ADMIN_SECTION_TO_PATH[sectionId] ?? 'visao-geral';
  return `/admin/${segment}`;
}

/** Lê o pathname (ex.: /admin/configuracoes) e retorna o sectionId (ex.: settings) */
export function getAdminSectionFromPath(pathname: string): string {
  const rest = pathname.replace(/^\/admin\/?/, '') || 'visao-geral';
  if (rest === 'dashboard') return 'overview';
  if (rest === 'auditoria/cpf' || rest.startsWith('auditoria/cpf')) return 'audit-cpf';
  if (rest === 'auditoria/data-quality' || rest.startsWith('auditoria/data-quality')) {
    return 'audit-data-quality';
  }
  return ADMIN_PATH_TO_SECTION[rest] ?? 'overview';
}

/** Label da seção admin (ex.: settings → "Configurações") */
export function getAdminSectionLabel(sectionId: string): string {
  return ADMIN_SECTION_LABELS[sectionId] ?? 'Visão geral';
}

// ========== Organizador ==========

/** Mapeamento seção organizador (id interno) ↔ segmento da URL (path em português) */
export const ORGANIZER_SECTION_TO_PATH: Record<string, string> = {
  dashboard: 'visao-geral',
  events: 'eventos',
  registrations: 'inscricoes',
  financial: 'financeiro',
  'group-leaders': 'lideres-de-grupo',
  reports: 'relatorios',
  results: 'resultados',
  messages: 'mensagens',
  settings: 'configuracoes',
};

/** Labels em português para cada seção organizador */
export const ORGANIZER_SECTION_LABELS: Record<string, string> = {
  dashboard: 'Visão geral',
  events: 'Eventos',
  registrations: 'Inscrições',
  financial: 'Financeiro',
  'group-leaders': 'Líderes de Grupo',
  reports: 'Relatórios',
  results: 'Resultados',
  messages: 'Mensagens',
  settings: 'Configurações',
};

const ORGANIZER_PATH_TO_SECTION: Record<string, string> = Object.fromEntries(
  Object.entries(ORGANIZER_SECTION_TO_PATH).map(([k, v]) => [v, k])
);

/** URL completa da seção organizador (ex.: /organizador/configuracoes) */
export function getOrganizerPath(sectionId: string): string {
  const segment = ORGANIZER_SECTION_TO_PATH[sectionId] ?? 'visao-geral';
  return `/organizador/${segment}`;
}

/** Lê o pathname (ex.: /organizador/eventos) e retorna o sectionId (ex.: events) */
export function getOrganizerSectionFromPath(pathname: string): string {
  const segment = pathname.replace(/^\/organizador\/?/, '') || 'visao-geral';
  if (segment === 'dashboard') return 'dashboard';
  return ORGANIZER_PATH_TO_SECTION[segment] ?? 'dashboard';
}

/** Label da seção organizador (ex.: events → "Eventos") */
export function getOrganizerSectionLabel(sectionId: string): string {
  return ORGANIZER_SECTION_LABELS[sectionId] ?? 'Visão geral';
}

// ========== Corredor ==========

/** Mapeamento aba corredor (id interno) ↔ segmento da URL (path em português) */
export const CORREDOR_TAB_TO_PATH: Record<string, string> = {
  home: 'inicio',
  registrations: 'minhas-inscricoes',
  results: 'resultados',
  profile: 'perfil',
};

/** Labels em português para cada aba corredor */
export const CORREDOR_TAB_LABELS: Record<string, string> = {
  home: 'Início',
  registrations: 'Minhas inscrições',
  results: 'Resultados',
  profile: 'Perfil',
};

const CORREDOR_PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(CORREDOR_TAB_TO_PATH).map(([k, v]) => [v, k])
);

/** URL completa da aba corredor (ex.: /corredor/minhas-inscricoes) */
export function getCorredorPath(tabId: string): string {
  const segment = CORREDOR_TAB_TO_PATH[tabId] ?? 'inicio';
  return `/corredor/${segment}`;
}

/** Lê o pathname (ex.: /corredor/perfil) e retorna o tabId (ex.: profile) */
export function getCorredorTabFromPath(pathname: string): string {
  const segment = pathname.replace(/^\/corredor\/?/, '') || 'inicio';
  return CORREDOR_PATH_TO_TAB[segment] ?? 'home';
}

/** Label da aba corredor (ex.: profile → "Perfil") */
export function getCorredorTabLabel(tabId: string): string {
  return CORREDOR_TAB_LABELS[tabId] ?? 'Início';
}

/**
 * Retorna { area, sectionLabel } para breadcrumb a partir do pathname (Etapa 5).
 * Ex.: /admin/configuracoes → { area: 'Admin', sectionLabel: 'Configurações' }
 */
/** Tela dedicada de inscrições por evento (super admin). */
export function getAdminEventRegistrationsPath(eventId: string): string {
  return `/admin/evento/${eventId}/inscritos`;
}

/** Tela dedicada de inscrições por evento (organizador). */
export function getOrganizerEventRegistrationsPath(eventId: string): string {
  return `/organizador/evento/${eventId}/inscritos`;
}

export function getBreadcrumbForPath(pathname: string): { area: string; sectionLabel: string } | null {
  if (pathname.startsWith('/admin')) {
    const eventInsc = pathname.match(/^\/admin\/evento\/([^/]+)\/inscritos\/?$/);
    if (eventInsc) {
      return { area: 'Admin', sectionLabel: 'Inscrições do evento' };
    }
    const sectionId = getAdminSectionFromPath(pathname);
    if (sectionId === 'audit-cpf') {
      return { area: 'Admin', sectionLabel: 'Auditoria — CPF' };
    }
    if (sectionId === 'audit-data-quality') {
      return { area: 'Admin', sectionLabel: 'Auditoria — Qualidade dos Dados' };
    }
    return { area: 'Admin', sectionLabel: getAdminSectionLabel(sectionId) };
  }
  if (pathname.startsWith('/organizador')) {
    const eventInsc = pathname.match(/^\/organizador\/evento\/([^/]+)\/inscritos\/?$/);
    if (eventInsc) {
      return { area: 'Organizador', sectionLabel: 'Inscrições do evento' };
    }
    const sectionId = getOrganizerSectionFromPath(pathname);
    return { area: 'Organizador', sectionLabel: getOrganizerSectionLabel(sectionId) };
  }
  if (pathname.startsWith('/corredor')) {
    const tabId = getCorredorTabFromPath(pathname);
    return { area: 'Corredor', sectionLabel: getCorredorTabLabel(tabId) };
  }
  return null;
}

/**
 * Ponto de entrada único (Etapa 4): rota para onde enviar o usuário após login ou ao acessar /dashboard.
 * Usado por: Dashboard.tsx, Auth, Cadastro, LoginDialog, MultiStepRegistration, Header.
 * Prioridade: admin > organizer > runner.
 */
export const getDashboardRoute = (user: User | null): string => {
  if (!user || !user.roles || user.roles.length === 0) {
    return '/corredor/inicio';
  }

  if (user.roles.includes('admin')) {
    return '/admin/visao-geral';
  }

  if (user.roles.includes('organizer')) {
    return '/organizador/visao-geral';
  }

  return '/corredor/inicio';
};





