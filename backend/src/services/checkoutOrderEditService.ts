import { query, withTransaction, getTransactionClient } from '../config/database.js';
import { calculateRegistrationTotal } from './registrationTotalService.js';
import { getSystemSettings } from './systemSettingsService.js';
import {
  getAmountPaidForOrganizer,
  getTotalPaidForRegistration,
  getPendingPaymentsForRegistration,
  cancelPayment,
  createPayment,
} from './asaasService.js';
import { updateRegistration, replaceRegistrationProductSelectionsForEdit } from './registrationsService.js';
import { planRegistrationKitCategorySelectionSync } from './registrationKitCategorySelectionService.js';
import type { SelectionInput } from './registrationSelectionsWriteService.js';

const fail = (message: string, statusCode = 409) => Object.assign(new Error(message), { statusCode });

export interface CheckoutRegistrationEditInput {
  category_id?: string;
  modality_id?: string | null;
  kit_id?: string | null;
  category_batch_id?: string | null;
  product_selections?: SelectionInput[];
  custom_field_values?: Record<string, string>;
  /** Admin: cancelamento operacional (ex.: pedido FREE R$ 0) sem gateway. */
  status?: 'pending' | 'confirmed' | 'cancelled' | 'refund_requested' | 'refunded' | 'transferred';
  payment_status?: 'pending' | 'paid' | 'partially_paid' | 'refunded' | 'failed' | 'convidado' | 'transferred';
}

export interface CheckoutRegistrationEditPreview {
  old_total: number;
  new_subtotal: number;
  update_fee: number;
  new_total: number;
  amount_paid: number;
  amount_paid_for_organizer: number;
  difference_to_pay: number;
  difference_to_refund: number;
}

async function loadEditableRegistration(orderId: string, registrationId: string) {
  const row = (
    await query(
      `SELECT r.*, o.status AS order_status, o.buyer_id, o.event_id AS order_event_id, e.organizer_id
       FROM registrations r
       JOIN checkout_orders o ON o.id = r.order_id
       JOIN events e ON e.id = o.event_id
       WHERE r.id = $1 AND r.order_id = $2`,
      [registrationId, orderId]
    )
  ).rows[0];
  if (!row) throw fail('Inscrição do pedido não encontrada.', 404);
  if (!['confirmed', 'needs_review'].includes(row.order_status)) {
    throw fail('Só é possível editar escolhas de pedidos confirmados.');
  }
  if (['cancelled', 'refunded', 'transferred'].includes(row.status)) {
    throw fail('Esta inscrição não pode ser editada.');
  }
  if (!['paid', 'partially_paid'].includes(row.payment_status)) {
    throw fail('Só é possível editar ingressos pagos (ou com diferença pendente).');
  }
  return row;
}

