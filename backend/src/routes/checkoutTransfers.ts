import {Router,type Response} from 'express';
import {z} from 'zod';
import {authenticate,type AuthRequest} from '../middleware/auth.js';
import {asyncHandler} from '../middleware/errorHandler.js';
import {checkoutTransfers,checkoutTransferInput,checkoutTransferDecision,parseTransferInput} from '../services/checkoutTransferWorkflow.js';

export function createCheckoutTransfersRouter(service=checkoutTransfers) {
  const router=Router(),uuid=z.string().uuid();
  router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
  router.use(authenticate);
  router.post('/tickets/:id/requests',asyncHandler(async(req:AuthRequest,res:Response)=>{
    const data=await service.create(parseTransferInput(uuid,req.params.id),req.user!.id,parseTransferInput(checkoutTransferInput,req.body));
    res.status(201).json({success:true,data});
  }));
  router.get('/requests/:id',asyncHandler(async(req:AuthRequest,res:Response)=>{
    res.json({success:true,data:await service.read(parseTransferInput(uuid,req.params.id),req.user!.id)});
  }));
  router.post('/requests/:id/payment',asyncHandler(async(req:AuthRequest,res:Response)=>{
    parseTransferInput(z.object({}).strict(),req.body);
    res.json({success:true,data:await service.pay(parseTransferInput(uuid,req.params.id),req.user!.id)});
  }));
  router.patch('/requests/:id',asyncHandler(async(req:AuthRequest,res:Response)=>{
    res.json({success:true,data:await service.decide(parseTransferInput(uuid,req.params.id),req.user!.id,parseTransferInput(checkoutTransferDecision,req.body))});
  }));
  router.post('/requests/:id/cancel',asyncHandler(async(req:AuthRequest,res:Response)=>{
    parseTransferInput(z.object({}).strict(),req.body);
    res.json({success:true,data:await service.cancel(parseTransferInput(uuid,req.params.id),req.user!.id)});
  }));
  return router;
}
export default createCheckoutTransfersRouter();
