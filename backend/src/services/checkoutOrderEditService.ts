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

    const pricePreview = await computePreview(reg, input);
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

    const updated = await updateRegistration(registrationId, updatePayload as any);
    if (!updated) throw fail('Não foi possível atualizar a inscrição.', 500);

    const tx = getTransactionClient();
    if (!tx) throw fail('Contexto de transação indisponível.', 500);

    if (selectionPlan?.kind === 'replace') {
      await replaceRegistrationProductSelectionsForEdit(tx, registrationId, reg.event_id, selectionPlan.selections);
    } else if (
      !categoryChanging &&
      !kitChanging &&
      Array.isArray(input.product_selections) &&
      input.product_selections.length > 0
    ) {
      await replaceRegistrationProductSelectionsForEdit(tx, registrationId, reg.event_id, input.product_selections);
    }

    return { reg, updated, pricePreview, anyPriceChange };
  });

  const { reg, updated, pricePreview, anyPriceChange } = applied;
  let payment_status = updated.payment_status as string;

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
