import { Router, type Response } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { requireRole } from '../middleware/authorization.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { query } from '../config/database.js';
import { checkoutDelivery, retryCheckoutDelivery } from '../services/checkoutDeliveryService.js';
import { managedCheckoutTicket, authorizedTicket, collectCheckoutKit, returnCheckoutKit, listCheckoutTickets, ticketByAccessToken } from '../services/checkoutTicketsService.js';

const router=Router(),uuid=z.string().uuid();
function parse<T>(schema:z.ZodType<T>,input:unknown):T {
  const value=schema.safeParse(input);
  if(!value.success) throw Object.assign(new Error('Dados inválidos.'),{statusCode:400});
  return value.data;
}
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
// Limite próprio: continua ativo mesmo quando o limitador global estiver desligado.
const requests=new Map<string,{count:number;until:number}>();
router.use((req,res,next)=>{
  const now=Date.now();
  for(const [key,value] of requests) if(value.until<now) requests.delete(key);
  const key=req.ip || 'unknown',entry=requests.get(key) ?? {count:0,until:now+60000};
  requests.set(key,entry);
  if(++entry.count>60){res.status(429).json({success:false,error:'Aguarde um minuto para tentar novamente.'});return;}
  next();
});
router.post('/ticket-access',asyncHandler(async(req:AuthRequest,res:Response)=>{
  const {token}=parse(z.object({token:z.string().min(20).max(2048)}).strict(),req.body);
  res.json({success:true,data:await ticketByAccessToken(token)});
}));
router.use(authenticate);
router.get('/mine',asyncHandler(async(req:AuthRequest,res:Response)=>{
  res.json({success:true,data:await listCheckoutTickets(req.user!.id)});
}));
router.get('/events/:id',asyncHandler(async(req:AuthRequest,res:Response)=>{
  res.json({success:true,data:await listCheckoutTickets(req.user!.id,parse(uuid,req.params.id))});
}));
router.get('/tickets/:id/manage',asyncHandler(async(req:AuthRequest,res:Response)=>{
  res.json({success:true,data:await managedCheckoutTicket(parse(uuid,req.params.id),req.user!.id)});
}));
router.get('/tickets/:id',asyncHandler(async(req:AuthRequest,res:Response)=>{
  res.json({success:true,data:await authorizedTicket(parse(uuid,req.params.id),req.user!.id)});
}));
router.post('/tickets/:id/collect',asyncHandler(async(req:AuthRequest,res:Response)=>{
  parse(z.object({}).strict(),req.body);
  res.json({success:true,data:await collectCheckoutKit(parse(uuid,req.params.id),req.user!.id)});
}));
router.post('/tickets/:id/return',asyncHandler(async(req:AuthRequest,res:Response)=>{
  parse(z.object({}).strict(),req.body);
  res.json({success:true,data:await returnCheckoutKit(parse(uuid,req.params.id),req.user!.id)});
}));
router.post('/tickets/:id/resend',asyncHandler(async(req:AuthRequest,res:Response)=>{
  const {request_key}=parse(z.object({request_key:uuid}).strict(),req.body);
  await checkoutDelivery.resend(parse(uuid,req.params.id),req.user!.id,request_key);
  res.status(202).json({success:true,data:{queued:true}});
}));
router.get('/messages',requireRole('admin'),asyncHandler(async(_req:AuthRequest,res:Response)=>{
  const rows=(await query(`SELECT id,order_id,registration_id,kind,status,attempts,last_error,created_at,next_attempt_at
    FROM checkout_delivery_jobs WHERE status IN ('pending','sending','unknown') ORDER BY created_at LIMIT 200`)).rows;
  res.json({success:true,data:rows});
}));
router.post('/messages/:id/retry',requireRole('admin'),asyncHandler(async(req:AuthRequest,res:Response)=>{
  const body=parse(z.object({accept_possible_duplicate:z.boolean().optional()}).strict(),req.body);
  await retryCheckoutDelivery(parse(uuid,req.params.id),body.accept_possible_duplicate===true);
  res.json({success:true,data:{queued:true}});
}));
export default router;
