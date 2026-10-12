import type {MyTicket} from '@/lib/api/myTickets';
import type {Registration} from '@/lib/api/registrations';
/** Adapta a consulta única ao card existente, sem simular dados pessoais nem autorizar mutações. */
export function ticketCardRegistration(ticket:MyTicket):Registration {
  return {...ticket.legacy,id:ticket.registration_id,order_id:ticket.order_id,event_id:ticket.event.id,
    runner_id:ticket.legacy?.runner_id ?? '',registered_by:ticket.legacy?.registered_by ?? '',category_id:ticket.legacy?.category_id ?? '',
    event_title:ticket.event.title,event_date:ticket.event.date,event_banner_url:ticket.event.banner_url,
    event_transfers_enabled:ticket.event.transfers_enabled,event_transfer_until:ticket.event.transfer_until,
    status:(ticket.state.group==='active'?'confirmed':ticket.state.registration) as Registration['status'],
    payment_status:(ticket.source==='legacy' && ticket.state.registration==='transferred' && ticket.relationship.runner && ticket.state.group==='active'?'transferred':ticket.state.payment) as Registration['payment_status'],
    total_amount:(ticket.amounts.total_cents ?? 0)/100,category_name:ticket.selection.category ?? undefined,
    modality_name:ticket.selection.modality,kit_name:ticket.selection.kit ?? undefined,
    runner_name:ticket.participant.name ?? undefined,
    product_selections:(ticket.selection.products ?? []).map(p=>({
      product_id:p.product_id,product_name:p.product_name,variant_id:p.variant_id,variant_name:p.variant_name,
      attribute_name:'',attribute_value:p.variant_name,
    }))};
}
