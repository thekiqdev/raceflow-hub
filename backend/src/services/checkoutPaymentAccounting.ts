import { query } from '../config/database.js';

/** Valores efetivamente liquidados por ingresso, em reais, descontados os estornos confirmados. */
export async function getOrderAllocatedPaidTotals(ids:string[]):Promise<Record<string,number>> {
  if(!ids.length || !(await query("SELECT to_regclass('public.checkout_payment_allocations') AS t")).rows[0].t) return {};
  const rows=(await query(`SELECT registration_id,(gross_cents-refunded_cents)::numeric/100 AS paid
    FROM checkout_payment_allocations WHERE registration_id=ANY($1::uuid[]) AND settled_at IS NOT NULL`,[ids])).rows;
  return Object.fromEntries(rows.map(r=>[r.registration_id,Number(r.paid)]));
}
