import { Router } from 'express';
import { isEnvironmentFlagEnabled } from '../config/environment.js';
import type { Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { requireRole } from '../middleware/authorization.js';
import { hasRole } from '../services/userRolesService.js';
import { query } from '../config/database.js';
import { checkoutPayments } from '../services/checkoutPaymentsService.js';
import { createCheckoutOrder,addCheckoutBuyer,saveCheckoutOrder,reviewCheckoutOrder,reserveCheckoutOrder,unreserveCheckoutOrder,getCheckoutOrder } from '../services/checkoutOrdersService.js';
import { previewCheckoutRegistrationEdit, applyCheckoutRegistrationEdit } from '../services/checkoutOrderEditService.js';

const router=Router();
// Controle de novas compras; consultas, cancelamentos e estornos seguem disponíveis.
router.use((req,res,next)=> {
  res.setHeader('Cache-Control','no-store');
  const maintenance=req.method==='GET' || /\/(cancel|refund|payment\/switch|payment\/tokenize)$/.test(req.path);
  if(!maintenance && !isEnvironmentFlagEnabled('MULTI_REGISTRATION_CHECKOUT_ENABLED')) { res.status(503).json({success:false,code:'CHECKOUT_DISABLED',error:'Compra em grupo ainda não habilitada.'}); return; }
  next();
});
router.use(authenticate);
const uuid=z.string().uuid(), version=z.number().int().positive();
const selections=z.array(z.object({product_id:uuid,variant_id:uuid.optional(),attribute_selections:z.record(z.string().max(100),z.string().max(200)).optional()}).strict()).max(30);
const choices=z.object({category_id:uuid.optional(),modality_id:uuid.nullable().optional(),kit_id:uuid.nullable().optional(),category_batch_id:uuid.nullable().optional(),
  coupon_code:z.string().trim().min(1).max(80).optional(),product_selections:selections.optional(),custom_field_values:z.record(uuid,z.string().max(2000)).optional()}).strict();
function parse<T>(schema:z.ZodType<T>,input:unknown):T {
  const result=schema.safeParse(input);
  if(!result.success) throw Object.assign(new Error('Dados do pedido inválidos.'),{statusCode:400});
  return result.data;
}
/** Comprador, admin ou organizador do evento podem operar o cancelamento no contexto do buyer_id do pedido. */
async function resolveCancelBuyerId(orderId:string,userId:string) {
  const row=(await query(`SELECT o.buyer_id, e.organizer_id
    FROM checkout_orders o JOIN events e ON e.id=o.event_id WHERE o.id=$1`,[orderId])).rows[0];
  if(!row) throw Object.assign(new Error('Pedido não encontrado.'),{statusCode:404});
  if(row.buyer_id===userId) return row.buyer_id as string;
  if(await hasRole(userId,'admin')) return row.buyer_id as string;
  if(row.organizer_id===userId && await hasRole(userId,'organizer')) return row.buyer_id as string;
  throw Object.assign(new Error('Forbidden'),{statusCode:403,message:'Sem permissão para cancelar este pedido.'});
}
router.post('/',asyncHandler(async(req:AuthRequest,res:Response)=> {
  const body=parse(z.object({event_id:uuid,request_key:uuid,include_buyer:z.boolean().optional()}).strict(),req.body);
  res.json({success:true,data:await createCheckoutOrder(req.user!.id,body.event_id,body.request_key,body.include_buyer===true)});
}));
router.post('/:id/buyer',asyncHandler(async(req:AuthRequest,res:Response)=> {
  const body=parse(z.object({version}).strict(),req.body);
  res.json({success:true,data:await addCheckoutBuyer(parse(uuid,req.params.id),req.user!.id,body.version)});
}));
router.get('/:id',asyncHandler(async(req:AuthRequest,res:Response)=> {
  res.json({success:true,data:await getCheckoutOrder(parse(uuid,req.params.id),req.user!.id)});
}));
router.put('/:id/items',asyncHandler(async(req:AuthRequest,res:Response)=> {
  const body=parse(z.object({version,items:z.array(z.object({participant_id:uuid,choices}).strict()).max(20)}).strict(),req.body);
  res.json({success:true,data:await saveCheckoutOrder(parse(uuid,req.params.id),req.user!.id,body.version,body.items)});
}));
for(const [path,operation] of [['review',reviewCheckoutOrder],['reserve',reserveCheckoutOrder]] as const) {
  router.post(`/:id/${path}`,asyncHandler(async(req:AuthRequest,res:Response)=> {
    const body=parse(z.object({version}).strict(),req.body);
    res.json({success:true,data:await operation(parse(uuid,req.params.id),req.user!.id,body.version)});
  }));
}
router.post('/:id/unreserve',asyncHandler(async(req:AuthRequest,res:Response)=> {
  parse(z.object({}).strict(),req.body);
  res.json({success:true,data:await unreserveCheckoutOrder(parse(uuid,req.params.id),req.user!.id)});
}));
router.post('/:id/cancel',asyncHandler(async(req:AuthRequest,res:Response)=> {
  parse(z.object({}).strict(),req.body);
  const id=parse(uuid,req.params.id);
  const buyerId=await resolveCancelBuyerId(id,req.user!.id);
  await checkoutPayments.cancel(id,buyerId);
  res.json({success:true,data:await getCheckoutOrder(id,buyerId)});
}));
router.post('/:id/payment',asyncHandler(async(req:AuthRequest,res:Response)=> {
  const card=z.object({
    holderName:z.string().trim().min(3).max(120),
    number:z.string().regex(/^\d{13,19}$/),
    expiryMonth:z.string().regex(/^(0[1-9]|1[0-2])$/),
    expiryYear:z.string().regex(/^\d{4}$/),
    ccv:z.string().regex(/^\d{3,4}$/),
  }).strict();
  const holder=z.object({
    name:z.string().trim().min(3).max(120),
    email:z.string().trim().email().max(200),
    cpfCnpj:z.string().regex(/^\d{11}$|^\d{14}$/),
    postalCode:z.string().regex(/^\d{8}$/),
    addressNumber:z.string().trim().min(1).max(40),
    addressComplement:z.string().trim().max(120).optional(),
    phone:z.string().regex(/^\d{10,11}$/),
    mobilePhone:z.string().regex(/^\d{10,11}$/).optional(),
  }).strict();
  const body=parse(z.object({
    request_key:uuid,
    method:z.enum(['PIX','CREDIT_CARD']),
    credit_card_token:z.string().trim().min(8).max(120).optional(),
    credit_card:card.optional(),
    credit_card_holder_info:holder.optional(),
  }).strict().superRefine((value,ctx)=> {
    if(value.method!=='CREDIT_CARD') return;
    if(value.credit_card_token) return;
    if(value.credit_card && value.credit_card_holder_info) return;
    ctx.addIssue({code:z.ZodIssueCode.custom,message:'Tokenize o cartão antes de confirmar o pagamento.',path:['credit_card_token']});
  }),req.body);
  const remoteIp=String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  const cardInput=body.method==='CREDIT_CARD'
    ? {
      credit_card_token:body.credit_card_token,
      credit_card:body.credit_card,
      credit_card_holder_info:body.credit_card_holder_info,
      remote_ip:remoteIp || undefined,
    }
    : undefined;
  res.json({success:true,data:await checkoutPayments.start(parse(uuid,req.params.id),req.user!.id,body.request_key,body.method,cardInput)});
}));
router.post('/:id/payment/tokenize',asyncHandler(async(req:AuthRequest,res:Response)=> {
  const card=z.object({
    holderName:z.string().trim().min(3).max(120),
    number:z.string().regex(/^\d{13,19}$/),
    expiryMonth:z.string().regex(/^(0[1-9]|1[0-2])$/),
    expiryYear:z.string().regex(/^\d{4}$/),
    ccv:z.string().regex(/^\d{3,4}$/),
  }).strict();
  const holder=z.object({
    name:z.string().trim().min(3).max(120),
    email:z.string().trim().email().max(200),
    cpfCnpj:z.string().regex(/^\d{11}$|^\d{14}$/),
    postalCode:z.string().regex(/^\d{8}$/),
    addressNumber:z.string().trim().min(1).max(40),
    addressComplement:z.string().trim().max(120).optional(),
    phone:z.string().regex(/^\d{10,11}$/),
    mobilePhone:z.string().regex(/^\d{10,11}$/).optional(),
  }).strict();
  const body=parse(z.object({
    credit_card:card,
    credit_card_holder_info:holder,
  }).strict(),req.body);
  const remoteIp=String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  res.json({success:true,data:await checkoutPayments.tokenize(parse(uuid,req.params.id),req.user!.id,body,remoteIp)});
}));
router.get('/:id/payment',asyncHandler(async(req:AuthRequest,res:Response)=> {
  res.json({success:true,data:await checkoutPayments.reconcile(parse(uuid,req.params.id),req.user!.id)});
}));
router.post('/:id/payment/switch',asyncHandler(async(req:AuthRequest,res:Response)=> {
  parse(z.object({}).strict(),req.body);
  const id=parse(uuid,req.params.id);
  res.json({success:true,data:await checkoutPayments.switchMethod(id,req.user!.id)});
}));
router.post('/:id/refund',requireRole('admin'),asyncHandler(async(req:AuthRequest,res:Response)=> {
  const body=parse(z.object({request_key:uuid,registration_id:uuid}).strict(),req.body);
  res.json({success:true,data:await checkoutPayments.refund(parse(uuid,req.params.id),body.registration_id,body.request_key,req.user!.id)});
}));
const editBody=z.object({
  category_id:uuid.optional(),
  modality_id:uuid.nullable().optional(),
  kit_id:uuid.nullable().optional(),
  category_batch_id:uuid.nullable().optional(),
  product_selections:selections.optional(),
  custom_field_values:z.record(uuid,z.string().max(2000)).optional(),
}).strict();
async function assertOrderEditAccess(orderId:string,userId:string,write:boolean) {
  const row=(await query(`SELECT o.buyer_id, e.organizer_id FROM checkout_orders o JOIN events e ON e.id=o.event_id WHERE o.id=$1`,[orderId])).rows[0];
  if(!row) throw Object.assign(new Error('Pedido não encontrado.'),{statusCode:404});
  if(await hasRole(userId,'admin')) return;
  if(!write && row.organizer_id===userId && await hasRole(userId,'organizer')) return;
  throw Object.assign(new Error('Forbidden'),{statusCode:403,message:write?'Apenas administradores podem editar escolhas do pedido.':'Sem permissão para pré-visualizar esta edição.'});
}
router.post('/:id/registrations/:registrationId/preview-edit',asyncHandler(async(req:AuthRequest,res:Response)=> {
  const orderId=parse(uuid,req.params.id);
  await assertOrderEditAccess(orderId,req.user!.id,false);
  const body=parse(editBody,req.body);
  res.json({success:true,data:await previewCheckoutRegistrationEdit(orderId,parse(uuid,req.params.registrationId),body)});
}));
router.put('/:id/registrations/:registrationId/choices',requireRole('admin'),asyncHandler(async(req:AuthRequest,res:Response)=> {
  const orderId=parse(uuid,req.params.id);
  await assertOrderEditAccess(orderId,req.user!.id,true);
  const body=parse(editBody,req.body);
  res.json({success:true,data:await applyCheckoutRegistrationEdit(orderId,parse(uuid,req.params.registrationId),req.user!.id,body)});
}));
export default router;
