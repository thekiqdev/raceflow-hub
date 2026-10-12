import {apiClient} from './client';
import type {TransferRequest} from './transferRequests';
export interface CheckoutTransfer extends TransferRequest {
  payment:null|{status:'prepared'|'creating'|'pending'|'paid'|'review'|'refunded';value:number;invoice_url:string|null;pix_qr_code:string|null;issue:string|null};
}
export const requestCheckoutTransfer=(id:string,input:{request_key:string;new_runner_cpf:string;reason?:string})=>
  apiClient.post<CheckoutTransfer>(`/checkout-transfers/tickets/${id}/requests`,input);
export const readCheckoutTransfer=(id:string)=>apiClient.get<CheckoutTransfer>(`/checkout-transfers/requests/${id}`);
export const payCheckoutTransfer=(id:string)=>apiClient.post<CheckoutTransfer>(`/checkout-transfers/requests/${id}/payment`,{});
export const cancelCheckoutTransfer=(id:string)=>apiClient.post<CheckoutTransfer>(`/checkout-transfers/requests/${id}/cancel`,{});
export const decideCheckoutTransfer=(id:string,input:{status:'approved'|'rejected'|'cancelled';admin_notes?:string;new_runner_id?:string})=>
  apiClient.patch<CheckoutTransfer>(`/checkout-transfers/requests/${id}`,input);
