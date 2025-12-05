import { getRegistrationById } from './registrationsService.js';

/**
 * Generate receipt data for a registration
 */
export const getReceiptData = async (registrationId: string) => {
  const registration = await getRegistrationById(registrationId);

  if (!registration) {
    throw new Error('Registration not found');
  }

  return {
    registration,
    receipt_number: registration.confirmation_code || registration.id.substring(0, 8).toUpperCase(),
    issued_at: new Date().toISOString(),
  };
};



