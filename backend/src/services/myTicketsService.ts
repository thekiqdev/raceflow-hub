import { z } from 'zod';
import { query } from '../config/database.js';
import { getFileUrl } from '../middleware/upload.js';
import { formatCpf } from '../utils/cpf.js';
import {getPendingDifferenceAmountsForRegistrationIds,getTotalPaidForRegistrationIds} from './asaasService.js';
import {linkVerifiedCheckoutTickets} from './checkoutTicketsService.js';
import {getSystemSettings} from './systemSettingsService.js';

export const myTicketsFilters=z.object({
  page:z.coerce.number().int().min(1).max(100000).default(1),
  page_size:z.coerce.number().int().min(1).max(100).default(20),
  relationship:z.enum(['all','runner','buyer']).default('all'),
  status:z.enum(['all','active','pending','transferred','cancelled','refunded']).default('all'),
  event_id:z.string().uuid().optional(),order_id:z.string().uuid().optional(),search:z.string().trim().max(120).default(''),
}).strict();
export type MyTicketsFilters=z.input<typeof myTicketsFilters>;
export const myTicketEventsFilters=z.object({
  page:z.coerce.number().int().min(1).max(100000).default(1),
  page_size:z.coerce.number().int().min(1).max(100).default(20),
  relationship:z.enum(['all','runner','buyer']).default('all'),
  timeline:z.enum(['all','upcoming','past']).default('all'),
  search:z.string().trim().max(120).default(''),
}).strict();
export type MyTicketEventsFilters=z.input<typeof myTicketEventsFilters>;
const cents=(value:unknown)=>value===null || value===undefined || value===''?null:Math.round(Number(value)*100);
/** CTE compartilhada: autorização + classificação (mesmas regras da lista de ingressos). */
const ticketScopeCte=`WITH authorized AS (
    SELECT r.*,to_jsonb(r) AS registration_data,o.status AS order_status,o.buyer_id,i.snapshot,
      COALESCE(NULLIF(to_jsonb(r)->'checkout_current_identity','null'::jsonb),i.snapshot->'identity') AS current_identity,
      e.title AS event_title,e.event_date,e.location,e.city,e.state,to_jsonb(e)->>'banner_url' AS banner_url,
      e.status AS event_status,NULLIF(BTRIM(COALESCE(e.result_url,'')),'') AS result_url,
      to_jsonb(e)->>'transfers_enabled' AS transfers_enabled,to_jsonb(e)->>'transfer_until' AS transfer_until,
      c.name AS category_name,m.name AS modality_name,k.name AS kit_name,to_jsonb(b)->>'name' AS batch_name,
      r.runner_id=$1 AS is_runner,CASE WHEN r.order_id IS NOT NULL THEN o.buyer_id=$1 ELSE r.registered_by=$1 END AS is_buyer,
      CASE WHEN r.order_id IS NULL THEN r.runner_id=$1
        ELSE r.runner_id=$1 OR COALESCE(NULLIF(to_jsonb(r)->'checkout_current_identity','null'::jsonb),i.snapshot->'identity')->>'runnerId' IS NULL OR o.status IN ('confirmed','refunded') END AS visible_identity,
      p.full_name AS profile_name,p.cpf AS profile_cpf,
      a.gross_cents,a.refunded_cents,a.settled_at
    FROM registrations r JOIN events e ON e.id=r.event_id
    LEFT JOIN checkout_orders o ON o.id=r.order_id
    LEFT JOIN checkout_order_items i ON i.registration_id=r.id
    LEFT JOIN profiles p ON p.id=r.runner_id
    LEFT JOIN categories c ON c.id=r.category_id LEFT JOIN modalities m ON m.id=r.modality_id
    LEFT JOIN event_kits k ON k.id=r.kit_id LEFT JOIN category_batches b ON b.id=r.category_batch_id
    LEFT JOIN checkout_payment_allocations a ON a.registration_id=r.id
    WHERE ((r.order_id IS NOT NULL AND (o.buyer_id=$1 OR r.runner_id=$1))
       OR (r.order_id IS NULL AND (r.runner_id=$1 OR (r.registered_by=$1 AND r.status='transferred'))))
      AND NOT EXISTS (SELECT 1 FROM leader_invitations li WHERE li.bonus_registration_id=r.id AND li.status='expired')
  ), classified AS (
    SELECT *,CASE WHEN visible_identity THEN CASE WHEN order_id IS NULL THEN profile_name ELSE current_identity->>'fullName' END END AS visible_name,
      CASE WHEN payment_status='refunded' OR order_status='refunded' THEN 'refunded'
        WHEN status='transferred' AND (registration_data->>'transferred_to_registration_id' IS NOT NULL OR NOT COALESCE(is_runner,false) OR runner_id=registered_by) THEN 'transferred'
        WHEN status='cancelled' OR order_status IN ('cancelled','expired') THEN 'cancelled'
        WHEN order_id IS NOT NULL THEN CASE
          WHEN order_status='confirmed' AND status='confirmed' AND payment_status='paid' THEN CASE
            WHEN NOT COALESCE(is_runner,false) AND COALESCE(is_buyer,false)
              AND EXISTS (SELECT 1 FROM checkout_ticket_transfers ctt WHERE ctt.registration_id=authorized.id)
              THEN 'transferred'
            ELSE 'active' END
          ELSE 'pending' END
        WHEN (status='confirmed' OR (status='transferred' AND runner_id<>registered_by)) AND payment_status IN ('paid','partially_paid','convidado','transferred') THEN 'active'
        ELSE 'pending' END AS filter_status
    FROM authorized
  )`;

