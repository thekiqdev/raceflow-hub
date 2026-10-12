import { apiClient } from './client';

export interface OrderChoices {
  category_id?:string; modality_id?:string|null; category_batch_id?:string|null; kit_id?:string|null;
  coupon_code?:string;
  product_selections?:Array<{product_id:string;variant_id?:string;attribute_selections?:Record<string,string>}>;
  custom_field_values?:Record<string,string>;
}
export interface CheckoutOrder {
  buyer?:{issues?:Array<{field:'cpf'|'full_name'|'birth_date'|'gender';message:string}>;full_name:string;email:string;cpf_masked:string|null;status:'ready'|'incomplete'|'ambiguous'|'already_registered';participant_id:string|null};
  id:string; event_id:string; status:'draft'|'reviewed'|'reserved'|'awaiting_payment'|'confirmed'|'cancelled'|'expired'|'needs_review'|'refunded';
  version:number; total_cents:number; review_expires_at:string|null; reservation_expires_at:string|null;
  items:Array<{id:string;participant_id:string;position:number;choices:OrderChoices;registration_id:string|null;
    pricing:{subtotal:number;seniorDiscount:number;couponDiscount:number;amountAfterDiscounts:number;platformFee:number;total:number;categoryPrice:number;kitPrice:number;couponApplied:boolean}|null;
    participant:{cpf_masked:string;registered:boolean;delivery_mode:'buyer'|'email'|'account';full_name?:string;email?:string|null}|null;
    labels:{category:string;modality:string|null;kit:string|null;batch:string|null;
      products:Array<{product_id:string;product_name:string;variant_id:string;variant_name:string}>}|null}>;
}
export const createCheckoutOrder=(event_id:string,request_key:string,include_buyer=false)=>apiClient.post<CheckoutOrder>('/checkout-orders',{event_id,request_key,include_buyer});
export const addCheckoutBuyer=(id:string,version:number)=>apiClient.post<CheckoutOrder>(`/checkout-orders/${id}/buyer`,{version});
export const getCheckoutOrder=(id:string)=>apiClient.get<CheckoutOrder>(`/checkout-orders/${id}`);
export const saveCheckoutOrder=(id:string,version:number,items:Array<{participant_id:string;choices:OrderChoices}>)=>apiClient.put<CheckoutOrder>(`/checkout-orders/${id}/items`,{version,items});
export const reviewCheckoutOrder=(id:string,version:number)=>apiClient.post<CheckoutOrder>(`/checkout-orders/${id}/review`,{version});
export const reserveCheckoutOrder=(id:string,version:number)=>apiClient.post<CheckoutOrder>(`/checkout-orders/${id}/reserve`,{version});
export const unreserveCheckoutOrder=(id:string)=>apiClient.post<CheckoutOrder>(`/checkout-orders/${id}/unreserve`,{});
export const cancelCheckoutOrder=(id:string)=>apiClient.post<CheckoutOrder>(`/checkout-orders/${id}/cancel`,{});
export const refundCheckoutOrder=(id:string,registration_id:string,request_key=crypto.randomUUID())=>
  apiClient.post<{id:string;status:string;amount_cents:number;registration_id:string}>(`/checkout-orders/${id}/refund`,{request_key,registration_id});

export interface CheckoutRegistrationEditPreview {
  old_total:number; new_subtotal:number; update_fee:number; new_total:number;
  amount_paid:number; amount_paid_for_organizer:number; difference_to_pay:number; difference_to_refund:number;
}
export const previewCheckoutRegistrationEdit=(orderId:string,registrationId:string,body:{
  category_id?:string; modality_id?:string|null; kit_id?:string|null; category_batch_id?:string|null;
  product_selections?:OrderChoices['product_selections']; custom_field_values?:Record<string,string>;
})=>apiClient.post<CheckoutRegistrationEditPreview>(`/checkout-orders/${orderId}/registrations/${registrationId}/preview-edit`,body);

export const updateCheckoutRegistrationChoices=(orderId:string,registrationId:string,body:{
  category_id?:string; modality_id?:string|null; kit_id?:string|null; category_batch_id?:string|null;
  product_selections?:OrderChoices['product_selections']; custom_field_values?:Record<string,string>;
})=>apiClient.put<{registration_id:string;order_id:string;payment_status:string;preview:CheckoutRegistrationEditPreview}>(
  `/checkout-orders/${orderId}/registrations/${registrationId}/choices`,body);

export interface CheckoutPayment {
  id:string; status:'preparing'|'creating'|'unknown'|'pending'|'paid'|'failed'|'cancelled'|'refunded'|'review';
  method:'PIX'|'CREDIT_CARD'|'FREE'; amount_cents:number; invoice_url:string|null;
  pix_qr_code:string|null; expires_at:string; cancel_requested:boolean; keep_reservation?:boolean;
  issue:string|null;
}
export const startCheckoutPayment=(id:string,request_key:string,method:'PIX'|'CREDIT_CARD',card?:{
  credit_card_token?:string;
  credit_card?:{holderName:string;number:string;expiryMonth:string;expiryYear:string;ccv:string};
  credit_card_holder_info?:{name:string;email:string;cpfCnpj:string;postalCode:string;addressNumber:string;
    addressComplement?:string;phone:string;mobilePhone?:string};
})=>apiClient.post<CheckoutPayment>(`/checkout-orders/${id}/payment`,{request_key,method,...(card||{})});
export const tokenizeCheckoutCard=(id:string,card:{
  credit_card:{holderName:string;number:string;expiryMonth:string;expiryYear:string;ccv:string};
  credit_card_holder_info:{name:string;email:string;cpfCnpj:string;postalCode:string;addressNumber:string;
    addressComplement?:string;phone:string;mobilePhone?:string};
})=>apiClient.post<{credit_card_token:string;brand:string|null;last4:string|null}>(`/checkout-orders/${id}/payment/tokenize`,card);
export const getCheckoutPayment=(id:string)=>apiClient.get<CheckoutPayment|null>(`/checkout-orders/${id}/payment`);
export const switchCheckoutPayment=(id:string)=>apiClient.post<CheckoutPayment|null>(`/checkout-orders/${id}/payment/switch`,{});