async function computePreview(reg: any, input: CheckoutRegistrationEditInput): Promise<CheckoutRegistrationEditPreview> {
  const categoryId = input.category_id ?? reg.category_id;
  const kitId = input.kit_id !== undefined ? input.kit_id : (reg.kit_id ?? null);
  const modalityId = input.modality_id !== undefined ? input.modality_id : (reg.modality_id ?? null);
  const batchId = input.category_batch_id !== undefined ? input.category_batch_id : (reg.category_batch_id ?? null);

  const calculation = await calculateRegistrationTotal({
    eventId: reg.event_id,
    categoryId,
    kitId,
    modalityId,
    batchId: batchId || undefined,
    couponCode: reg.coupon_code || undefined,
    runnerId: reg.runner_id,
  });

  const oldTotal = parseFloat(String(reg.total_amount)) || 0;
  const platformFeeAmount = parseFloat(String(reg.platform_fee_amount)) || 0;
  const settings = await getSystemSettings();
  const updateFee = settings.registration_edit_fee ?? 0;
  const newSubtotalForOrganizer = calculation.amountAfterDiscounts;
  const oldOrganizerPortion = Math.max(0, oldTotal - platformFeeAmount);
  const valueChanged = Math.abs(newSubtotalForOrganizer - oldOrganizerPortion) >= 0.01;
  const appliedUpdateFee = valueChanged ? updateFee : 0;
  const newTotalForOrganizer = Math.round((newSubtotalForOrganizer + appliedUpdateFee) * 100) / 100;
  const newTotalAmount = Math.round((platformFeeAmount + newSubtotalForOrganizer + appliedUpdateFee) * 100) / 100;

  let amountPaid = await getTotalPaidForRegistration(reg.id);
  let amountPaidForOrganizer = await getAmountPaidForOrganizer(reg.id);
  if (amountPaid === 0 && reg.payment_status === 'paid' && oldTotal > 0) {
    amountPaid = oldTotal;
    amountPaidForOrganizer = Math.round((oldTotal - platformFeeAmount) * 100) / 100;
  }

  return {
    old_total: oldTotal,
    new_subtotal: newSubtotalForOrganizer,
    update_fee: appliedUpdateFee,
    new_total: newTotalAmount,
    amount_paid: amountPaid,
    amount_paid_for_organizer: amountPaidForOrganizer,
    difference_to_pay: Math.max(0, Math.round((newTotalForOrganizer - amountPaidForOrganizer) * 100) / 100),
    difference_to_refund: Math.max(0, Math.round((amountPaidForOrganizer - newTotalForOrganizer) * 100) / 100),
  };
}

async function validateRefs(reg: any, input: CheckoutRegistrationEditInput) {
  const categoryId = input.category_id ?? reg.category_id;
  if (input.category_id) {
    const cat = (await query('SELECT id FROM categories WHERE id=$1 AND event_id=$2', [input.category_id, reg.event_id])).rows[0];
    if (!cat) throw fail('Categoria inválida ou não pertence ao evento.', 400);
  }
  if (input.kit_id) {
    const kit = (
      await query(
        `SELECT k.id FROM event_kits k JOIN kit_categories kc ON kc.kit_id=k.id
         WHERE k.id=$1 AND k.event_id=$2 AND kc.category_id=$3 AND k.deleted_at IS NULL`,
        [input.kit_id, reg.event_id, categoryId]
      )
    ).rows[0];
    if (!kit) throw fail('Kit inválido para a categoria/evento.', 400);
  }
  if (input.modality_id) {
    const modality = (
      await query(
        `SELECT m.id FROM modalities m
         JOIN category_modalities cm ON cm.modality_id=m.id AND cm.category_id=$2
         WHERE m.id=$1 AND m.event_id=$3`,
        [input.modality_id, categoryId, reg.event_id]
      )
    ).rows[0];
    if (!modality) throw fail('Modalidade inválida para a categoria/evento.', 400);
  }
  if (input.category_batch_id) {
    const batch = (
      await query('SELECT id FROM category_batches WHERE id=$1 AND category_id=$2', [input.category_batch_id, categoryId])
    ).rows[0];
    if (!batch) throw fail('Lote inválido para a categoria.', 400);
  }
}

export async function previewCheckoutRegistrationEdit(
  orderId: string,
  registrationId: string,
  input: CheckoutRegistrationEditInput
) {
  const reg = await loadEditableRegistration(orderId, registrationId);
  await validateRefs(reg, input);
  return computePreview(reg, input);
}

/**
 * Reconstrói labels/selections/choices do snapshot a partir do estado atual da inscrição.
 * Sem isso, ingresso e detalhe do pedido continuam mostrando a compra original.
 */