/** Eventos com ingresso ativo, pendente ou transferido (histórico do comprador). */
export async function listMyTicketEvents(userId:string,input:MyTicketEventsFilters={}) {
  const parsed=myTicketEventsFilters.safeParse(input);
  if(!parsed.success) throw Object.assign(new Error('Filtros de eventos inválidos.'),{statusCode:400});
  const f=parsed.data;
  await linkVerifiedCheckoutTickets(userId);
  const result=await query(`${ticketScopeCte}, scoped AS (
    SELECT * FROM classified WHERE ($2='all' OR ($2='runner' AND is_runner) OR ($2='buyer' AND is_buyer))
  ), eligible AS (
    SELECT * FROM scoped WHERE filter_status IN ('active','pending','transferred')
      AND ($3='' OR strpos(lower(event_title),lower($3))>0)
  ), events AS (
    SELECT event_id,event_title,event_date,location,city,state,banner_url,event_status,result_url,
      count(*) FILTER (WHERE filter_status='active')::int AS confirmed_count,
      count(*) FILTER (WHERE filter_status='pending')::int AS pending_count,
      count(*) FILTER (WHERE filter_status='transferred')::int AS transferred_count,
      max(created_at) AS latest_at,
      (event_date < NOW() OR event_status IN ('finished','cancelled')) AS ended,
      (result_url IS NOT NULL) AS has_results
    FROM eligible
    GROUP BY event_id,event_title,event_date,location,city,state,banner_url,event_status,result_url
    HAVING count(*) FILTER (WHERE filter_status IN ('active','transferred'))>0
  ), filtered AS (
    SELECT * FROM events
    WHERE ($4='all' OR ($4='upcoming' AND NOT ended) OR ($4='past' AND ended))
  ), paged AS (
    SELECT * FROM filtered
    ORDER BY ended ASC,
      CASE WHEN NOT ended THEN event_date END ASC NULLS LAST,
      CASE WHEN ended THEN event_date END DESC NULLS LAST,
      latest_at DESC NULLS LAST,event_id DESC
    LIMIT $5 OFFSET $6
  )
  SELECT (SELECT count(*)::int FROM filtered) AS total,
    (SELECT COALESCE(jsonb_object_agg(filter_status,n),'{}'::jsonb) FROM (SELECT filter_status,count(*)::int n FROM scoped GROUP BY filter_status) counts) AS counts,
    (SELECT COALESCE(jsonb_agg(to_jsonb(paged) ORDER BY ended ASC,
      CASE WHEN NOT ended THEN event_date END ASC NULLS LAST,
      CASE WHEN ended THEN event_date END DESC NULLS LAST,
      latest_at DESC NULLS LAST,event_id DESC),'[]'::jsonb) FROM paged) AS items`,
    [userId,f.relationship,f.search,f.timeline,f.page_size,(f.page-1)*f.page_size]);
  const row=result.rows[0];
  const items=(row.items as any[]).map(e=>{
    const resultUrl=typeof e.result_url==='string' && e.result_url.trim()?e.result_url.trim():null;
    const ended=Boolean(e.ended);
    return {
      event_id:e.event_id,title:e.event_title,date:e.event_date,
      location:[e.location,e.city,e.state].filter(Boolean).join(' · '),
      banner_url:e.banner_url?getFileUrl(e.banner_url):null,
      status:e.event_status ?? null,
      result_url:resultUrl,
      ended,
      has_results:Boolean(e.has_results) && !!resultUrl,
      confirmed_count:Number(e.confirmed_count),
      pending_count:Number(e.pending_count),
      transferred_count:Number(e.transferred_count),
    };
  });
  return {items,page:f.page,page_size:f.page_size,total:row.total,counts:{active:0,pending:0,transferred:0,cancelled:0,refunded:0,...row.counts}};
}

