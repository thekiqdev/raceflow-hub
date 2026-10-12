import { getSystemSettings } from './systemSettingsService.js';

/** Env `false` força off; módulo em Configurações habilita; env `true` permanece como fallback de deploy. */
export function resolveCheckoutFeatureFlag(moduleEnabled:boolean|undefined,envValue:string|undefined) {
  const env=envValue?.trim().toLowerCase();
  if(env==='false') return false;
  if(moduleEnabled===true) return true;
  return env==='true';
}

export async function isMultiRegistrationCheckoutEnabled() {
  const settings=await getSystemSettings();
  return resolveCheckoutFeatureFlag(
    settings.enabled_modules?.multi_registration_checkout,
    process.env.MULTI_REGISTRATION_CHECKOUT_ENABLED,
  );
}

/** Mesma regra para o trabalhador de entrega/e-mail dos pedidos. */
export async function isCheckoutDeliveryEnabled() {
  const settings=await getSystemSettings();
  return resolveCheckoutFeatureFlag(
    settings.enabled_modules?.checkout_delivery,
    process.env.CHECKOUT_DELIVERY_ENABLED,
  );
}
