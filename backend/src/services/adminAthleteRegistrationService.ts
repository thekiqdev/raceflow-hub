/**
 * Inscrição de atleta por staff (organizador ou super admin).
 * Centraliza validações e criação para evitar duplicação entre controllers.
 */

import { query } from '../config/database.js';
import {
  findUserByCpf,
  createRunnerByOrganizer,
  createRegistration,
  type CreateRegistrationData,
} from './registrationsService.js';
import { getEventById, getEffectiveRegistrationStatus } from './eventsService.js';
import { getCategoryById } from './categoriesService.js';
import { calculateRegistrationTotal } from './registrationTotalService.js';
import { isValidCpfDigits } from '../utils/cpf.js';

export type StaffAthleteActorType = 'organizer' | 'super_admin';

export interface RunnerDataByStaff {
  full_name: string;
  birth_date: string;
  city: string;
  gender: string;
  team?: string;
  email?: string;
  phone?: string;
}

export interface ProductSelectionInput {
  product_id: string;
  variant_id?: string;
  attribute_selections?: Record<string, string>;
}

export interface RegisterAthleteByStaffParams {
  actorType: StaffAthleteActorType;
  actorUserId: string;
  /** true = não bloquear por inscrições encerradas / não abertas */
  ignoreEventRegistrationWindow: boolean;
  /** true = total sem taxa da plataforma (apenas super_admin hoje) */
  waivePlatformFee: boolean;
  cpf: string;
  runner_data?: RunnerDataByStaff;
  event_id: string;
  category_id: string;
  kit_id?: string;
  modality_id?: string | null;
  product_selections?: ProductSelectionInput[];
  custom_field_values?: Record<string, string>;
}

function assertRegistrationWindowUnlessIgnored(
  event: Awaited<ReturnType<typeof getEventById>>,
  ignoreEventRegistrationWindow: boolean
): void {
  if (!event) throw new Error('Evento não encontrado');
  if (ignoreEventRegistrationWindow) return;

  const effective = getEffectiveRegistrationStatus(event);
  if (effective !== null) {
    if (effective === 'not_open') {
      throw new Error(
        event.registration_auto_mode && event.registration_start_date
          ? `As inscrições abrem em ${new Date(event.registration_start_date).toLocaleString('pt-BR')}.`
          : 'As inscrições ainda não estão abertas.'
      );
    }
    if (effective === 'closed') {
      throw new Error(
        event.registration_auto_mode && event.registration_end_date
          ? `As inscrições foram encerradas em ${new Date(event.registration_end_date).toLocaleString('pt-BR')}.`
          : 'As inscrições para este evento foram encerradas.'
      );
    }
  } else {
    if (event.status === 'draft') {
      throw new Error('Este evento ainda não está aberto para inscrições');
    }
    if (event.status === 'finished' || event.status === 'cancelled') {
      throw new Error('Este evento não está mais aceitando inscrições');
    }
  }
}

/**
 * Fluxo compartilhado: organizador (convite/valor zero, free_bonus) ou super admin (inscrição normal, sem taxa plataforma).
 */
export async function registerAthleteByStaff(params: RegisterAthleteByStaffParams) {
  const {
    actorType,
    actorUserId,
    ignoreEventRegistrationWindow,
    waivePlatformFee,
    cpf,
    runner_data,
    event_id,
    category_id,
    kit_id,
    modality_id,
    product_selections,
    custom_field_values,
  } = params;

  const cleanCpf = String(cpf).replace(/[^0-9]/g, '');
  if (!isValidCpfDigits(cleanCpf)) {
    throw new Error('CPF inválido');
  }

  let athlete = await findUserByCpf(cleanCpf);

  if (!athlete) {
    if (!runner_data || !runner_data.full_name) {
      throw new Error('CPF_NOT_REGISTERED');
    }
    const created = await createRunnerByOrganizer(cleanCpf, runner_data);
    athlete = { id: created.id, full_name: runner_data.full_name, cpf: cleanCpf };
  }

  const event = await getEventById(event_id);
  if (!event) {
    throw new Error('EVENT_NOT_FOUND');
  }

  if (actorType === 'organizer') {
    if (event.organizer_id !== actorUserId) {
      throw new Error('FORBIDDEN_ORGANIZER_EVENT');
    }
  }

  assertRegistrationWindowUnlessIgnored(event, ignoreEventRegistrationWindow);

  const selectedCategory = await getCategoryById(category_id);
  if (!selectedCategory) {
    throw new Error('CATEGORY_NOT_FOUND');
  }
  if (selectedCategory.event_id !== event_id) {
    throw new Error('Category does not belong to this event');
  }

  const existingRegistration = await query(
    `SELECT id, status, payment_status FROM registrations 
     WHERE event_id = $1 AND runner_id = $2 AND status != 'cancelled'
     AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)`,
    [event_id, athlete.id]
  );

  if (existingRegistration.rows.length > 0) {
    throw new Error('ALREADY_REGISTERED');
  }

  let registrationData: CreateRegistrationData;

  if (actorType === 'organizer') {
    registrationData = {
      event_id,
      category_id,
      kit_id: kit_id || undefined,
      modality_id: modality_id ?? undefined,
      runner_id: athlete.id,
      registered_by: actorUserId,
      total_amount: 0,
      platform_fee_amount: 0,
      payment_method: 'free_bonus',
      status: 'confirmed',
      payment_status: 'convidado',
      product_selections: product_selections || undefined,
      custom_field_values: custom_field_values || undefined,
    };
  } else {
    if (!waivePlatformFee) {
      throw new Error('super_admin exige waivePlatformFee para este fluxo');
    }
    const calculation = await calculateRegistrationTotal({
      eventId: event_id,
      categoryId: category_id,
      kitId: kit_id ?? null,
      modalityId: modality_id ?? null,
      batchId: undefined,
      couponCode: undefined,
      runnerId: athlete.id,
    });
    const totalAmount = Math.round(calculation.amountAfterDiscounts * 100) / 100;
    registrationData = {
      event_id,
      category_id,
      kit_id: kit_id || undefined,
      modality_id: modality_id ?? undefined,
      runner_id: athlete.id,
      registered_by: actorUserId,
      total_amount: totalAmount,
      platform_fee_amount: 0,
      payment_method: 'pix',
      status: 'confirmed',
      payment_status: 'paid',
      product_selections: product_selections || undefined,
      custom_field_values: custom_field_values || undefined,
    };
  }

  const registration = await createRegistration(registrationData);

  return { registration, event };
}