async function syncCheckoutItemSnapshotAfterEdit(
  registrationId: string,
  pricePreview: CheckoutRegistrationEditPreview | null,
  anyPriceChange: boolean
) {
  const item = (
    await query('SELECT id, snapshot FROM checkout_order_items WHERE registration_id=$1 FOR UPDATE', [
      registrationId,
    ])
  ).rows[0];
  if (!item?.snapshot) return;

  const reg = (
    await query(
      `SELECT r.category_id, r.kit_id, r.modality_id, r.category_batch_id, r.total_amount, r.coupon_code,
              c.name AS category_name, m.name AS modality_name, k.name AS kit_name, b.name AS batch_name
       FROM registrations r
       LEFT JOIN categories c ON c.id = r.category_id
       LEFT JOIN modalities m ON m.id = r.modality_id
       LEFT JOIN event_kits k ON k.id = r.kit_id
       LEFT JOIN category_batches b ON b.id = r.category_batch_id
       WHERE r.id = $1`,
      [registrationId]
    )
  ).rows[0];
  if (!reg) return;

  const selectionRows = (
    await query(
      `SELECT rps.product_id, rps.variant_id, rps.attribute_name, rps.attribute_value,
              p.name AS product_name, v.name AS variant_name, p.type AS product_type
       FROM registration_product_selections rps
       JOIN kit_products p ON p.id = rps.product_id
       LEFT JOIN product_variants v ON v.id = rps.variant_id
       WHERE rps.registration_id = $1
       ORDER BY p.name, rps.attribute_name`,
      [registrationId]
    )
  ).rows;

  const byProduct = new Map<
    string,
    {
      product_id: string;
      variant_id: string;
      product_name: string;
      variant_name: string | null;
      attributes: Record<string, string>;
    }
  >();
  for (const row of selectionRows) {
    const key = `${row.product_id}:${row.variant_id || ''}`;
    let entry = byProduct.get(key);
    if (!entry) {
      entry = {
        product_id: row.product_id,
        variant_id: row.variant_id,
        product_name: row.product_name,
        variant_name: row.variant_name,
        attributes: {},
      };
      byProduct.set(key, entry);
    }
    if (row.attribute_name) entry.attributes[row.attribute_name] = row.attribute_value ?? '';
  }

  const selections = [...byProduct.values()].map((s) => ({
    product_id: s.product_id,
    variant_id: s.variant_id,
    attributes: s.attributes,
  }));
  const productLabels = [...byProduct.values()].map((s) => ({
    product_id: s.product_id,
    product_name: s.product_name,
    variant_id: s.variant_id || '',
    variant_name: s.variant_name || '',
  }));

  if (reg.kit_id) {
    const selectedIds = selections.map((s) => s.product_id);
    const uniqueProducts = (
      await query(
        `SELECT id AS product_id, name AS product_name, ''::text AS variant_id, ''::text AS variant_name
         FROM kit_products
         WHERE kit_id = $1 AND type = 'unique'
           AND ($2::uuid[] = '{}' OR id <> ALL($2::uuid[]))
         ORDER BY id`,
        [reg.kit_id, selectedIds]
      )
    ).rows;
    productLabels.push(...uniqueProducts);
  }

  const customRows = (
    await query(
      `SELECT category_custom_field_id, value FROM registration_custom_field_values WHERE registration_id = $1`,
      [registrationId]
    )
  ).rows;
  const custom_field_values = Object.fromEntries(
    customRows.map((r: { category_custom_field_id: string; value: string | null }) => [
      r.category_custom_field_id,
      r.value ?? '',
    ])
  );

  const fieldDefs = reg.category_id
    ? (
        await query('SELECT id, label FROM category_custom_fields WHERE category_id = $1', [reg.category_id])
      ).rows
    : [];
  const customFieldLabels = Object.fromEntries(fieldDefs.map((f: { id: string; label: string }) => [f.id, f.label]));

  const prev = item.snapshot as Record<string, any>;
  const product_selections = selections.map((s) => ({
    product_id: s.product_id,
    variant_id: s.variant_id,
    attribute_selections: s.attributes,
  }));

  let pricing = prev.pricing ?? {};
  if (anyPriceChange && pricePreview) {
    pricing = {
      ...pricing,
      total: pricePreview.new_total,
      amountAfterDiscounts: pricePreview.new_subtotal,
    };
  } else if (reg.total_amount != null) {
    pricing = { ...pricing, total: Number(reg.total_amount) };
  }

  const snapshot = {
    ...prev,
    pricing,
    selections,
    labels: {
      ...(prev.labels ?? {}),
      category: reg.category_name ?? null,
      modality: reg.modality_name ?? null,
      kit: reg.kit_name ?? null,
      batch: reg.batch_name ?? null,
      products: productLabels,
      custom_fields: { ...(prev.labels?.custom_fields ?? {}), ...customFieldLabels },
    },
    choices: {
      ...(prev.choices ?? {}),
      category_id: reg.category_id,
      kit_id: reg.kit_id ?? null,
      modality_id: reg.modality_id ?? null,
      category_batch_id: reg.category_batch_id ?? null,
      coupon_code: reg.coupon_code ?? prev.choices?.coupon_code ?? null,
      product_selections,
      custom_field_values,
    },
  };

  await query('UPDATE checkout_order_items SET snapshot = $2::jsonb WHERE id = $1', [item.id, snapshot]);
}

