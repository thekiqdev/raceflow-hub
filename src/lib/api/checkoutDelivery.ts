import { apiClient } from './client';
import type { CheckoutOrder } from './checkoutOrders';

export interface CheckoutTicket {
  id:string;order_id:string;event_id:string;event_title:string;event_date:string;location:string;
  runner_name?:string;cpf_masked?:string;status:string;payment_status:string;order_status?:string;
  released:boolean;confirmation_code:string|null;buyer?:boolean;kit_collected_at:string|null;kit_returned_at:string|null;
  labels:NonNullable<CheckoutOrder['items'][number]['labels']>;
  pricing:NonNullable<CheckoutOrder['items'][number]['pricing']>;
  custom_fields?:Array<{label:string;value:string}>;
}
export const getCheckoutTickets=(eventId?:string)=>apiClient.get<CheckoutTicket[]>(eventId?`/checkout-delivery/events/${eventId}`:'/checkout-delivery/mine');
export const getCheckoutTicket=(id:string)=>apiClient.get<CheckoutTicket>(`/checkout-delivery/tickets/${id}`);
export const accessCheckoutTicket=(token:string)=>apiClient.post<CheckoutTicket>('/checkout-delivery/ticket-access',{token});
export const collectCheckoutKit=(id:string)=>apiClient.post<CheckoutTicket>(`/checkout-delivery/tickets/${id}/collect`,{});
export const returnCheckoutKit=(id:string)=>apiClient.post<CheckoutTicket>(`/checkout-delivery/tickets/${id}/return`,{});
export const resendCheckoutTicket=(id:string,request_key:string)=>apiClient.post(`/checkout-delivery/tickets/${id}/resend`,{request_key});

export const getManagedCheckoutTicket=(id:string)=>apiClient.get<CheckoutTicket>(`/checkout-delivery/tickets/${id}/manage`);
