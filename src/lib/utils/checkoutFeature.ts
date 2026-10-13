/**
 * Lê o flag público de `/registrations/settings/modules`.
 * O backend já resolve módulo + env (`MULTI_REGISTRATION_CHECKOUT_ENABLED`) nesse endpoint.
 */
export function isMultiRegistrationCheckoutEnabled(modules?: Record<string, boolean> | null) {
  return modules?.multi_registration_checkout === true;
}