/**
 * Cancela ingresso do pedido sem gateway (FREE / R$ 0).
 * Libera cupom e marca alocação; estoque deixa de consumir quando status = cancelled.
 */
async function applyOperationalCancel(orderId: string, registrationId: string, nextStatus: string, nextPayment: string) {
  const attempt = (
    await query(
      `SELECT * FROM checkout_payment_attempts WHERE order_id=$1 ORDER BY created_at DESC, id DESC LIMIT 1`,
      [orderId]
    )
  ).rows[0];
  const allocation = attempt
    ? (
        await query('SELECT * FROM checkout_payment_allocations WHERE attempt_id=$1 AND registration_id=$2 FOR UPDATE', [
          attempt.id,
          registrationId,
        ])
      ).rows[0]
    : null;

  if (attempt && attempt.method !== 'FREE' && Number(allocation?.gross_cents || 0) > 0) {
    throw fail(
      'Ingresso pago: use «Estornar este ingresso» para devolver o valor no gateway. A edição de status só cancela pedidos gratuitos (R$ 0).',
      409
    );
  }

  const before = (await query('SELECT status, payment_status FROM registrations WHERE id=$1 FOR UPDATE', [registrationId])).rows[0];
  await query(
    `UPDATE registrations SET status=$2, payment_status=$3, updated_at=now() WHERE id=$1`,
    [registrationId, nextStatus, nextPayment]
  );
  if (allocation) {
    await query('UPDATE checkout_payment_allocations SET refunded_cents=gross_cents WHERE registration_id=$1', [registrationId]);
  }
  const coupon = (await query('SELECT coupon_id FROM checkout_order_items WHERE registration_id=$1', [registrationId])).rows[0]
    ?.coupon_id;
  if (coupon && before?.status !== 'cancelled' && before?.status !== 'refunded') {
    await query('UPDATE coupons SET current_uses=GREATEST(0,current_uses-1),updated_at=now() WHERE id=$1', [coupon]);
  }
  await query(
    `INSERT INTO checkout_payment_effects(registration_id,kind) VALUES ($1,'refunded') ON CONFLICT DO NOTHING`,
    [registrationId]
  );
}

