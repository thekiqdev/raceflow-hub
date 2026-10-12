import {getRegistrationReceipt} from '@/lib/api/registrations';
import {downloadCheckoutTickets} from '@/components/registration/checkoutTicketDownload';
import {maskCpf} from '@/lib/utils/masks';
/** Revalida no endpoint existente; não usa códigos nem dados pessoais da lista resumida. */
export async function downloadLegacyTicket(id:string,userId:string) {
  const response=await getRegistrationReceipt(id);
  if(!response.success || !response.data) throw new Error(response.error || 'Ingresso indisponível.');
  const r=response.data;
  const active=r.status==='confirmed' || r.status==='transferred' && !r.transferred_to_registration_id;
  if(r.order_id || r.runner_id!==userId || !active || !['paid','convidado','transferred'].includes(r.payment_status || '') || !r.confirmation_code) throw new Error('Ingresso indisponível. Atualize a lista.');
  await downloadCheckoutTickets([{id:r.id,released:true,confirmation_code:r.confirmation_code,event_title:r.event_title || 'Evento',event_date:r.event_date || '',location:r.location || [r.city,r.state].filter(Boolean).join(' / '),
    runner_name:r.runner_name,cpf_masked:r.runner_cpf?maskCpf(r.runner_cpf):undefined,
    labels:{category:r.category_name,modality:r.modality_name,kit:r.kit_name,products:(r.product_selections ?? []).map(p=>({product_name:p.product_name,variant_name:p.variant_name}))},pricing:{total:r.total_amount ?? null}}]);
}
