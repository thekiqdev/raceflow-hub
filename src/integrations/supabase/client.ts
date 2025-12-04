// STUB FILE - Este arquivo existe apenas para evitar erros de compilação
// Os componentes que ainda usam Supabase precisam ser migrados para a nova API
// Veja MIGRATION_COMPLETE.md para mais informações

// TODO: Migrar componentes que ainda usam este arquivo:
// - OrganizerSidebar.tsx
// - OrganizerReports.tsx
// - OrganizerEvents.tsx
// - EventDetailedReport.tsx
// - RegistrationFlow.tsx
// - ContactDialog.tsx
// - EventViewEditDialog.tsx

export const supabase = {
  from: () => ({
    select: () => ({
      eq: () => ({
        single: () => Promise.resolve({ data: null, error: null }),
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
      order: () => ({
        maybeSingle: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    insert: () => ({
      select: () => ({
        single: () => Promise.resolve({ data: null, error: null }),
      }),
    }),
    update: () => ({
      eq: () => Promise.resolve({ error: null }),
    }),
  }),
  auth: {
    getUser: () => Promise.resolve({ data: { user: null }, error: null }),
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    signInWithPassword: () => Promise.resolve({ error: null }),
    signUp: () => Promise.resolve({ data: { user: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  },
} as any;