export async function applyCheckoutRegistrationEdit(
  orderId: string,
  registrationId: string,
  actorId: string,
  input: CheckoutRegistrationEditInput
) {
  const applied = await withTransaction(async () => {
    const reg = await loadEditableRegistration(orderId, registrationId);
    await query('SELECT id FROM checkout_orders WHERE id=$1 FOR UPDATE', [orderId]);
    await query('SELECT id FROM registrations WHERE id=$1 FOR UPDATE', [registrationId]);
    await query("SELECT set_config('cronoteam.order_write',$1,true)", [orderId]);
    await validateRefs(reg, input);

    const statusOnly =
      (input.status !== undefined || input.payment_status !== undefined) &&
      input.category_id === undefined &&
      input.modality_id === undefined &&
      input.kit_id === undefined &&
      input.category_batch_id === undefined &&
      input.product_selections === undefined &&
      input.custom_field_values === undefined;

    const pricePreview = statusOnly
      ? {
          old_total: parseFloat(String(reg.total_amount)) || 0,
          new_subtotal: 0,
          update_fee: 0,
          new_total: parseFloat(String(reg.total_amount)) || 0,
          amount_paid: 0,
          amount_paid_for_organizer: 0,
          difference_to_pay: 0,
          difference_to_refund: 0,
        }
      : await computePreview(reg, input);
    const updatePayload: Record<string, unknown> = {};
    if (input.category_id !== undefined) updatePayload.category_id = input.category_id;
    if (input.modality_id !== undefined) updatePayload.modality_id = input.modality_id;
    if (input.kit_id !== undefined) updatePayload.kit_id = input.kit_id;
    if (input.category_batch_id !== undefined) updatePayload.category_batch_id = input.category_batch_id;
    if (input.custom_field_values !== undefined) updatePayload.custom_field_values = input.custom_field_values;

    const anyPriceChange = ['category_id', 'kit_id', 'modality_id', 'category_batch_id'].some(
      (k) => (input as any)[k] !== undefined
    );
    if (anyPriceChange) {
      updatePayload.total_amount = pricePreview.new_total;
      if (pricePreview.update_fee > 0) updatePayload.registration_edit_fee_amount = pricePreview.update_fee;
    }

    const nextCategoryId = (input.category_id as string) || reg.category_id;
    const nextKitId = input.kit_id !== undefined ? input.kit_id : reg.kit_id;
    const categoryChanging = input.category_id !== undefined && input.category_id !== reg.category_id;
    const kitChanging = input.kit_id !== undefined && input.kit_id !== reg.kit_id;
    const explicitKitRemoval = Object.prototype.hasOwnProperty.call(input, 'kit_id') && input.kit_id === null;
    const hasIncomingSelections =
      Array.isArray(input.product_selections) && input.product_selections.length > 0;

    let selectionPlan: Awaited<ReturnType<typeof planRegistrationKitCategorySelectionSync>> | null = null;
    if (categoryChanging || kitChanging) {
      selectionPlan = await planRegistrationKitCategorySelectionSync({
        registrationId,
        eventId: reg.event_id,
        oldCategoryId: reg.category_id,
        newCategoryId: nextCategoryId,
        oldKitId: reg.kit_id,
        newKitId: nextKitId,
        explicitKitRemoval,
        incomingProductSelections: input.product_selections,
      });
      if (selectionPlan.kind === 'reject') {
        throw Object.assign(new Error(selectionPlan.reasons.join(' ')), {
          statusCode: 400,
          details: { requires_product_reselection: true, reasons: selectionPlan.reasons },
        });
      }
    }

    const becomingCancelled =
      input.status === 'cancelled' ||
      input.status === 'refunded' ||
      input.payment_status === 'refunded';

    let updated = await updateRegistration(registrationId, updatePayload as any);
    if (!updated) throw fail('Não foi possível atualizar a inscrição.', 500);

    if (becomingCancelled) {
      const nextStatus = input.status === 'refunded' ? 'refunded' : input.status === 'cancelled' ? 'cancelled' : 'cancelled';
      const nextPayment =
        input.payment_status === 'refunded' || nextStatus === 'refunded' || updated.payment_status === 'paid'
          ? 'refunded'
          : input.payment_status || updated.payment_status;
      await applyOperationalCancel(orderId, registrationId, nextStatus, String(nextPayment));
      updated = (await query('SELECT * FROM registrations WHERE id=$1', [registrationId])).rows[0];
    } else if (input.status !== undefined || input.payment_status !== undefined) {
      const statusPatch: Record<string, unknown> = {};
      if (input.status !== undefined) statusPatch.status = input.status;
      if (input.payment_status !== undefined) statusPatch.payment_status = input.payment_status;
      updated = await updateRegistration(registrationId, statusPatch as any);
      if (!updated) throw fail('Não foi possível atualizar o status da inscrição.', 500);
    }

    const tx = getTransactionClient();
    if (!tx) throw fail('Contexto de transação indisponível.', 500);

    if (selectionPlan?.kind === 'replace') {
      await replaceRegistrationProductSelectionsForEdit(tx, registrationId, reg.event_id, selectionPlan.selections);
    } else if (hasIncomingSelections) {
      // Mesmo com troca de kit/categoria em noop, ou só troca de tamanho: persiste o payload enviado.
      await replaceRegistrationProductSelectionsForEdit(tx, registrationId, reg.event_id, input.product_selections!);
    }

    if (!statusOnly) await syncCheckoutItemSnapshotAfterEdit(registrationId, pricePreview, anyPriceChange);

    return { reg, updated, pricePreview, anyPriceChange, becomingCancelled };
  });

  const { reg, updated, pricePreview, anyPriceChange, becomingCancelled } = applied;
  let payment_status = updated.payment_status as string;
  if (becomingCancelled) {
    return {
      registration_id: registrationId,
      order_id: orderId,
      payment_status,
      preview: pricePreview,
      operational_cancel: true,
    };
  }

  if (anyPriceChange) {
    const newTotalForOrganizer = Math.round((pricePreview.new_subtotal + pricePreview.update_fee) * 100) / 100;
    const amountPaid = pricePreview.amount_paid;
    const amountPaidForOrganizer = pricePreview.amount_paid_for_organizer;

    if (newTotalForOrganizer > amountPaidForOrganizer) {
      const pendingPayments = await getPendingPaymentsForRegistration(registrationId);
      for (const row of pendingPayments) {
        try {
          await cancelPayment(row.asaas_payment_id);
        } catch {
          /* melhor esforço */
        }
      }
      const differenceToCharge = Math.round((newTotalForOrganizer - amountPaidForOrganizer) * 100) / 100;
      if (differenceToCharge >= 0.01) {
        const payerId = reg.buyer_id || reg.runner_id;
        const customerRow = payerId
          ? (await query('SELECT asaas_customer_id FROM asaas_customers WHERE user_id=$1', [payerId])).rows[0]
          : null;
        if (customerRow?.asaas_customer_id) {
          const dueDate = new Date();
          dueDate.setDate(dueDate.getDate() + 7);
          const regMethod = String(updated.payment_method || 'pix');
          const billingType =
            regMethod === 'boleto' ? 'BOLETO' : regMethod === 'credit_card' ? 'CREDIT_CARD' : 'PIX';
          await createPayment(
            registrationId,
            customerRow.asaas_customer_id,
            {
              value: differenceToCharge,
              dueDate: dueDate.toISOString().slice(0, 10),
              description:
                amountPaidForOrganizer > 0
                  ? 'Complemento - Alteração da inscrição (pedido)'
                  : 'Inscrição - Alteração (pedido)',
              billingType,
              externalReference: updated.confirmation_code || undefined,
            },
            { setAsRegistrationPaymentId: amountPaid === 0 }
          );
        }
        await withTransaction(async () => {
          await query("SELECT set_config('cronoteam.order_write',$1,true)", [orderId]);
          await query(
            `UPDATE registrations SET payment_status='partially_paid', updated_at=now() WHERE id=$1`,
            [registrationId]
          );
        });
        payment_status = 'partially_paid';
      }
    } else if (newTotalForOrganizer < amountPaidForOrganizer) {
      await query(
        `INSERT INTO registration_amount_adjustments (registration_id, old_total, new_total, adjustment_type, notes, created_by)
         VALUES ($1,$2,$3,'refund_pending',$4,$5)`,
        [
          registrationId,
          pricePreview.old_total,
          newTotalForOrganizer,
          'Reembolso manual pendente (edição de pedido reduziu o valor).',
          actorId,
        ]
      );
    }
  }

  return {
    registration_id: registrationId,
    order_id: orderId,
    payment_status,
    preview: pricePreview,
  };
}
