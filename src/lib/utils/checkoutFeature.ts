/** Lê o módulo salvo em Configurações > Módulos (sem depender de rebuild Vite). */
export function isMultiRegistrationCheckoutEnabled(modules?: Record<string, boolean> | null) {
  return modules?.multi_registration_checkout === true;
}
