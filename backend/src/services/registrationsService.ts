import { randomBytes } from 'crypto';
import type { PoolClient } from 'pg';
import { query, getClient } from '../config/database.js';
import { registrationConsumesVariantStockSql } from './variantStockPolicyService.js';
import {
  isStrictKitSelectionsEnabled,
  kitRequiresPersistedProductSelections,
  validateCreateRegistrationKitSelectionsStrict,
  countRegistrationProductSelectionRows,
} from './kitSelectionPolicyService.js';
import { RegistrationStatus, PaymentStatus, PaymentMethod } from '../types/index.js';
import { hashPassword } from './authService.js';
import { isValidCpfDigits } from '../utils/cpf.js';
import {
  normalizePersonName,
  normalizePhoneDigits,
  normalizePlaceName,
} from '../utils/profileNormalization.js';
import { assertValidFullName, assertValidPhone, assertValidCity, assertValidGender, normalizeGender } from '../utils/profileValidation.js';

/**
 * Estoque restante da variante no evento (consumo derivado por inscrições em status que consomem estoque).
 * @param excludeRegistrationId - se informado, não conta essa inscrição (útil ao atualizar atributos).
 */
export async function getVariantRemainingStock(
  variantId: string,
  eventId: string,
  excludeRegistrationId?: string
): Promise<number | null> {
  const row = await query(
    `SELECT available_quantity FROM product_variants WHERE id = $1`,
    [variantId]
  );
  if (row.rows.length === 0) return null;
  const base = row.rows[0].available_quantity;
  if (base == null) return null; // ilimitado

  const usageRow = await query(
    `SELECT COUNT(DISTINCT rps.registration_id)::int AS cnt
     FROM registration_product_selections rps
     INNER JOIN registrations r ON r.id = rps.registration_id AND ${registrationConsumesVariantStockSql('r')} AND r.event_id = $2
     WHERE rps.variant_id = $1 AND ($3::uuid IS NULL OR rps.registration_id != $3)`,
    [variantId, eventId, excludeRegistrationId ?? null]
  );
  const usage = parseInt(usageRow.rows[0]?.cnt) || 0;
  return Math.max(0, parseInt(base) - usage);
}

type QueryExecutor = Pick<PoolClient, 'query'>;

/**
 * Substitui todas as seleções canônicas da inscrição (edição de kit/categoria).
 * Valida estoque antes de persistir. Usar dentro de transação quando combinado com UPDATE da inscrição.
 */
