import { apiClient } from './client';

export interface CheckoutParticipant {
  id: string;
  registered: boolean;
  cpf_masked: string;
  ready: boolean;
  delivery_mode: 'buyer' | 'email' | 'account';
  expires_at: string;
  full_name?: string | null;
  birth_date?: string | null;
  gender?: 'M' | 'F' | 'O' | null;
  gender_locked?: boolean;
  manual_entry_allowed?: boolean;
  email?: string | null;
}
export const checkParticipantCpf = (cpf: string) =>
  apiClient.post<{registered:boolean}>('/checkout-participants/check-cpf', {cpf});
export const prepareParticipant = (data: {event_id:string; cpf:string; birth_date?:string;excluded_participant_ids?:string[]}) =>
  apiClient.post<CheckoutParticipant>('/checkout-participants', data);
export const getParticipant = (id:string) => apiClient.get<CheckoutParticipant>(`/checkout-participants/${id}`);
export const completeParticipant = (id:string, data:{full_name?:string; gender?:'M'|'F'|'O'; email?:string|null; delivery_mode:'buyer'|'email'}) =>
  apiClient.patch<CheckoutParticipant>(`/checkout-participants/${id}`,data);
export const checkParticipantEligibility = (id:string, category_id:string) =>
  apiClient.post<{eligible:boolean;message?:string}>(`/checkout-participants/${id}/eligibility`,{category_id});
export const checkParticipantEligibilityBatch = (id:string, category_ids:string[]) =>
  apiClient.post<{results:Array<{category_id:string;eligible:boolean;message?:string}>}>(`/checkout-participants/${id}/eligibility-batch`,{category_ids});
