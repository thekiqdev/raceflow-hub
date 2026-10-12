import type { CheckoutTicket } from '@/lib/api/checkoutDelivery';
export type TicketDocument=Pick<CheckoutTicket,'id'|'released'|'confirmation_code'|'event_title'|'event_date'|'location'|'runner_name'|'cpf_masked'|'custom_fields'> & {
  labels:{category?:string|null;modality?:string|null;batch?:string|null;kit?:string|null;products:Array<{product_name:string;variant_name:string|null}>};
  pricing:{total:number|null};
};

/** URL pública de check-in — mesma tela legada /registration/validate/:id. */
export function registrationValidationUrl(registrationId:string) {
  return `${window.location.origin}/registration/validate/${registrationId}`;
}

/** Recebe somente ingressos consultados novamente no servidor antes do download. */
export async function downloadCheckoutTickets(tickets:TicketDocument[]) {
  if(!tickets.length || tickets.some(t=>!t.id || !t.released || !t.confirmation_code)) throw new Error('Ingresso indisponível. Atualize a lista.');
  const [{jsPDF},{default:QRCode}]=await Promise.all([import('jspdf'),import('qrcode')]);
  const pdf=new jsPDF();
  for(const [i,t] of tickets.entries()) {
    if(i) pdf.addPage();
    let y=18;
    const line=(text:string,size=11)=>{
      pdf.setFontSize(size);
      const lines=pdf.splitTextToSize(text,174) as string[];
      for(const part of lines){if(y>275){pdf.addPage();y=18;}pdf.text(part,18,y);y+=7;}
    };
    const validationUrl=registrationValidationUrl(t.id);
    line('CRONOTEAM | INGRESSO',16);line(t.event_title,14);
    line(new Date(t.event_date).toLocaleString('pt-BR'));line(t.location);
    line(t.runner_name || 'Participante',14);line(t.cpf_masked || '');
    line([t.labels.category,t.labels.modality,t.labels.batch].filter(Boolean).join(' | '));
    line(`Kit: ${t.labels.kit || 'Sem kit'}`);
    for(const p of t.labels.products) line(`${p.product_name}: ${p.variant_name}`);
    for(const f of t.custom_fields ?? []) line(`${f.label}: ${f.value}`);
    line(t.pricing.total===null?'Valor não informado':`Total: ${Number(t.pricing.total).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}`);
    line(`Inscrição: ${t.confirmation_code}`);
    if(y>210){pdf.addPage();y=18;}
    const qr=await QRCode.toDataURL(validationUrl,{width:240,margin:2});
    pdf.addImage(qr,'PNG',18,y,48,48);y+=55;
    line('Escaneie o QR Code para abrir a validação da inscrição.',9);
    line(validationUrl,8);
  }
  pdf.save(tickets.length===1?'ingresso-cronoteam.pdf':'ingressos-cronoteam.pdf');
}