export async function replaceRegistrationProductSelectionsForEdit(
  executor: QueryExecutor,
  registrationId: string,
  eventId: string,
  productSelections: ProductSelection[]
): Promise<void> {
  const run = (text: string, params?: unknown[]) => executor.query(text, params);

  for (const selection of productSelections) {
    const variantIdToCheck = selection.variant_id;
    if (variantIdToCheck) {
      const remaining = await getVariantRemainingStock(variantIdToCheck, eventId, registrationId);
      if (remaining !== null && remaining <= 0) {
        throw new Error('Estoque desta variante chegou a zero; não é possível selecioná-la.');
      }
    }
  }

  await run(`DELETE FROM registration_product_selections WHERE registration_id = $1`, [registrationId]);

  for (const selection of productSelections) {
    if (selection.attribute_selections && Object.keys(selection.attribute_selections).length > 0) {
      for (const [attributeName, attributeValue] of Object.entries(selection.attribute_selections)) {
        await run(
          `INSERT INTO registration_product_selections 
           (registration_id, product_id, variant_id, attribute_name, attribute_value)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            registrationId,
            selection.product_id,
            selection.variant_id || null,
            attributeName,
            attributeValue,
          ]
        );
      }
    } else if (selection.variant_id) {
      const variantResult = await run(`SELECT name, product_id FROM product_variants WHERE id = $1`, [
        selection.variant_id,
      ]);

      if (variantResult.rows.length > 0) {
        const variant = variantResult.rows[0] as { name: string; product_id: string };
        let inserted = false;
        const productResult = await run(`SELECT variant_attributes FROM kit_products WHERE id = $1`, [
          selection.product_id,
        ]);

        if (productResult.rows.length > 0) {
          const variantAttributes = productResult.rows[0].variant_attributes as string[] | null;

          if (variantAttributes && variantAttributes.length > 0) {
            const variantValues = variant.name.split(' - ').map((v: string) => v.trim());

            for (let i = 0; i < variantAttributes.length && i < variantValues.length; i++) {
              await run(
                `INSERT INTO registration_product_selections 
                 (registration_id, product_id, variant_id, attribute_name, attribute_value)
                 VALUES ($1, $2, $3, $4, $5)`,
                [
                  registrationId,
                  selection.product_id,
                  selection.variant_id,
                  variantAttributes[i],
                  variantValues[i],
                ]
              );
              inserted = true;
            }
          }
        }
        if (!inserted) {
          await run(
            `INSERT INTO registration_product_selections 
             (registration_id, product_id, variant_id, attribute_name, attribute_value)
             VALUES ($1, $2, $3, 'Variante', $4)`,
            [registrationId, selection.product_id, selection.variant_id, variant.name || selection.variant_id]
          );
        }
      }
    }
  }
}

// Credit Card Data Types
export interface CreditCardData {
  holderName: string;
  number: string;
  expiryMonth: string; // MM (01-12)
  expiryYear: string; // YYYY
  ccv: string; // 3 or 4 digits
}

export interface CreditCardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  addressComplement?: string;
  phone: string;
  mobilePhone?: string;
}

export interface ProductSelection {
  product_id: string;
  variant_id?: string;
  attribute_selections?: Record<string, string>; // { attributeName: attributeValue }
}

export interface CreateRegistrationData {
  event_id: string;
  runner_id: string;
  registered_by: string;
  category_id: string;
  kit_id?: string;
  /** Modalidade escolhida na inscrição (deve ser da categoria) */
  modality_id?: string | null;
  payment_method?: PaymentMethod;
  total_amount: number;
  /** Taxa da plataforma aplicada na inscrição inicial (R$). OK Etapa 1. */
  platform_fee_amount?: number;
  coupon_code?: string;
  status?: RegistrationStatus; // Optional status (used when organizer creates registration)
  payment_status?: PaymentStatus; // Optional payment_status (used when organizer creates registration)
  // Product and variant selections
  product_selections?: ProductSelection[];
  // Credit card data (only when payment_method is 'credit_card')
  credit_card?: CreditCardData;
  credit_card_holder_info?: CreditCardHolderInfo;
  /** Valores dos campos personalizados da categoria (category_custom_field_id -> value) */
  custom_field_values?: Record<string, string>;
}

export interface UpdateRegistrationData {
  status?: RegistrationStatus;
  payment_status?: PaymentStatus;
  payment_method?: PaymentMethod;
  /** Permite atrelar inscrição a um cupom/comissão por evento (ex.: cupom criado após a compra) */
  coupon_code?: string | null;
  /** Categoria da inscrição (admin/organizador podem alterar) */
  category_id?: string;
  /** Kit da inscrição (admin/organizador podem alterar; null = sem kit) */
  kit_id?: string | null;
  /** Modalidade da inscrição (admin/organizador podem alterar; deve ser da categoria; null = não definida) */
  modality_id?: string | null;
  /** Lote da categoria (admin escolhe na edição; usado para preço) */
  category_batch_id?: string | null;
  /** Valor total recalculado na edição (quando category/kit/batch mudam) */
  total_amount?: number;
  /** Taxa da plataforma (permite zerar quando status = convite). Etapa 3. */
  platform_fee_amount?: number | null;
  /** Taxa de atualização aplicada na edição quando o valor muda (R$). OK Etapa 1. Null para zerar (ex.: convite). */
  registration_edit_fee_amount?: number | null;
  /** Valores dos campos personalizados da categoria (category_custom_field_id -> value). Ao editar, substitui todos os valores. */
  custom_field_values?: Record<string, string>;
}

/**
 * Load custom field values for one or more registrations.
 * Returns a Map: registrationId -> { category_custom_field_id: value }
 */
async function getRegistrationCustomFieldValuesMap(
  registrationIds: string[]
): Promise<Map<string, Record<string, string>>> {
  if (registrationIds.length === 0) {
    return new Map();
  }
  const result = await query(
    `SELECT registration_id, category_custom_field_id, value
     FROM registration_custom_field_values
     WHERE registration_id = ANY($1::uuid[])`,
    [registrationIds]
  );
  const map = new Map<string, Record<string, string>>();
  for (const id of registrationIds) {
    map.set(id, {});
  }
  for (const row of result.rows) {
    const regId = row.registration_id;
    if (!map.has(regId)) map.set(regId, {});
    const obj = map.get(regId)!;
    obj[row.category_custom_field_id] = row.value ?? '';
  }
  return map;
}

/** JOINs compartilhados pela listagem de inscrições (filtros em e, p, r, etc.) */
const REGISTRATIONS_LIST_JOINS = `
    FROM registrations r
    LEFT JOIN events e ON r.event_id = e.id
    LEFT JOIN categories c ON r.category_id = c.id
    LEFT JOIN profiles p ON r.runner_id = p.id
    LEFT JOIN users u ON p.id = u.id
    LEFT JOIN event_kits ek ON r.kit_id = ek.id
    LEFT JOIN coupons cp ON r.coupon_code = cp.code
    LEFT JOIN group_leaders gl ON cp.leader_id = gl.id
    LEFT JOIN profiles lp ON gl.user_id = lp.id
`;

export type GetRegistrationsPagination = {
  page: number;
  page_size: number;
};

/** Condições WHERE da listagem (mesma semântica para COUNT e SELECT paginado). */
function buildRegistrationListWhereClause(filters?: {
  event_id?: string;
  runner_id?: string;
  registered_by?: string;
  organizer_id?: string;
  status?: RegistrationStatus;
  payment_status?: PaymentStatus;
  search?: string;
  category_id?: string;
  modality_id?: string;
  kit_id?: string;
  created_at_from?: string;
  created_at_to?: string;
  /** commercial | courtesy | leader_coupon */
  registration_kind?: string;
}): { conditions: string[]; params: any[] } {
  const conditions: string[] = [];
  const params: any[] = [];

  if (filters?.event_id) {
    conditions.push(`r.event_id = $${params.length + 1}`);
    params.push(filters.event_id);
  }

  if (filters?.runner_id) {
    conditions.push(`(
      r.runner_id = $${params.length + 1} OR 
      (r.registered_by = $${params.length + 1} AND r.status = 'transferred')
    )`);
    params.push(filters.runner_id);
  }

  if (filters?.registered_by) {
    conditions.push(`r.registered_by = $${params.length + 1}`);
    params.push(filters.registered_by);
  }

  if (filters?.organizer_id) {
    conditions.push(`e.organizer_id = $${params.length + 1}`);
    params.push(filters.organizer_id);
  }

  if (filters?.status) {
    if (filters.status === 'confirmed') {
      conditions.push(`(
        r.status = $${params.length + 1} OR 
        (r.status = 'transferred' AND r.runner_id != r.registered_by
          AND r.transferred_to_registration_id IS NULL)
      )`);
      params.push(filters.status);
    } else {
      conditions.push(`r.status = $${params.length + 1}`);
      params.push(filters.status);
    }
  }

  if (filters?.payment_status) {
    conditions.push(`r.payment_status = $${params.length + 1}`);
    params.push(filters.payment_status);
  }

  if (filters?.category_id) {
    conditions.push(`r.category_id = $${params.length + 1}`);
    params.push(filters.category_id);
  }

  if (filters?.modality_id) {
    conditions.push(`r.modality_id = $${params.length + 1}`);
    params.push(filters.modality_id);
  }

  if (filters?.kit_id) {
    conditions.push(`r.kit_id = $${params.length + 1}`);
    params.push(filters.kit_id);
  }

  if (filters?.created_at_from) {
    conditions.push(`r.created_at >= $${params.length + 1}::date`);
    params.push(filters.created_at_from);
  }

  if (filters?.created_at_to) {
    conditions.push(`r.created_at < ($${params.length + 1}::date + interval '1 day')`);
    params.push(filters.created_at_to);
  }

  if (filters?.registration_kind === 'courtesy') {
    conditions.push(`(r.payment_method = 'free_bonus' OR r.payment_status = 'convidado')`);
  } else if (filters?.registration_kind === 'commercial') {
    conditions.push(
      `(COALESCE(r.payment_method::text, '') != 'free_bonus' AND COALESCE(r.payment_status::text, '') != 'convidado')`
    );
  } else if (filters?.registration_kind === 'leader_coupon') {
    conditions.push(`cp.leader_id IS NOT NULL`);
  }

  if (filters?.search) {
    conditions.push(`(
      p.full_name ILIKE $${params.length + 1} OR
      p.cpf ILIKE $${params.length + 1} OR
      e.title ILIKE $${params.length + 1} OR
      u.email ILIKE $${params.length + 1}
    )`);
    params.push(`%${filters.search}%`);
  }

  conditions.push(`NOT EXISTS (
    SELECT 1 FROM leader_invitations li
    WHERE li.bonus_registration_id = r.id AND li.status = 'expired'
  )`);

  return { conditions, params };
}

/** Pós-processamento comum da listagem (map + pendências + campos customizados). */
async function mapRegistrationRows(
  resultRows: any[],
  filters?: {
    runner_id?: string;
  }
): Promise<
  Array<
    any & {
      modality_name: string | null;
      status: string;
      event_banner_url: string | null;
      pending_difference_amount: number;
      has_pending_difference: boolean;
      amount_paid: number;
      registration_edit_fee: number;
      custom_field_values: Record<string, string>;
    }
  >
> {
  const { getFileUrl } = await import('../middleware/upload.js');
  const { getPendingDifferenceAmountsForRegistrationIds, getTotalPaidForRegistrationIds } = await import('./asaasService.js');
  const { getSystemSettings } = await import('./systemSettingsService.js');
  const ids = resultRows.map((r: any) => r.id);
  const [pendingMap, totalPaidMap, settings, customFieldValuesMap] = await Promise.all([
    getPendingDifferenceAmountsForRegistrationIds(ids),
    getTotalPaidForRegistrationIds(ids),
    getSystemSettings(),
    getRegistrationCustomFieldValuesMap(ids),
  ]);
  const registrationEditFee = settings.registration_edit_fee ?? 0;

  return resultRows.map((row: any) => {
    let finalStatus = row.display_status || row.status;

    if (filters?.runner_id && row.is_transferred && row.registered_by === filters.runner_id) {
      finalStatus = 'transferred';
    }
    let finalPaymentStatus = row.payment_status;
    if (
      row.is_transferred &&
      row.runner_id !== row.registered_by &&
      filters?.runner_id
    ) {
      if (row.registered_by === filters.runner_id) {
        finalPaymentStatus = 'paid';
      } else if (row.runner_id === filters.runner_id) {
        finalPaymentStatus = 'transferred';
      }
    }
    const pendingDifferenceAmount = pendingMap[row.id] ?? 0;
    const amountPaid = totalPaidMap[row.id] ?? 0;
    const modalityName = row.modality_name || (row.modality_names && row.modality_names[0]) || null;
    return {
      ...row,
      modality_name: modalityName,
      status: finalStatus,
      payment_status: finalPaymentStatus,
      event_banner_url: row.event_banner_url ? getFileUrl(row.event_banner_url) : null,
      pending_difference_amount: pendingDifferenceAmount,
      has_pending_difference: pendingDifferenceAmount > 0.005,
      amount_paid: amountPaid,
      registration_edit_fee: registrationEditFee,
      custom_field_values: customFieldValuesMap.get(row.id) ?? {},
    };
  });
}

export type RegistrationListSummary = {
  total_registrations: number;
  confirmed_payments: number;
  pending_payments: number;
  refunds: number;
};

/** Contagens operacionais com os mesmos filtros “estruturais” (sem status/pagamento/tipo), para cards de atalho. */
export type RegistrationSegmentTotals = {
  total: number;
  paid: number;
  pending: number;
  partially_paid: number;
  courtesy: number;
  cancelled: number;
  refunded: number;
  transferred: number;
};

export type PaginatedRegistrationsResult = {
  items: Awaited<ReturnType<typeof mapRegistrationRows>>;
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  summary: RegistrationListSummary;
  segment_totals: RegistrationSegmentTotals;
};

type RegistrationListFilters = {
  event_id?: string;
  runner_id?: string;
  registered_by?: string;
  organizer_id?: string;
  status?: RegistrationStatus;
  payment_status?: PaymentStatus;
  search?: string;
  category_id?: string;
  modality_id?: string;
  kit_id?: string;
  created_at_from?: string;
  created_at_to?: string;
  registration_kind?: string;
};

function stripSegmentFilters(filters?: RegistrationListFilters): RegistrationListFilters | undefined {
  if (!filters) return undefined;
  const { status: _s, payment_status: _p, registration_kind: _k, ...rest } = filters;
  return Object.keys(rest).length > 0 ? (rest as RegistrationListFilters) : undefined;
}

// Get registrations with filters
export async function getRegistrations(
  filters?: RegistrationListFilters,
  pagination?: undefined
): Promise<Awaited<ReturnType<typeof mapRegistrationRows>>>;
export async function getRegistrations(
  filters: RegistrationListFilters | undefined,
  pagination: GetRegistrationsPagination
): Promise<PaginatedRegistrationsResult>;
export async function getRegistrations(
  filters?: RegistrationListFilters,
  pagination?: GetRegistrationsPagination
): Promise<Awaited<ReturnType<typeof mapRegistrationRows>> | PaginatedRegistrationsResult> {
  const { conditions, params } = buildRegistrationListWhereClause(filters);
  const whereSql = conditions.length > 0 ? ' WHERE ' + conditions.join(' AND ') : '';

  let queryText = `
    SELECT DISTINCT ON (r.id)
      r.*,
      e.title as event_title,
      e.event_date,
      e.banner_url as event_banner_url,
      e.organizer_id as event_organizer_id,
      e.transfers_enabled as event_transfers_enabled,
      e.transfer_until as event_transfer_until,
      c.name as category_name,
      c.category_type as category_type,
      c.gender as category_gender,
      c.min_age as category_min_age,
      p.full_name as runner_name,
      p.cpf as runner_cpf,
      p.gender as runner_gender,
      p.birth_date as runner_birth_date,
      p.preferred_name as runner_preferred_name,
      p.city as runner_city,
      p.state as runner_state,
      p.team as runner_team,
      p.phone as runner_phone,
      u.email as runner_email,
      ek.name as kit_name,
      -- Modalidade selecionada na inscrição
      (SELECT m_sel.name FROM modalities m_sel WHERE m_sel.id = r.modality_id) as modality_name,
      -- Modalidades associadas à categoria (usando subquery)
      (
        SELECT COALESCE(
          ARRAY_AGG(DISTINCT m2.distance) FILTER (WHERE m2.distance IS NOT NULL),
          ARRAY[]::TEXT[]
        )
        FROM category_modalities cm2
        LEFT JOIN modalities m2 ON cm2.modality_id = m2.id
        WHERE cm2.category_id = c.id
      ) as modality_distances,
      (
        SELECT COALESCE(
          ARRAY_AGG(DISTINCT m2.name) FILTER (WHERE m2.name IS NOT NULL),
          ARRAY[]::TEXT[]
        )
        FROM category_modalities cm2
        LEFT JOIN modalities m2 ON cm2.modality_id = m2.id
        WHERE cm2.category_id = c.id
      ) as modality_names,
      -- Transferência legado (uma linha, runner trocado): exibir "confirmed" ao titular atual.
      -- Split super admin: casca transferred + transferred_to permanece "transferred".
      CASE 
        WHEN r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL THEN r.status
        WHEN r.status = 'transferred' AND r.runner_id != r.registered_by THEN 'confirmed'
        ELSE r.status
      END as display_status,
      (r.status = 'transferred' AND r.runner_id != r.registered_by
        AND r.transferred_to_registration_id IS NULL) as is_transferred,
      -- Informações do cupom (se houver)
      cp.code as coupon_code,
      cp.leader_id as coupon_leader_id,
      -- Informações do líder (se o cupom pertence a um líder)
      gl.id as leader_id,
      lp.full_name as leader_name,
      -- Etapa 4: convite com "corredor escolhe" (para fluxo de completar categoria/modalidade/kit)
      (SELECT li.runner_chooses_category_modality_kit FROM leader_invitations li WHERE li.bonus_registration_id = r.id AND li.runner_id = r.runner_id LIMIT 1) as invitation_runner_chooses_category_modality_kit
    ${REGISTRATIONS_LIST_JOINS}
    ${whereSql}
  `;

  queryText += ' ORDER BY r.id, r.created_at DESC';

  queryText = `
    SELECT * FROM (
      ${queryText}
    ) AS distinct_registrations
    ORDER BY created_at DESC
  `;

  let total: number | undefined;
  let page = 1;
  let pageSize = 30;
  let queryParams = [...params];

  if (pagination) {
    page = Math.max(1, pagination.page);
    const requestedSize = Number(pagination.page_size);
    pageSize =
      Number.isFinite(requestedSize) && requestedSize >= 1 && requestedSize <= 100
        ? Math.floor(requestedSize)
        : 20;
    const summarySql = `
      SELECT
        COUNT(DISTINCT r.id)::bigint AS total_registrations,
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.payment_status = 'paid'
            AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
        )::bigint AS confirmed_payments,
        COUNT(DISTINCT r.id) FILTER (WHERE r.payment_status = 'pending')::bigint AS pending_payments,
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.payment_status = 'refunded' OR r.status = 'refunded'
        )::bigint AS refunds
      ${REGISTRATIONS_LIST_JOINS}
      ${whereSql}
    `;
    const summaryRes = await query(summarySql, params);
    total = parseInt(String(summaryRes.rows[0]?.total_registrations ?? '0'), 10) || 0;
    const summary: RegistrationListSummary = {
      total_registrations: total,
      confirmed_payments:
        parseInt(String(summaryRes.rows[0]?.confirmed_payments ?? '0'), 10) || 0,
      pending_payments:
        parseInt(String(summaryRes.rows[0]?.pending_payments ?? '0'), 10) || 0,
      refunds: parseInt(String(summaryRes.rows[0]?.refunds ?? '0'), 10) || 0,
    };

    const { conditions: segConditions, params: segParams } = buildRegistrationListWhereClause(
      stripSegmentFilters(filters)
    );
    const segWhereSql = segConditions.length > 0 ? ' WHERE ' + segConditions.join(' AND ') : '';
    const segmentSql = `
      SELECT
        COUNT(DISTINCT r.id)::bigint AS total,
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.payment_status = 'paid'
            AND NOT (r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL)
        )::bigint AS paid,
        COUNT(DISTINCT r.id) FILTER (WHERE r.payment_status = 'pending')::bigint AS pending,
        COUNT(DISTINCT r.id) FILTER (WHERE r.payment_status = 'partially_paid')::bigint AS partially_paid,
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.payment_method = 'free_bonus' OR r.payment_status = 'convidado'
        )::bigint AS courtesy,
        COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'cancelled')::bigint AS cancelled,
        COUNT(DISTINCT r.id) FILTER (
          WHERE r.payment_status = 'refunded' OR r.status = 'refunded'
        )::bigint AS refunded,
        COUNT(DISTINCT r.id) FILTER (WHERE r.status = 'transferred')::bigint AS transferred
      ${REGISTRATIONS_LIST_JOINS}
      ${segWhereSql}
    `;
    const segmentRes = await query(segmentSql, segParams);
    const segRow = segmentRes.rows[0] || {};
    const segment_totals: RegistrationSegmentTotals = {
      total: parseInt(String(segRow.total ?? '0'), 10) || 0,
      paid: parseInt(String(segRow.paid ?? '0'), 10) || 0,
      pending: parseInt(String(segRow.pending ?? '0'), 10) || 0,
      partially_paid: parseInt(String(segRow.partially_paid ?? '0'), 10) || 0,
      courtesy: parseInt(String(segRow.courtesy ?? '0'), 10) || 0,
      cancelled: parseInt(String(segRow.cancelled ?? '0'), 10) || 0,
      refunded: parseInt(String(segRow.refunded ?? '0'), 10) || 0,
      transferred: parseInt(String(segRow.transferred ?? '0'), 10) || 0,
    };

    const offset = (page - 1) * pageSize;
    queryText += ` LIMIT $${queryParams.length + 1} OFFSET $${queryParams.length + 2}`;
    queryParams = [...queryParams, pageSize, offset];

    const result = await query(queryText, queryParams);
    const mapped = await mapRegistrationRows(result.rows, filters);
    const total_pages = total === 0 ? 0 : Math.ceil(total / pageSize);
    return {
      items: mapped,
      page,
      page_size: pageSize,
      total,
      total_pages,
      summary,
      segment_totals,
    };
  }

  const result = await query(queryText, queryParams);

  const mapped = await mapRegistrationRows(result.rows, filters);

  return mapped;
}

// Get registration by ID
export const getRegistrationById = async (registrationId: string, viewerId?: string) => {
  const result = await query(
    `SELECT 
      r.*,
      e.title as event_title,
      e.event_date,
      e.banner_url as event_banner_url,
      e.location,
      e.city,
      e.state,
      e.transfers_enabled as event_transfers_enabled,
      e.transfer_until as event_transfer_until,
      c.name as category_name,
      c.category_type as category_type,
      c.gender as category_gender,
      c.min_age as category_min_age,
      -- Modalidades associadas à categoria
      COALESCE(
        ARRAY_AGG(DISTINCT m.id) FILTER (WHERE m.id IS NOT NULL),
        ARRAY[]::UUID[]
      ) as modality_ids,
      COALESCE(
        ARRAY_AGG(DISTINCT m.name) FILTER (WHERE m.name IS NOT NULL),
        ARRAY[]::TEXT[]
      ) as modality_names,
      (SELECT m_sel.name FROM modalities m_sel WHERE m_sel.id = r.modality_id) as modality_name,
      p.full_name as runner_name,
      p.cpf as runner_cpf,
      p.phone as runner_phone,
      p.birth_date as runner_birth_date,
      u.email as runner_email,
      ek.name as kit_name,
      -- Informações do cupom (se houver)
      cp.code as coupon_code,
      cp.name as coupon_name,
      cp.type as coupon_type,
      cp.discount_value as coupon_discount_value,
      cp.leader_id as coupon_leader_id,
      -- Informações do líder (se o cupom pertence a um líder)
      gl.id as leader_id,
      gl.referral_code as leader_referral_code,
      lp.full_name as leader_name,
      -- Se a inscrição foi transferida:
      -- - Se o viewer é o novo titular (runner_id), mostrar como 'confirmed'
      -- - Se o viewer é o antigo titular (registered_by), mostrar como 'transferred'
      -- - Caso contrário, manter o status original
      CASE 
        WHEN r.status = 'transferred' AND r.transferred_to_registration_id IS NOT NULL THEN r.status
        WHEN r.status = 'transferred' AND r.runner_id != r.registered_by THEN
          CASE 
            WHEN $2::uuid IS NOT NULL AND r.runner_id = $2::uuid THEN 'confirmed'
            WHEN $2::uuid IS NOT NULL AND r.registered_by = $2::uuid THEN 'transferred'
            ELSE r.status
          END
        ELSE r.status
      END as display_status,
      (SELECT li.runner_chooses_category_modality_kit FROM leader_invitations li WHERE li.bonus_registration_id = r.id AND li.runner_id = r.runner_id LIMIT 1) as invitation_runner_chooses_category_modality_kit
    FROM registrations r
    LEFT JOIN events e ON r.event_id = e.id
    LEFT JOIN categories c ON r.category_id = c.id
    LEFT JOIN category_modalities cm ON c.id = cm.category_id
    LEFT JOIN modalities m ON cm.modality_id = m.id
    LEFT JOIN profiles p ON r.runner_id = p.id
    LEFT JOIN users u ON p.id = u.id
    LEFT JOIN event_kits ek ON r.kit_id = ek.id
    LEFT JOIN coupons cp ON r.coupon_code = cp.code
    LEFT JOIN group_leaders gl ON cp.leader_id = gl.id
    LEFT JOIN profiles lp ON gl.user_id = lp.id
    WHERE r.id = $1
    GROUP BY r.id, e.id, c.id, p.id, u.id, ek.id, cp.id, gl.id, lp.id`,
    [registrationId, viewerId || null]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Import getFileUrl, payment helpers and system settings (taxa de atualização)
  const { getFileUrl } = await import('../middleware/upload.js');
  const { getPendingDifferenceAmountForRegistration, getTotalPaidForRegistration } = await import('./asaasService.js');
  const { getSystemSettings } = await import('./systemSettingsService.js');

  const row = result.rows[0];
  const [pendingDifferenceAmount, amountPaid, settings, customFieldValuesMap] = await Promise.all([
    getPendingDifferenceAmountForRegistration(registrationId),
    getTotalPaidForRegistration(registrationId),
    getSystemSettings(),
    getRegistrationCustomFieldValuesMap([registrationId]),
  ]);
  // Fallback: inscrições antigas sem modality_id mostram a primeira modalidade da categoria
  const modalityName = row.modality_name || (row.modality_names && row.modality_names[0]) || null;
  let finalPaymentStatus = row.payment_status;
  if (
    row.status === 'transferred' &&
    row.runner_id !== row.registered_by &&
    !row.transferred_to_registration_id &&
    viewerId
  ) {
    if (row.runner_id === viewerId) {
      finalPaymentStatus = 'transferred';
    } else if (row.registered_by === viewerId) {
      finalPaymentStatus = 'paid';
    }
  }
  return {
    ...row,
    modality_name: modalityName,
    status: row.display_status || row.status,
    payment_status: finalPaymentStatus,
    event_banner_url: row.event_banner_url ? getFileUrl(row.event_banner_url) : null,
    pending_difference_amount: pendingDifferenceAmount,
    has_pending_difference: pendingDifferenceAmount > 0.005,
    amount_paid: amountPaid,
    registration_edit_fee: settings.registration_edit_fee ?? 0,
    custom_field_values: customFieldValuesMap.get(registrationId) ?? {},
  };
};

// Create registration
export const createRegistration = async (data: CreateRegistrationData) => {
  // Validate category and runner eligibility
  const { getCategoryById } = await import('./categoriesService.js');
  const category = await getCategoryById(data.category_id);
  
  if (!category) {
    throw new Error('Categoria não encontrada');
  }

  const isInviteSlot = data.payment_method === 'free_bonus';
  // Convites (free_bonus) não exigem validação de perfil/idade/gênero do líder
  if (!isInviteSlot) {
    const runnerProfile = await query(
      `SELECT id, birth_date, gender FROM profiles WHERE id = $1`,
      [data.runner_id]
    );

    if (runnerProfile.rows.length === 0) {
      throw new Error('Perfil do corredor não encontrado');
    }

    const runner = runnerProfile.rows[0];

    // Validate age (if category has min_age or max_age requirement)
    const birthDate = new Date(runner.birth_date);
    const today = new Date();
    const age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    const dayDiff = today.getDate() - birthDate.getDate();
    
    const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
    
    // Validate min_age
    if (category.min_age !== null && category.min_age > 0) {
      if (actualAge < category.min_age) {
        throw new Error(`Idade mínima para esta categoria é ${category.min_age} anos. Você tem ${actualAge} anos.`);
      }
    }
    
    // Validate max_age
    if (category.max_age !== null && category.max_age > 0) {
      if (actualAge > category.max_age) {
        throw new Error(`Idade máxima para esta categoria é ${category.max_age} anos. Você tem ${actualAge} anos.`);
      }
    }

    // Validate gender (if category has gender restriction)
    if (category.gender !== 'ambos') {
      const runnerGender = runner.gender?.toLowerCase();
      const categoryGender = category.gender.toLowerCase();
      
      // Map common gender values
      const genderMap: { [key: string]: string } = {
        'm': 'masculino',
        'masculino': 'masculino',
        'f': 'feminino',
        'feminino': 'feminino',
        'o': 'ambos',
        'outro': 'ambos',
      };
      
      const normalizedRunnerGender = genderMap[runnerGender || ''] || 'ambos';
      
      if (normalizedRunnerGender !== categoryGender && normalizedRunnerGender !== 'ambos') {
        throw new Error(`Esta categoria é exclusiva para ${categoryGender === 'masculino' ? 'homens' : 'mulheres'}.`);
      }
    }
  }

  // Validate modality_id when provided: must be linked to category and belong to event
  if (data.modality_id) {
    const modCheck = await query(
      `SELECT 1 FROM modalities m
       INNER JOIN category_modalities cm ON cm.modality_id = m.id AND cm.category_id = $2
       WHERE m.id = $1 AND m.event_id = $3`,
      [data.modality_id, data.category_id, data.event_id]
    );
    if (modCheck.rows.length === 0) {
      throw new Error('Modalidade inválida ou não pertence à categoria selecionada.');
    }
  }

  // Verificar se o corredor já tem uma inscrição ativa neste evento
  // Exceção: convites (free_bonus) podem ser criados mesmo se o líder já tiver inscrição (são vagas para ele distribuir)
  if (!isInviteSlot) {
    const existingRegistration = await query(
      `SELECT id, status, payment_status FROM registrations 
       WHERE event_id = $1 AND runner_id = $2 AND status != 'cancelled'
       AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)`,
      [data.event_id, data.runner_id]
    );

    if (existingRegistration.rows.length > 0) {
      throw new Error('Você já possui uma inscrição ativa neste evento. Cada corredor pode se inscrever apenas uma vez por evento.');
    }
  }

  // Check max_participants if set (convites free_bonus não contam no limite)
  if (!isInviteSlot && category.max_participants !== null && category.max_participants > 0) {
    const currentRegistrations = await query(
      `SELECT COUNT(*) as count FROM registrations 
       WHERE category_id = $1 AND status != 'cancelled'
       AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)`,
      [data.category_id]
    );
    
    const count = parseInt(currentRegistrations.rows[0].count);
    if (count >= category.max_participants) {
      throw new Error(`Esta categoria atingiu o limite máximo de ${category.max_participants} participantes.`);
    }
  }

  /** Modo estrito (STRICT_KIT_SELECTIONS): exige payload completo antes de criar a linha da inscrição. */
  await validateCreateRegistrationKitSelectionsStrict(data);

  // Generate confirmation code
  const confirmationCode = `REG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

  // Validate and apply coupon if provided
  if (data.coupon_code) {
    try {
      const { getEventById } = await import('./eventsService.js');
      const { validateCoupon, incrementCouponUsage } = await import('./couponsService.js');
      
      const event = await getEventById(data.event_id);
      if (event) {
        const validation = await validateCoupon(
          data.coupon_code, 
          event.organizer_id, 
          data.event_id
        );
        
        if (!validation.valid || !validation.coupon) {
          throw new Error(validation.error || 'Cupom inválido');
        }
        
        // Increment coupon usage
        await incrementCouponUsage(validation.coupon.id);
        console.log(`✅ Cupom ${data.coupon_code} aplicado e uso incrementado`);
      }
    } catch (error: any) {
      // Log error but don't fail registration if coupon validation fails
      console.error('⚠️ Erro ao validar/aplicar cupom (não bloqueia inscrição):', error.message);
      // Remove coupon_code if validation failed
      data.coupon_code = undefined;
    }
  }

  console.log('📝 Criando inscrição com dados:', {
    event_id: data.event_id,
    runner_id: data.runner_id,
    coupon_code: data.coupon_code,
    total_amount: data.total_amount,
  });

  // Set payment_status and status
  // If status/payment_status are explicitly provided (e.g., when organizer creates registration), use them
  // Otherwise, use default logic: confirmed for free_bonus, pending otherwise
  const paymentStatus = data.payment_status || (data.payment_method === 'free_bonus' ? 'convidado' : 'pending');
  const registrationStatus = data.status || (data.payment_method === 'free_bonus' ? 'confirmed' : 'pending');

  const platformFeeAmount = data.platform_fee_amount != null ? Number(data.platform_fee_amount) : 0;

  const result = await query(
    `INSERT INTO registrations (
      event_id, runner_id, registered_by, category_id, kit_id, modality_id,
      payment_method, total_amount, platform_fee_amount, registration_edit_fee_amount,
      confirmation_code, status, payment_status, coupon_code
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 0, $10, $11, $12, $13)
    RETURNING *`,
    [
      data.event_id,
      data.runner_id,
      data.registered_by,
      data.category_id,
      data.kit_id || null,
      data.modality_id ?? null,
      data.payment_method || null,
      data.total_amount,
      platformFeeAmount,
      confirmationCode,
      registrationStatus,
      paymentStatus,
      data.coupon_code || null,
    ]
  );

  console.log('✅ Inscrição criada:', {
    id: result.rows[0].id,
    coupon_code: result.rows[0].coupon_code,
  });

  const registration = result.rows[0];

  // Save product and variant selections if provided
  if (data.product_selections && data.product_selections.length > 0) {
    try {
      // Validate stock (estoque restante considera inscrições anteriores e atuais)
      for (const selection of data.product_selections) {
        const variantIdToCheck = selection.variant_id;
        if (variantIdToCheck) {
          const remaining = await getVariantRemainingStock(variantIdToCheck, data.event_id);
          if (remaining !== null && remaining <= 0) {
            throw new Error('Estoque desta variante chegou a zero; não é possível selecioná-la.');
          }
        }
      }

      for (const selection of data.product_selections) {
        // Priority 1: If attribute_selections is provided directly, use it (most reliable)
        if (selection.attribute_selections && Object.keys(selection.attribute_selections).length > 0) {
          // If attribute_selections is provided directly (for manual registration or when sent from frontend)
          for (const [attributeName, attributeValue] of Object.entries(selection.attribute_selections)) {
            await query(
              `INSERT INTO registration_product_selections 
               (registration_id, product_id, variant_id, attribute_name, attribute_value)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                registration.id,
                selection.product_id,
                selection.variant_id || null,
                attributeName,
                attributeValue,
              ]
            );
          }
        } else if (selection.variant_id) {
          // Priority 2: If variant_id is provided but no attribute_selections, get variant details to extract attributes
          const variantResult = await query(
            `SELECT name, product_id FROM product_variants WHERE id = $1`,
            [selection.variant_id]
          );
          
          if (variantResult.rows.length > 0) {
            const variant = variantResult.rows[0];
            let inserted = false;
            // Get product variant_attributes to parse variant name
            const productResult = await query(
              `SELECT variant_attributes FROM kit_products WHERE id = $1`,
              [selection.product_id]
            );
            
            if (productResult.rows.length > 0) {
              const variantAttributes = productResult.rows[0].variant_attributes as string[] | null;
              
              if (variantAttributes && variantAttributes.length > 0) {
                // Parse variant name (format: "Value1 - Value2 - ...")
                const variantValues = variant.name.split(' - ').map((v: string) => v.trim());
                
                // Save each attribute selection
                for (let i = 0; i < variantAttributes.length && i < variantValues.length; i++) {
                  await query(
                    `INSERT INTO registration_product_selections 
                     (registration_id, product_id, variant_id, attribute_name, attribute_value)
                     VALUES ($1, $2, $3, $4, $5)`,
                    [
                      registration.id,
                      selection.product_id,
                      selection.variant_id,
                      variantAttributes[i],
                      variantValues[i],
                    ]
                  );
                  inserted = true;
                }
              }
            }
            // Fallback: sempre persistir variant_id para contagem de estoque (attribute_name/attribute_value NOT NULL)
            if (!inserted) {
              await query(
                `INSERT INTO registration_product_selections 
                 (registration_id, product_id, variant_id, attribute_name, attribute_value)
                 VALUES ($1, $2, $3, 'Variante', $4)`,
                [registration.id, selection.product_id, selection.variant_id, variant.name || selection.variant_id]
              );
            }
          }
        }
      }
      console.log(`✅ Seleções de produtos/variantes salvas para inscrição ${registration.id}`);
    } catch (error: any) {
      if (isStrictKitSelectionsEnabled()) {
        const msg = error?.message || String(error);
        console.error(
          '⚠️ Erro ao salvar seleções de produtos/variantes (modo estrito):',
          msg
        );
        const isInviteSlot = data.payment_method === 'free_bonus';
        if (!isInviteSlot) {
          try {
            await query('DELETE FROM registrations WHERE id = $1', [registration.id]);
          } catch (delErr: any) {
            console.error(
              '❌ Falha ao remover inscrição após erro nas seleções:',
              delErr?.message || delErr
            );
          }
        } else {
          console.error(
            '❌ Modo estrito: falha ao persistir seleções em inscrição convite/free_bonus — possível inconsistência:',
            registration.id
          );
        }
        throw new Error(
          msg.startsWith('Estoque')
            ? msg
            : 'Não foi possível registrar as escolhas do kit. Tente novamente ou escolha outra variante.'
        );
      }
      console.error(
        '⚠️ Erro ao salvar seleções de produtos/variantes (não bloqueia inscrição):',
        error.message
      );
    }
  }

  if (
    isStrictKitSelectionsEnabled() &&
    data.kit_id &&
    (await kitRequiresPersistedProductSelections(data.kit_id))
  ) {
    const persistedCount = await countRegistrationProductSelectionRows(registration.id);
    if (persistedCount === 0) {
      const isInviteSlot = data.payment_method === 'free_bonus';
      if (!isInviteSlot) {
        try {
          await query('DELETE FROM registrations WHERE id = $1', [registration.id]);
        } catch (delErr: any) {
          console.error(
            '❌ Falha ao remover inscrição sem seleções persistidas:',
            delErr?.message || delErr
          );
        }
      } else {
        console.error(
          '❌ Modo estrito: inscrição convite sem linhas em registration_product_selections:',
          registration.id
        );
      }
      throw new Error(
        'As escolhas do kit não foram gravadas corretamente. Verifique as variantes e tente novamente.'
      );
    }
  }

  // Etapa 3: persist custom field values (campos personalizados da categoria)
  if (data.custom_field_values && Object.keys(data.custom_field_values).length > 0) {
    const { getByCategoryId } = await import('./categoryCustomFieldsService.js');
    const categoryFields = await getByCategoryId(data.category_id);
    const validFieldIds = new Set(categoryFields.map((f) => f.id));
    for (const [fieldId, value] of Object.entries(data.custom_field_values)) {
      if (!validFieldIds.has(fieldId)) {
        throw new Error(`Campo personalizado inválido ou não pertence à categoria: ${fieldId}`);
      }
      const valueStr = value != null ? String(value).trim() : '';
      await query(
        `INSERT INTO registration_custom_field_values (registration_id, category_custom_field_id, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (registration_id, category_custom_field_id) DO UPDATE SET value = $3, updated_at = NOW()`,
        [registration.id, fieldId, valueStr || null]
      );
    }
    console.log(`✅ Campos personalizados salvos para inscrição ${registration.id}`);
  }

  // Check if user has a referral OR if coupon belongs to a leader, and create commission if applicable
  // Only create commission if payment is already paid (free registrations or instant payments)
  // For pending payments, commission will be created when payment is confirmed
  try {
    const { getUserReferral } = await import('./referralsService.js');
    const { getCouponByCodeOnly } = await import('./couponsService.js');
    const { createCommission } = await import('./commissionsService.js');
    
    // Only create commission if payment is already paid
    if (registration.payment_status === 'paid') {
      let leaderId: string | null = null;
      
      // Priority: check coupon first (coupon determines commission type)
      if (data.coupon_code) {
        try {
          const coupon = await getCouponByCodeOnly(data.coupon_code);
          if (coupon && coupon.leader_id) {
            leaderId = coupon.leader_id;
            console.log(`✅ Cupom ${data.coupon_code} pertence ao líder ${leaderId}`);
          }
        } catch (couponError: any) {
          console.log(`ℹ️ Erro ao buscar cupom ${data.coupon_code}:`, couponError.message);
        }
      }
      
      // If no coupon leader, check if user has a referral
      if (!leaderId) {
        const userReferral = await getUserReferral(data.runner_id);
        if (userReferral) {
          leaderId = userReferral.leader_id;
        }
      }
      
      if (leaderId) {
        // User was referred by a leader or used leader's coupon, create commission (only if event commission is configured)
        try {
          await createCommission({
            leader_id: leaderId,
            registration_id: registration.id,
            referred_user_id: data.runner_id,
            event_id: data.event_id,
            registration_amount: data.total_amount,
          });
          
          console.log(`✅ Comissão criada para líder ${leaderId} na inscrição ${registration.id}`);
        } catch (commissionError: any) {
          // If no commission is configured (invitation type only) or amount is 0, trigger invitation bonus check
          if (commissionError.message.includes('No commission configured') || 
              commissionError.message.includes('invitation type only') ||
              commissionError.message.includes('must be greater than 0')) {
            console.log(`ℹ️ Disparando verificação de bônus de convite (cupom/referência)...`);
            try {
              const { executeInvitationBonusDomainCommand } = await import('./invitationBonusDomainOrchestrator.js');
              await executeInvitationBonusDomainCommand({
                type: 'payment_confirmed_with_coupon',
                mode: 'automatico',
                source: 'registrations_service',
                correlation_id: registration.id,
                leader_id: leaderId,
                event_id: data.event_id,
                coupon_code: data.coupon_code || null,
                detail: 'registrations_service_commission_fallback',
              });
            } catch (bonusError: any) {
              console.error('❌ Erro ao verificar bônus de convite:', bonusError.message);
            }
          } else {
            console.error('❌ Erro ao criar comissão:', commissionError.message);
          }
        }
      }
    } else {
      // Payment is pending - commission will be created when payment is confirmed
      console.log(`ℹ️ Pagamento pendente - comissão será criada quando o pagamento for confirmado`);
    }
  } catch (error: any) {
    // Log error but don't fail registration if commission creation fails
    console.error('❌ Erro ao verificar referência/cupom para inscrição:', error.message);
  }

  return registration;
};

// Update registration
export const updateRegistration = async (
  registrationId: string,
  data: UpdateRegistrationData,
  dbClient?: PoolClient
) => {
  const run = (text: string, params?: unknown[]) =>
    dbClient ? dbClient.query(text, params as any) : query(text, params as any);

  const customFieldValues = data.custom_field_values;
  const updatePayload = { ...data };
  delete (updatePayload as any).custom_field_values;

  let result: { rows: any[] };
  if (Object.keys(updatePayload).length > 0) {
    const fields: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;
    Object.entries(updatePayload).forEach(([key, value]) => {
      if (value !== undefined) {
        fields.push(`${key} = $${paramIndex}`);
        values.push(value);
        paramIndex++;
      }
    });
    if (fields.length === 0) {
      throw new Error('No fields to update');
    }
    values.push(registrationId);
    result = await run(
      `UPDATE registrations 
       SET ${fields.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING *`,
      values
    );
  } else {
    const current = await run(`SELECT * FROM registrations WHERE id = $1`, [registrationId]);
    if (current.rows.length === 0) return null;
    result = current;
  }

  if (result.rows.length === 0) {
    return null;
  }

  const updated = result.rows[0];
  const effectiveCategoryId = updated.category_id;

  // Etapa 3: sync custom field values when provided
  if (customFieldValues !== undefined) {
    const { getByCategoryId } = await import('./categoryCustomFieldsService.js');
    const categoryFields = await getByCategoryId(effectiveCategoryId);
    const validFieldIds = new Set(categoryFields.map((f) => f.id));
    await run(`DELETE FROM registration_custom_field_values WHERE registration_id = $1`, [registrationId]);
    for (const [fieldId, value] of Object.entries(customFieldValues)) {
      if (!validFieldIds.has(fieldId)) {
        throw new Error(`Campo personalizado inválido ou não pertence à categoria: ${fieldId}`);
      }
      const valueStr = value != null ? String(value).trim() : '';
      await run(
        `INSERT INTO registration_custom_field_values (registration_id, category_custom_field_id, value)
         VALUES ($1, $2, $3)`,
        [registrationId, fieldId, valueStr || null]
      );
    }
  }

  return updated;
};

// Find user by CPF
export const findUserByCpf = async (cpf: string) => {
  // Remove formatting from CPF
  const cleanCpf = cpf.replace(/[^0-9]/g, '');
  
  const result = await query(
    'SELECT id, full_name, cpf FROM profiles WHERE cpf = $1',
    [cleanCpf]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// Find user by email
export const findUserByEmail = async (email: string) => {
  const result = await query(
    `SELECT p.id, p.full_name, p.cpf 
     FROM profiles p
     JOIN users u ON p.id = u.id
     WHERE u.email = $1`,
    [email.toLowerCase().trim()]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// Find user by CPF or email (tries CPF first, then email)
export const findUserByCpfOrEmail = async (cpf?: string, email?: string) => {
  if (cpf && cpf.trim()) {
    const userByCpf = await findUserByCpf(cpf);
    if (userByCpf) {
      return userByCpf;
    }
  }
  
  if (email && email.trim()) {
    const userByEmail = await findUserByEmail(email);
    if (userByEmail) {
      return userByEmail;
    }
  }
  
  return null;
};

export interface RunnerDataByOrganizer {
  full_name: string;
  birth_date: string;
  city: string;
  gender: string;
  team?: string;
  email?: string;
  phone?: string;
}

/**
 * Cria atleta (user + profile + role runner) pelo organizador quando o CPF não está cadastrado.
 * Email: usa runner_data.email se informado e único; senão usa email temporário único.
 * Retorna o id do usuário criado (runner_id).
 */
export const createRunnerByOrganizer = async (
  cpf: string,
  runner_data: RunnerDataByOrganizer
): Promise<{ id: string }> => {
  const cleanCpf = cpf.replace(/[^0-9]/g, '');
  if (!isValidCpfDigits(cleanCpf)) {
    throw new Error('CPF inválido');
  }

  const existing = await findUserByCpf(cleanCpf);
  if (existing) {
    throw new Error('Já existe cadastro para este CPF');
  }

  const fullName = normalizePersonName(runner_data.full_name);
  assertValidFullName(fullName);

  const normalizedCity = runner_data.city
    ? normalizePlaceName(runner_data.city)
    : null;
  const normalizedPhone = runner_data.phone
    ? normalizePhoneDigits(runner_data.phone)
    : null;

  if (normalizedPhone) {
    assertValidPhone(normalizedPhone);
  }
  if (normalizedCity) {
    assertValidCity(normalizedCity, { source: 'registrations.createRunnerByOrganizer' });
  }
  if (runner_data.gender?.trim()) {
    assertValidGender(runner_data.gender, { source: 'registrations.createRunnerByOrganizer' });
  }

  let email: string;
  const rawEmail = runner_data.email?.trim();
  if (rawEmail) {
    const byEmail = await findUserByEmail(rawEmail);
    if (byEmail) {
      email = `org-runner-${cleanCpf}-${Date.now()}@temp.cronoteam`;
    } else {
      email = rawEmail.toLowerCase();
    }
  } else {
    email = `org-runner-${cleanCpf}-${Date.now()}@temp.cronoteam`;
  }

  const randomPassword = await hashPassword(
    randomBytes(32).toString('hex')
  );
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const userResult = await client.query(
      `INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id`,
      [email, randomPassword]
    );
    const userId = userResult.rows[0].id;

    await client.query(
      `INSERT INTO profiles (id, full_name, cpf, birth_date, city, gender, team, phone)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        fullName,
        cleanCpf,
        runner_data.birth_date || null,
        normalizedCity,
        runner_data.gender ? normalizeGender(runner_data.gender) || null : null,
        runner_data.team?.trim() || null,
        normalizedPhone,
      ]
    );

    await client.query(
      `INSERT INTO user_roles (user_id, role) VALUES ($1, 'runner')`,
      [userId]
    );

    await client.query('COMMIT');
    return { id: userId };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
};

/**
 * Get registrations with missing attribute selections for a user
 * Returns registrations that have products with variants but missing attribute selections
 */
export const getRegistrationsWithMissingAttributes = async (userId: string) => {
  const verboseMissing =
    process.env.LOG_MISSING_ATTR_VERBOSE === 'true' || process.env.NODE_ENV !== 'production';
  const log = (...args: unknown[]) => {
    if (verboseMissing) console.log(...args);
  };

  log(`🔍 getRegistrationsWithMissingAttributes - Buscando para userId: ${userId}`);

  // Get all active registrations for the user
  const registrations = await getRegistrations({
    runner_id: userId,
    status: 'confirmed',
  });

  log(`🔍 getRegistrationsWithMissingAttributes - Inscrições confirmadas encontradas: ${registrations.length}`);

  // Also get pending registrations
  const pendingRegistrations = await getRegistrations({
    runner_id: userId,
    status: 'pending',
  });

  log(`🔍 getRegistrationsWithMissingAttributes - Inscrições pendentes encontradas: ${pendingRegistrations.length}`);

  // Combine and filter unique registrations
  const allRegistrations = [...registrations, ...pendingRegistrations].filter(
    (reg, index, self) => index === self.findIndex((r) => r.id === reg.id)
  );

  log(`🔍 getRegistrationsWithMissingAttributes - Total de inscrições únicas: ${allRegistrations.length}`);

  const result = [];

  for (const registration of allRegistrations) {
    log(`🔍 Processando inscrição ${registration.id} - Status: ${registration.status}, Kit: ${registration.kit_id}`);

    // Skip if no kit selected
    if (!registration.kit_id) {
      log(`⚠️ Inscrição ${registration.id} não tem kit, pulando`);
      continue;
    }

    // Get all products for this kit that have variants (variant_attributes is not null)
    const productsWithVariants = await query(
      `SELECT 
        p.id as product_id,
        p.name as product_name,
        p.variant_attributes,
        p.type
      FROM kit_products p
      WHERE p.kit_id = $1
        AND p.type = 'variable'
        AND p.variant_attributes IS NOT NULL
        AND jsonb_typeof(p.variant_attributes) = 'array'
        AND jsonb_array_length(p.variant_attributes) > 0`,
      [registration.kit_id]
    );

    log(`🔍 Inscrição ${registration.id} - Produtos com variações encontrados: ${productsWithVariants.rows.length}`);

    if (productsWithVariants.rows.length === 0) {
      // Debug: verificar todos os produtos do kit
      const allProducts = await query(
        `SELECT id, name, type, variant_attributes FROM kit_products WHERE kit_id = $1`,
        [registration.kit_id]
      );
      log(`🔍 Inscrição ${registration.id} - Todos os produtos do kit:`, allProducts.rows.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        variant_attributes: p.variant_attributes,
        has_variants: p.variant_attributes && Array.isArray(p.variant_attributes) && p.variant_attributes.length > 0
      })));
      continue; // No products with variants, skip
    }

    // For each product with variants, check if all required attributes are selected
    const productsWithMissingAttributes = [];

    for (const product of productsWithVariants.rows) {
      const variantAttributes = product.variant_attributes as string[];
      log(`🔍 Produto ${product.product_name} (${product.product_id}) - Atributos necessários:`, variantAttributes);

      // Get existing selections for this product in this registration
      const existingSelections = await query(
        `SELECT DISTINCT attribute_name
        FROM registration_product_selections
        WHERE registration_id = $1
          AND product_id = $2`,
        [registration.id, product.product_id]
      );

      log(`🔍 Produto ${product.product_name} - Seleções existentes:`, existingSelections.rows.map(r => r.attribute_name));

      const selectedAttributeNames = new Set(
        existingSelections.rows.map((row) => row.attribute_name)
      );

      // Check if all required attributes are selected
      const missingAttributes = variantAttributes.filter(
        (attrName) => !selectedAttributeNames.has(attrName)
      );

      log(`🔍 Produto ${product.product_name} - Atributos faltando:`, missingAttributes);

      if (missingAttributes.length > 0) {
        // Get available variants for this product
        const availableVariants = await query(
          `SELECT 
            pv.id as variant_id,
            pv.name as variant_name,
            pv.price
          FROM product_variants pv
          WHERE pv.product_id = $1
          ORDER BY pv.name`,
          [product.product_id]
        );

        // Todas as variantes com flag in_stock para o frontend mostrar "Esgotada" nas esgotadas (cinza, desabilitado)
        const eventId = registration.event_id;
        const variantsWithAttributes = [];
        for (const variant of availableVariants.rows) {
          const remaining = await getVariantRemainingStock(
            variant.variant_id,
            eventId,
            registration.id
          );
          const inStock = remaining === null || remaining > 0;

          const variantValues = variant.variant_name.split(' - ').map((v: string) => v.trim());
          const attributeValues: Record<string, string> = {};
          variantAttributes.forEach((attrName: string, index: number) => {
            if (index < variantValues.length) {
              attributeValues[attrName] = variantValues[index];
            }
          });

          variantsWithAttributes.push({
            variant_id: variant.variant_id,
            variant_name: variant.variant_name,
            attribute_values: attributeValues,
            in_stock: inStock,
          });
        }

        productsWithMissingAttributes.push({
          product_id: product.product_id,
          product_name: product.product_name,
          variant_attributes: variantAttributes,
          available_variants: variantsWithAttributes,
        });
      }
    }

    // If there are products with missing attributes, add to result
    if (productsWithMissingAttributes.length > 0) {
      result.push({
        registration_id: registration.id,
        event_title: registration.event_title,
        event_date: registration.event_date,
        kit_id: registration.kit_id,
        kit_name: registration.kit_name,
        products_with_missing_attributes: productsWithMissingAttributes,
      });
    }
  }

  return result;
};

/**
 * Complete missing attribute selections for a registration
 * Saves attribute selections for products that have variants
 */
export const completeRegistrationAttributes = async (
  registrationId: string,
  userId: string,
  productSelections: Array<{
    product_id: string;
    variant_id?: string;
    attribute_selections: Record<string, string>; // { attributeName: attributeValue }
  }>
) => {
  // Validate input parameters
  if (!registrationId || typeof registrationId !== 'string') {
    throw new Error('Registration ID is required');
  }

  if (!userId || typeof userId !== 'string') {
    throw new Error('User ID is required');
  }

  if (!productSelections || !Array.isArray(productSelections) || productSelections.length === 0) {
    throw new Error('At least one product selection is required');
  }

  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(registrationId)) {
    throw new Error('Invalid registration ID format');
  }

  if (!uuidRegex.test(userId)) {
    throw new Error('Invalid user ID format');
  }

  // Validate product IDs format
  for (const selection of productSelections) {
    if (!selection.product_id || !uuidRegex.test(selection.product_id)) {
      throw new Error(`Invalid product ID format: ${selection.product_id}`);
    }
    if (selection.variant_id && !uuidRegex.test(selection.variant_id)) {
      throw new Error(`Invalid variant ID format: ${selection.variant_id}`);
    }
  }

  // Get registration and validate ownership
  const registration = await getRegistrationById(registrationId);
  
  if (!registration) {
    throw new Error('Registration not found');
  }

  // Check if user is owner
  if (registration.runner_id !== userId && registration.registered_by !== userId) {
    throw new Error('You do not have permission to update this registration');
  }

  // Check if registration is active (not cancelled)
  if (registration.status === 'cancelled') {
    throw new Error('Cannot update attributes for cancelled registration');
  }

  // Validate that kit exists
  if (!registration.kit_id) {
    throw new Error('Registration does not have a kit');
  }

  // Get kit products to validate product_ids
  const kitProducts = await query(
    `SELECT id, name, variant_attributes, type
    FROM kit_products
    WHERE kit_id = $1`,
    [registration.kit_id]
  );

  const validProductIds = new Set(kitProducts.rows.map((p) => p.id));
  const productMap = new Map(kitProducts.rows.map((p) => [p.id, p]));

  // Validate all products belong to the kit
  for (const selection of productSelections) {
    if (!validProductIds.has(selection.product_id)) {
      throw new Error(`Product ${selection.product_id} does not belong to the kit of this registration`);
    }

    const product = productMap.get(selection.product_id);
    if (!product) continue;

    // If product has variant_attributes, validate all are provided
    if (product.variant_attributes && Array.isArray(product.variant_attributes) && product.variant_attributes.length > 0) {
      const requiredAttributes = product.variant_attributes as string[];
      const providedAttributes = Object.keys(selection.attribute_selections || {});

      // Check if all required attributes are provided
      const missingAttributes = requiredAttributes.filter(
        (attr) => !providedAttributes.includes(attr)
      );

      if (missingAttributes.length > 0) {
        throw new Error(
          `Missing required attributes for product ${product.name}: ${missingAttributes.join(', ')}`
        );
      }

      // Validate attribute values are valid (exist in available variants)
      const availableVariants = await query(
        `SELECT id, name FROM product_variants WHERE product_id = $1`,
        [selection.product_id]
      );

      // Get all valid attribute values from variants
      const validAttributeValues = new Map<string, Set<string>>();
      availableVariants.rows.forEach((variant) => {
        const variantValues = variant.name.split(' - ').map((v: string) => v.trim());
        requiredAttributes.forEach((attrName, index) => {
          if (index < variantValues.length) {
            if (!validAttributeValues.has(attrName)) {
              validAttributeValues.set(attrName, new Set());
            }
            validAttributeValues.get(attrName)!.add(variantValues[index]);
          }
        });
      });

      // Validate each provided attribute value
      for (const [attrName, attrValue] of Object.entries(selection.attribute_selections || {})) {
        if (!requiredAttributes.includes(attrName)) {
          throw new Error(`Attribute "${attrName}" is not required for product ${product.name}`);
        }

        const validValues = validAttributeValues.get(attrName);
        if (validValues && !validValues.has(attrValue)) {
          throw new Error(
            `Invalid value "${attrValue}" for attribute "${attrName}" in product ${product.name}. Valid values: ${Array.from(validValues).join(', ')}`
          );
        }
      }

      // Validate variant_id if provided and check remaining stock (inclui inscrições anteriores)
      if (selection.variant_id) {
        const variantResult = await query(
          `SELECT name, product_id FROM product_variants WHERE id = $1 AND product_id = $2`,
          [selection.variant_id, selection.product_id]
        );

        if (variantResult.rows.length === 0) {
          throw new Error(`Variant ${selection.variant_id} does not belong to product ${selection.product_id}`);
        }
        const remaining = await getVariantRemainingStock(
          selection.variant_id,
          registration.event_id,
          registrationId
        );
        if (remaining !== null && remaining <= 0) {
          throw new Error('Estoque desta variante chegou a zero; não é possível selecioná-la.');
        }
      }
    }
  }

  // Delete existing selections for these products (to allow updates)
  for (const selection of productSelections) {
    await query(
      `DELETE FROM registration_product_selections
       WHERE registration_id = $1 AND product_id = $2`,
      [registrationId, selection.product_id]
    );
  }

  // Resolver variant_id quando o frontend envia só attribute_selections (ex.: modal de atributos pendentes),
  // para que o INSERT use variant_id e o estoque seja contabilizado igual à inscrição normal.
  const productVariantAttrs = new Map<string, string[]>(
    kitProducts.rows
      .filter((p: any) => p.variant_attributes && Array.isArray(p.variant_attributes))
      .map((p: any) => [p.id, p.variant_attributes])
  );

  for (const selection of productSelections) {
    if (selection.attribute_selections && Object.keys(selection.attribute_selections).length > 0) {
      let variantIdToUse = selection.variant_id;
      if (!variantIdToUse) {
        const attrOrder = productVariantAttrs.get(selection.product_id);
        if (attrOrder && attrOrder.length > 0) {
          const variantsResult = await query(
            `SELECT id, name FROM product_variants WHERE product_id = $1`,
            [selection.product_id]
          );
          for (const row of variantsResult.rows) {
            const variantValues = (row.name as string).split(' - ').map((v: string) => v.trim());
            const matches = attrOrder.every(
              (attrName, index) => (selection.attribute_selections![attrName] ?? '').trim() === (variantValues[index] ?? '').trim()
            );
            if (matches) {
              variantIdToUse = row.id;
              break;
            }
          }
        }
      }

      // Validar estoque ao completar atributos (mesmo quando variant_id veio resolvido dos attribute_selections)
      if (variantIdToUse) {
        const remaining = await getVariantRemainingStock(
          variantIdToUse,
          registration.event_id,
          registrationId
        );
        if (remaining !== null && remaining <= 0) {
          throw new Error('Estoque desta variante chegou a zero; não é possível selecioná-la. Escolha outra opção.');
        }
      }

      for (const [attributeName, attributeValue] of Object.entries(selection.attribute_selections)) {
        await query(
          `INSERT INTO registration_product_selections 
           (registration_id, product_id, variant_id, attribute_name, attribute_value)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            registrationId,
            selection.product_id,
            variantIdToUse || null,
            attributeName,
            attributeValue,
          ]
        );
      }
    }
  }

  console.log(`✅ Seleções de atributos completadas para inscrição ${registrationId}`);

  return {
    success: true,
    message: 'Attribute selections saved successfully',
  };
};

/**
 * Remove attribute selections for a registration
 * This allows the runner to select attributes again
 * @param registrationId - ID of the registration
 * @param productIds - Optional array of product IDs to remove attributes from. If not provided, removes all.
 */
export const removeRegistrationAttributes = async (
  registrationId: string,
  productIds?: string[]
) => {
  // Validate registration ID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(registrationId)) {
    throw new Error('Invalid registration ID format');
  }

  // Get registration to validate it exists
  const registration = await getRegistrationById(registrationId);
  if (!registration) {
    throw new Error('Registration not found');
  }

  // Check if registration is cancelled
  if (registration.status === 'cancelled') {
    throw new Error('Cannot remove attributes for cancelled registration');
  }

  // Delete attribute selections (estoque é calculado por contagem; não é preciso devolver)
  if (productIds && productIds.length > 0) {
    for (const productId of productIds) {
      if (!uuidRegex.test(productId)) {
        throw new Error(`Invalid product ID format: ${productId}`);
      }
    }
    await query(
      `DELETE FROM registration_product_selections
       WHERE registration_id = $1 AND product_id = ANY($2::uuid[])`,
      [registrationId, productIds]
    );
  } else {
    await query(
      `DELETE FROM registration_product_selections
       WHERE registration_id = $1`,
      [registrationId]
    );
  }

  console.log(`✅ Atributos removidos da inscrição ${registrationId}${productIds ? ` para produtos: ${productIds.join(', ')}` : ' (todos os produtos)'}`);

  return {
    success: true,
    message: productIds && productIds.length > 0
      ? 'Attribute selections removed for specified products'
      : 'All attribute selections removed',
  };
};

/**
 * Complete invitation registration: runner chooses category, modality, kit and optional product_selections.
 * Only for registrations with payment_status = 'convidado' owned by the runner.
 */
export const completeInvitationRegistration = async (
  registrationId: string,
  userId: string,
  data: {
    category_id: string;
    modality_id?: string | null;
    kit_id?: string | null;
    product_selections?: Array<{
      product_id: string;
      variant_id?: string;
      attribute_selections?: Record<string, string>;
    }>;
    custom_field_values?: Record<string, string>;
  }
) => {
  const registration = await getRegistrationById(registrationId);
  if (!registration) {
    throw new Error('Inscrição não encontrada.');
  }
  if (registration.runner_id !== userId) {
    throw new Error('Você não tem permissão para completar esta inscrição.');
  }
  if (registration.payment_status !== 'convidado') {
    throw new Error('Esta inscrição não é um convite ou já foi completada.');
  }
  if (registration.status === 'cancelled') {
    throw new Error('Não é possível completar uma inscrição cancelada.');
  }

  const eventId = registration.event_id;
  const { category_id, modality_id, kit_id, product_selections, custom_field_values } = data;

  const catCheck = await query(
    'SELECT id FROM categories WHERE id = $1 AND event_id = $2',
    [category_id, eventId]
  );
  if (catCheck.rows.length === 0) {
    throw new Error('Categoria inválida ou não pertence a este evento.');
  }

  if (modality_id) {
    const modCheck = await query(
      `SELECT 1 FROM modalities m
       WHERE m.id = $1 AND m.event_id = $2
       AND EXISTS (SELECT 1 FROM category_modalities cm WHERE cm.modality_id = m.id AND cm.category_id = $3)`,
      [modality_id, eventId, category_id]
    );
    if (modCheck.rows.length === 0) {
      throw new Error('Modalidade inválida ou não está vinculada à categoria selecionada.');
    }
  }

  if (kit_id) {
    const { validateKitVisibleForPublicRegistration } = await import('./eventKitsService.js');
    await validateKitVisibleForPublicRegistration(kit_id, eventId);
    // Etapa 5: kit com produto variável exige seleção de variante
    const kitProductsRows = await query(
      'SELECT id, name, type FROM kit_products WHERE kit_id = $1',
      [kit_id]
    );
    const variableProducts = (kitProductsRows.rows as { id: string; name: string; type: string }[]).filter(
      (p) => p.type === 'variable'
    );
    if (variableProducts.length > 0) {
      const hasSelections = product_selections && product_selections.length > 0;
      if (!hasSelections) {
        throw new Error(
          'O kit selecionado possui produto(s) com variação (ex.: tamanho). Selecione a variante para cada um.'
        );
      }
      const selectedProductIds = new Set((product_selections || []).map((s) => s.product_id));
      const missing = variableProducts.filter((p) => !selectedProductIds.has(p.id));
      if (missing.length > 0) {
        throw new Error(`Selecione a variante para: ${missing.map((p) => p.name).join(', ')}.`);
      }
      for (const sel of product_selections || []) {
        const prod = variableProducts.find((p) => p.id === sel.product_id);
        if (prod && !sel.variant_id && (!sel.attribute_selections || Object.keys(sel.attribute_selections).length === 0)) {
          throw new Error(`Informe a variante (tamanho) para o produto "${prod.name}".`);
        }
      }
    }
  }

  await query(
    `UPDATE registrations 
     SET category_id = $1, modality_id = $2, kit_id = $3, updated_at = NOW()
     WHERE id = $4`,
    [category_id, modality_id ?? null, kit_id ?? null, registrationId]
  );

  if (product_selections && product_selections.length > 0) {
    if (!kit_id) {
      throw new Error('É necessário informar o kit para definir seleções de produtos/variantes.');
    }
    const kitProducts = await query(
      'SELECT id FROM kit_products WHERE kit_id = $1',
      [kit_id]
    );
    const allowedProductIds = new Set((kitProducts.rows as { id: string }[]).map((r) => r.id));
    for (const sel of product_selections) {
      if (!allowedProductIds.has(sel.product_id)) {
        throw new Error('Produto da seleção não pertence ao kit informado.');
      }
      if (sel.variant_id) {
        const remaining = await getVariantRemainingStock(sel.variant_id, eventId, registrationId);
        if (remaining !== null && remaining <= 0) {
          throw new Error('Estoque desta variante chegou a zero; não é possível selecioná-la.');
        }
      }
    }
    await query(
      'DELETE FROM registration_product_selections WHERE registration_id = $1',
      [registrationId]
    );
    for (const selection of product_selections) {
      if (selection.attribute_selections && Object.keys(selection.attribute_selections).length > 0) {
        for (const [attributeName, attributeValue] of Object.entries(selection.attribute_selections)) {
          await query(
            `INSERT INTO registration_product_selections 
             (registration_id, product_id, variant_id, attribute_name, attribute_value)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              registrationId,
              selection.product_id,
              selection.variant_id || null,
              attributeName,
              attributeValue,
            ]
          );
        }
      } else if (selection.variant_id) {
        const variantResult = await query(
          'SELECT name, product_id FROM product_variants WHERE id = $1',
          [selection.variant_id]
        );
        if (variantResult.rows.length > 0) {
          const variant = variantResult.rows[0] as { name: string; product_id: string };
          let inserted = false;
          const productResult = await query(
            'SELECT variant_attributes FROM kit_products WHERE id = $1',
            [selection.product_id]
          );
          if (productResult.rows.length > 0) {
            const variantAttributes = (productResult.rows[0] as { variant_attributes: string[] | null }).variant_attributes;
            if (variantAttributes && variantAttributes.length > 0) {
              const variantValues = variant.name.split(' - ').map((v: string) => v.trim());
              for (let i = 0; i < variantAttributes.length && i < variantValues.length; i++) {
                await query(
                  `INSERT INTO registration_product_selections 
                   (registration_id, product_id, variant_id, attribute_name, attribute_value)
                   VALUES ($1, $2, $3, $4, $5)`,
                  [
                    registrationId,
                    selection.product_id,
                    selection.variant_id,
                    variantAttributes[i],
                    variantValues[i],
                  ]
                );
                inserted = true;
              }
            }
          }
          // Fallback: sempre persistir variant_id para contagem de estoque
          if (!inserted) {
            await query(
              `INSERT INTO registration_product_selections 
               (registration_id, product_id, variant_id, attribute_name, attribute_value)
               VALUES ($1, $2, $3, 'Variante', $4)`,
              [registrationId, selection.product_id, selection.variant_id, variant.name || selection.variant_id]
            );
          }
        }
      }
    }
  }

  if (custom_field_values !== undefined && Object.keys(custom_field_values).length > 0) {
    const { getByCategoryId } = await import('./categoryCustomFieldsService.js');
    const categoryFields = await getByCategoryId(category_id);
    const validFieldIds = new Set(categoryFields.map((f) => f.id));
    await query(
      'DELETE FROM registration_custom_field_values WHERE registration_id = $1',
      [registrationId]
    );
    for (const [fieldId, value] of Object.entries(custom_field_values)) {
      if (!validFieldIds.has(fieldId)) continue;
      const valueStr = value != null ? String(value).trim() : '';
      await query(
        `INSERT INTO registration_custom_field_values (registration_id, category_custom_field_id, value)
         VALUES ($1, $2, $3)`,
        [registrationId, fieldId, valueStr || null]
      );
    }
  }

  return getRegistrationById(registrationId);
};