/** Lista pessoal; vincula ingressos de pedido ao CPF validado antes de classificar. */
export async function listMyTickets(userId:string,input:MyTicketsFilters={}) {
  const parsed=myTicketsFilters.safeParse(input);
  if(!parsed.success) throw Object.assign(new Error('Filtros de ingressos inválidos.'),{statusCode:400});
  const f=parsed.data;
  await linkVerifiedCheckoutTickets(userId);
  const result=await query(`${ticketScopeCte}, scoped AS (
    SELECT * FROM classified WHERE ($2='all' OR ($2='runner' AND is_runner) OR ($2='buyer' AND is_buyer))
      AND ($3::uuid IS NULL OR event_id=$3) AND ($4::uuid IS NULL OR order_id=$4)
      AND ($5='' OR strpos(lower(concat_ws(' ',event_title,visible_name,CASE WHEN filter_status='active' THEN confirmation_code END)),lower($5))>0)
  ), filtered AS (SELECT * FROM scoped WHERE CASE WHEN $6='all' THEN filter_status<>'cancelled' ELSE filter_status=$6 END),
  ranked AS (
    SELECT *,CASE filter_status WHEN 'active' THEN 0 WHEN 'pending' THEN 1 WHEN 'transferred' THEN 2 ELSE 3 END AS status_rank
    FROM filtered
  ), paged AS (SELECT * FROM ranked ORDER BY status_rank,created_at DESC NULLS LAST,id DESC LIMIT $7 OFFSET $8)
  SELECT (SELECT count(*)::int FROM filtered) AS total,
    (SELECT COALESCE(jsonb_object_agg(filter_status,n),'{}'::jsonb) FROM (SELECT filter_status,count(*)::int n FROM scoped GROUP BY filter_status) counts) AS counts,
    (SELECT COALESCE(jsonb_agg(to_jsonb(paged) ORDER BY status_rank,created_at DESC NULLS LAST,id DESC),'[]'::jsonb) FROM paged) AS items`,
    [userId,f.relationship,f.event_id ?? null,f.order_id ?? null,f.search,f.status,f.page_size,(f.page-1)*f.page_size]);
  const row=result.rows[0];
  const legacyIds=row.items.filter((r:any)=>!r.order_id).map((r:any)=>r.id);
  const [pending,paid,settings,requests]=await Promise.all([
    getPendingDifferenceAmountsForRegistrationIds(legacyIds),getTotalPaidForRegistrationIds(legacyIds),getSystemSettings(),
    query(`SELECT t.id,t.registration_id,t.requested_by FROM transfer_requests t JOIN registrations r ON r.id=t.registration_id
      WHERE r.id=ANY($1::uuid[]) AND r.order_id IS NOT NULL AND t.status IN ('pending','approved')
        AND to_jsonb(t)->>'checkout_ticket_version'=to_jsonb(r)->>'checkout_ticket_version'`,[row.items.map((r:any)=>r.id)]),
  ]);
  const items=row.items.map((r:any)=> {
    const order=!!r.order_id;
    const released=order?r.order_status==='confirmed' && r.status==='confirmed' && r.payment_status==='paid':r.filter_status==='active' && ['paid','convidado','transferred'].includes(r.payment_status);
    const transfer=requests.rows.find(t=>t.registration_id===r.id);
    return {
      registration_id:r.id,source:order?'order':'legacy',order_id:r.order_id ?? null,
      relationship:{runner:!!r.is_runner,buyer:!!r.is_buyer},
      event:{id:r.event_id,title:r.event_title,date:r.event_date,location:[r.location,r.city,r.state].filter(Boolean).join(' · '),banner_url:r.banner_url?getFileUrl(r.banner_url):null,
        transfers_enabled:r.transfers_enabled!=='false',transfer_until:r.transfer_until ?? null,
        status:r.event_status ?? null,
        result_url:typeof r.result_url==='string' && r.result_url.trim()?r.result_url.trim():null,
        ended:Boolean(r.event_date && (new Date(r.event_date)<new Date() || ['finished','cancelled'].includes(r.event_status))),
        has_results:typeof r.result_url==='string' && !!r.result_url.trim()},
      participant:{name:r.visible_name ?? null,cpf_masked:r.visible_identity?formatCpf(order
        ? (r.participant_cpf || r.current_identity?.cpf || r.snapshot?.identity?.cpf)
        : r.profile_cpf):null,restricted:!r.visible_identity},
      selection:order?{category:r.snapshot?.labels?.category ?? null,modality:r.snapshot?.labels?.modality ?? null,batch:r.snapshot?.labels?.batch ?? null,kit:r.snapshot?.labels?.kit ?? null,products:r.snapshot?.labels?.products ?? []}
        :{category:r.category_name,modality:r.modality_name,batch:r.batch_name,kit:r.kit_name,products:null},
      state:{registration:r.status,payment:r.payment_status,order:r.order_status ?? null,group:r.filter_status},
      amounts:{currency:'BRL',total_cents:cents(order?r.snapshot?.pricing?.total:r.total_amount),paid_cents:order && r.settled_at?Number(r.gross_cents):null,refunded_cents:order && r.settled_at?Number(r.refunded_cents):null},
      ticket:{released,detail_available:released,download_available:released},
      transfer:{pending:!!transfer,request_id:transfer?.requested_by===userId?transfer.id:null},
      legacy:order?null:{runner_id:r.runner_id,registered_by:r.registered_by,category_id:r.category_id,kit_id:r.kit_id,
        payment_method:r.payment_method,has_pending_difference:(pending[r.id] ?? 0)>0.005,pending_difference_amount:pending[r.id] ?? 0,
        amount_paid:paid[r.id] ?? 0,registration_edit_fee:settings.registration_edit_fee ?? 0},
      kit:{collected_at:r.registration_data.checkout_kit_collected_at ?? null,returned_at:r.registration_data.checkout_kit_returned_at ?? null},
    };
  });
  return {items,page:f.page,page_size:f.page_size,total:row.total,counts:{active:0,pending:0,transferred:0,cancelled:0,refunded:0,...row.counts}};
}
