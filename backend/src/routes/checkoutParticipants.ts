import { Router } from 'express';
import { z } from 'zod';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { cpfLookupRateLimiter } from '../middleware/rateLimiter.js';
import { checkParticipantCpf, checkoutParticipants } from '../services/checkoutParticipantsService.js';

const router = Router();
router.use(authenticate);
router.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
const cpf = z.string().min(11).max(18);
const uuid = z.string().uuid();
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw Object.assign(new Error('Dados do participante inválidos. Confira os campos informados.'), { statusCode:400 });
  return result.data;
}
router.post('/check-cpf', cpfLookupRateLimiter, asyncHandler(async (req: AuthRequest,res:any) => {
  const body = parse(z.object({cpf}).strict(),req.body);
  res.json({success:true,data:await checkParticipantCpf(body.cpf)});
}));
router.post('/', cpfLookupRateLimiter, asyncHandler(async (req: AuthRequest,res:any) => {
  const body = parse(z.object({event_id:uuid,cpf,birth_date:z.string().max(10).optional(),excluded_participant_ids:z.array(uuid).max(20).optional()}).strict(),req.body);
  res.json({success:true,data:await checkoutParticipants.prepare(req.user!.id,body)});
}));
router.get('/:id', asyncHandler(async (req: AuthRequest,res:any) => {
  res.json({success:true,data:await checkoutParticipants.get(parse(uuid,req.params.id),req.user!.id)});
}));
router.patch('/:id', asyncHandler(async (req: AuthRequest,res:any) => {
  const body = parse(z.object({full_name:z.string().max(200).optional(),gender:z.enum(['M','F','O']).optional(),
    email:z.string().max(254).nullable().optional(),delivery_mode:z.enum(['buyer','email'])}).strict(),req.body);
  res.json({success:true,data:await checkoutParticipants.complete(parse(uuid,req.params.id),req.user!.id,body)});
}));
router.post('/:id/eligibility', asyncHandler(async (req: AuthRequest,res:any) => {
  const body = parse(z.object({category_id:uuid}).strict(),req.body);
  res.json({success:true,data:await checkoutParticipants.eligibility(parse(uuid,req.params.id),req.user!.id,body.category_id)});
}));
router.post('/:id/eligibility-batch', asyncHandler(async (req: AuthRequest,res:any) => {
  const body = parse(z.object({category_ids:z.array(uuid).max(100)}).strict(),req.body);
  res.json({success:true,data:await checkoutParticipants.eligibilityBatch(parse(uuid,req.params.id),req.user!.id,body.category_ids)});
}));
export default router;