export type AdminRegistrationSplitTransferMeta = {
  adminUserId: string;
  reason?: string | null;
};

/**
 * Super admin (split): nova linha `registrations` para o recebedor; a original permanece com o mesmo
 * `runner_id`, `payment_status = paid`, `status = transferred` e `transferred_to_registration_id`.
 * Pagamentos e ajustes financeiros apontam para a nova inscrição (receita única na contagem ativa).
 */
export const performAdminRegistrationSplitTransfer = async (
  registrationId: string,
  newRunnerId: string,
  meta: AdminRegistrationSplitTransferMeta
): Promise<{ previousRegistrationId: string; newRegistrationId: string }> => {
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const lockRes = await client.query(`SELECT * FROM registrations WHERE id = $1 FOR UPDATE`, [registrationId]);
    if (lockRes.rows.length === 0) {
      throw new Error('Registration not found');
    }
    const reg = lockRes.rows[0] as Record<string, unknown>;

    if (reg.status === 'cancelled' || reg.status === 'refunded') {
      throw new Error('Esta inscrição não pode ser transferida (cancelada ou reembolsada).');
    }
    if (reg.status === 'transferred') {
      throw new Error('Inscrição já está marcada como transferida.');
    }
    if (reg.transferred_to_registration_id) {
      throw new Error('Esta inscrição já foi substituída por transferência administrativa.');
    }
    if (reg.payment_status === 'refunded') {
      throw new Error('Não é possível transferir inscrição com pagamento reembolsado.');
    }
    if (reg.payment_status !== 'paid') {
      throw new Error('Somente inscrições com pagamento confirmado (paid) podem ser transferidas neste fluxo.');
    }
    if (reg.runner_id === newRunnerId) {
      throw new Error('A inscrição já está neste atleta.');
    }

    const dup = await client.query(
      `SELECT id FROM registrations 
       WHERE event_id = $1 AND runner_id = $2 
       AND status NOT IN ('cancelled', 'refunded')
       AND NOT (status = 'transferred' AND transferred_to_registration_id IS NOT NULL)`,
      [reg.event_id, newRunnerId]
    );
    if (dup.rows.length > 0) {
      throw new Error('O atleta recebedor já possui inscrição ativa neste evento.');
    }

    const confirmationCode = `REG-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    const insertRes = await client.query(
      `INSERT INTO registrations (
        event_id, runner_id, registered_by, category_id, kit_id, modality_id, category_batch_id,
        payment_method, total_amount, platform_fee_amount, registration_edit_fee_amount,
        platform_fee_backfilled,
        confirmation_code, status, payment_status, coupon_code, asaas_payment_id,
        transferred_from_registration_id
      )
      SELECT
        r.event_id,
        $1::uuid,
        $1::uuid,
        r.category_id,
        r.kit_id,
        r.modality_id,
        r.category_batch_id,
        'admin_transfer'::payment_method,
        r.total_amount::numeric,
        COALESCE(r.platform_fee_amount, 0)::numeric,
        COALESCE(r.registration_edit_fee_amount, 0)::numeric,
        false,
        $2::text,
        'confirmed'::registration_status,
        'paid'::payment_status,
        r.coupon_code,
        NULL::text,
        $3::uuid
      FROM registrations r
      WHERE r.id = $4
      RETURNING id`,
      [newRunnerId, confirmationCode, registrationId, registrationId]
    );

    const newId = insertRes.rows[0].id as string;

    await client.query(
      `INSERT INTO registration_product_selections (registration_id, product_id, variant_id, attribute_name, attribute_value)
       SELECT $1, product_id, variant_id, attribute_name, attribute_value
       FROM registration_product_selections WHERE registration_id = $2`,
      [newId, registrationId]
    );

    await client.query(
      `INSERT INTO registration_custom_field_values (registration_id, category_custom_field_id, value)
       SELECT $1, category_custom_field_id, value
       FROM registration_custom_field_values WHERE registration_id = $2`,
      [newId, registrationId]
    );

    await client.query(
      `UPDATE registration_amount_adjustments SET registration_id = $1 WHERE registration_id = $2`,
      [newId, registrationId]
    );

    await client.query(`UPDATE asaas_payments SET registration_id = $1 WHERE registration_id = $2`, [
      newId,
      registrationId,
    ]);

    await client.query(`UPDATE asaas_webhook_events SET registration_id = $1 WHERE registration_id = $2`, [
      newId,
      registrationId,
    ]);

    await client.query(`UPDATE leader_commissions SET registration_id = $1 WHERE registration_id = $2`, [
      newId,
      registrationId,
    ]);

    await client.query(
      `UPDATE leader_invitations SET bonus_registration_id = $1 WHERE bonus_registration_id = $2`,
      [newId, registrationId]
    );

    await client.query(
      `UPDATE leader_event_commissions SET bonus_registration_id = $1 WHERE bonus_registration_id = $2`,
      [newId, registrationId]
    );

    await client.query(`UPDATE user_referrals SET registration_id = $1 WHERE registration_id = $2`, [
      newId,
      registrationId,
    ]);

    await client.query(
      `UPDATE registrations 
       SET status = 'transferred',
           payment_status = 'paid',
           transferred_to_registration_id = $1,
           updated_at = NOW()
       WHERE id = $2`,
      [newId, registrationId]
    );

    await client.query('COMMIT');

    console.log(
      JSON.stringify({
        type: 'admin_registration_transfer_split',
        from_registration_id: registrationId,
        to_registration_id: newId,
        admin_user_id: meta.adminUserId,
        reason: meta.reason?.trim() || null,
        at: new Date().toISOString(),
      })
    );

    return { previousRegistrationId: registrationId, newRegistrationId: newId };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

export type TransferRegistrationOptions = {
  /** Finaliza transferência iniciada pelo runner (taxa paga / solicitação aprovada). */
  finalizeRunnerTransfer?: boolean;
};

// Transfer registration to another runner
export const transferRegistration = async (
  registrationId: string,
  newRunnerId: string,
  options?: TransferRegistrationOptions
) => {
  // Check if registration exists
  const registration = await getRegistrationById(registrationId);
  if (!registration) {
    throw new Error('Registration not found');
  }

  // Get old runner ID before transfer
  const oldRunnerId = registration.runner_id;

  const paymentStatusClause = options?.finalizeRunnerTransfer
    ? `, payment_status = 'transferred'`
    : '';

  // Update runner_id and set status to transferred
  const result = await query(
    `UPDATE registrations 
     SET runner_id = $1, status = 'transferred'${paymentStatusClause}, updated_at = NOW()
     WHERE id = $2
     RETURNING *`,
    [newRunnerId, registrationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  // Send email notifications for transfer
  try {
    const { sendNotificationSafely, getUserEmail, getUserName } = await import('./notificationService.js');
    const { getEventById } = await import('./eventsService.js');
    
    const event = await getEventById(registration.event_id);
    if (event) {
      // Get runner names and emails
      const oldRunnerEmail = await getUserEmail(oldRunnerId);
      const oldRunnerName = await getUserName(oldRunnerId);
      const newRunnerEmail = await getUserEmail(newRunnerId);
      const newRunnerName = await getUserName(newRunnerId);

      // Format event date
      const eventDate = event.event_date ? new Date(event.event_date).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }) : 'Data não informada';

      // Format event location
      const eventLocation = event.location || `${event.city || ''}${event.city && event.state ? ' - ' : ''}${event.state || ''}`.trim() || 'Local não informado';

      // Notify old runner (who transferred)
      if (oldRunnerEmail && oldRunnerName) {
        await sendNotificationSafely({
          templateKey: 'registration_transferred',
          recipient: {
            email: oldRunnerEmail,
            name: oldRunnerName,
          },
          variables: {
            userName: oldRunnerName,
            eventTitle: event.title,
            registrationCode: registration.confirmation_code,
            newRunnerName: newRunnerName || 'Novo titular',
            eventDate: eventDate,
            eventLocation: eventLocation,
          },
        });
        console.log('✅ Notificação de transferência enviada para runner que transferiu');
      }

      // Notify new runner (who received)
      if (newRunnerEmail && newRunnerName) {
        await sendNotificationSafely({
          templateKey: 'registration_received',
          recipient: {
            email: newRunnerEmail,
            name: newRunnerName,
          },
          variables: {
            userName: newRunnerName,
            eventTitle: event.title,
            registrationCode: registration.confirmation_code,
            oldRunnerName: oldRunnerName || 'Titular anterior',
            eventDate: eventDate,
            eventLocation: eventLocation,
          },
        });
        console.log('✅ Notificação de recebimento enviada para runner que recebeu');
      }
    }
  } catch (notificationError: any) {
    // Don't fail the transfer if notification fails
    console.error('❌ Erro ao enviar notificações de transferência:', notificationError);
  }

  return result.rows[0];
};

// Cancel registration
export const cancelRegistration = async (registrationId: string) => {
  // Check if registration exists
  const registration = await getRegistrationById(registrationId);
  if (!registration) {
    throw new Error('Registration not found');
  }

  // Check if already cancelled
  if (registration.status === 'cancelled') {
    throw new Error('Registration is already cancelled');
  }

  // Update status to cancelled (estoque derivado: cancelled não consome — ver variantStockPolicyService)
  const result = await query(
    `UPDATE registrations 
     SET status = 'cancelled', updated_at = NOW()
     WHERE id = $1
     RETURNING *`,
    [registrationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

// Delete registration (hard delete - only for admin)
export const deleteRegistration = async (registrationId: string) => {
  // Delete registration (cascade will handle related records)
  // Note: The controller should verify the registration exists before calling this
  const result = await query(
    `DELETE FROM registrations 
     WHERE id = $1
     RETURNING *`,
    [registrationId]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
};

