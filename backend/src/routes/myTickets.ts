import { Router, type Response } from 'express';
import { authenticate, type AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { listMyTicketEvents, listMyTickets } from '../services/myTicketsService.js';
const router=Router();
router.use((_req,res,next)=>{res.setHeader('Cache-Control','no-store');next();});
router.use(authenticate);
router.get('/mine/events',asyncHandler(async(req:AuthRequest,res:Response)=>{
  res.json({success:true,data:await listMyTicketEvents(req.user!.id,req.query)});
}));
router.get('/mine',asyncHandler(async(req:AuthRequest,res:Response)=>{
  res.json({success:true,data:await listMyTickets(req.user!.id,req.query)});
}));
export default router;
