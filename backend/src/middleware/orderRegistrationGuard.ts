import { query } from '../config/database.js';
import { asyncHandler } from './errorHandler.js';
import type { Request,Response,NextFunction } from 'express';

const uuid=/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
/** Leitura/prévia operacional; mutações de escolhas/pagamentos do pedido ficam nas rotas de checkout. */
function isOrderOperationalAccess(req:Request) {
  const parts=req.path.split('/').filter(Boolean);
  if(!parts[0] || !uuid.test(parts[0])) return false;
  if(parts.length===1) return req.method==='GET';
  if(parts.length===2) {
    // Check-in público canônico: mesma tela legada /registration/validate/:id.
    if(req.method==='GET' && (parts[1]==='validate' || parts[1]==='editable-kit-context' || parts[1]==='pending-difference-payment')) return true;
    if(req.method==='POST' && (parts[1]==='preview-edit' || parts[1]==='confirm-difference-payment')) return true;
  }
  return false;
}

/** Evita cobrança/mutação individual e sub-rotas legadas; permite detalhe/prévia/confirmação de diferença operacional. */
export const orderRegistrationGuard=asyncHandler(async(req:Request,res:Response,next:NextFunction)=> {
  const id=req.path.split('/')[1];
  const candidate=uuid.test(id || '') ? id : req.body?.registration_id;
  if(typeof candidate==='string' && uuid.test(candidate)) {
    // Compatível com o período anterior à execução da migração 120.
    const row=(await query("SELECT to_jsonb(r)->>'order_id' AS order_id FROM registrations r WHERE id=$1",[candidate])).rows[0];
    if(row?.order_id && !isOrderOperationalAccess(req)) {
      res.status(409).json({success:false,code:'ORDER_REGISTRATION_REQUIRED',error:'Esta inscrição deve ser acessada pelo pedido.'});
      return;
    }
  }
  next();
});
