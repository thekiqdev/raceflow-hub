import { apiClient } from './client';

export type TicketGroup='active'|'pending'|'transferred'|'cancelled'|'refunded';
/** Consulta canônica; dados legados limitados aos necessários para reutilizar suas ações. */
export interface MyTicket {
  registration_id:string;source:'legacy'|'order';order_id:string|null;
  relationship:{runner:boolean;buyer:boolean};
  event:{id:string;title:string;date:string;location:string;banner_url:string|null;transfers_enabled:boolean;transfer_until:string|null;
    status?:string|null;result_url?:string|null;ended?:boolean;has_results?:boolean};
  participant:{name:string|null;cpf_masked:string|null;restricted:boolean};
  selection:{category:string|null;modality:string|null;batch:string|null;kit:string|null;products:Array<{product_id:string;product_name:string;variant_id:string;variant_name:string}>|null};
  state:{registration:string;payment:string;order:string|null;group:TicketGroup};
  amounts:{currency:'BRL';total_cents:number|null;paid_cents:number|null;refunded_cents:number|null};
  // Indicadores de apresentação; detalhe/download sempre revalidam a inscrição atual.
  ticket:{released:boolean;detail_available:boolean;download_available:boolean};
  kit:{collected_at:string|null;returned_at:string|null};
  transfer:{pending:boolean;request_id:string|null};
  legacy:{runner_id:string;registered_by:string;category_id:string;kit_id?:string;payment_method?:import('./registrations').Registration['payment_method'];
    has_pending_difference:boolean;pending_difference_amount:number;amount_paid:number;registration_edit_fee:number}|null;
}
export interface MyTicketsPage {items:MyTicket[];page:number;page_size:number;total:number;counts:Record<TicketGroup,number>}
export type EventTimeline='all'|'upcoming'|'past';
export interface MyTicketEvent {
  event_id:string;title:string;date:string;location:string;banner_url:string|null;
  status?:string|null;result_url?:string|null;ended?:boolean;has_results?:boolean;
  confirmed_count:number;pending_count:number;transferred_count?:number;
}
export interface MyTicketEventsPage {items:MyTicketEvent[];page:number;page_size:number;total:number;counts:Record<TicketGroup,number>}
export function getMyTickets(filters:{page?:number;page_size?:number;relationship?:'all'|'runner'|'buyer';status?:'all'|TicketGroup;event_id?:string;order_id?:string;search?:string}={}) {
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(filters)) if(value!==undefined) params.set(key,String(value));
  return apiClient.get<MyTicketsPage>(`/tickets/mine${params.size?`?${params}`:''}`);
}
export function getMyTicketEvents(filters:{page?:number;page_size?:number;relationship?:'all'|'runner'|'buyer';timeline?:EventTimeline;search?:string}={}) {
  const params=new URLSearchParams();
  for(const [key,value] of Object.entries(filters)) if(value!==undefined) params.set(key,String(value));
  return apiClient.get<MyTicketEventsPage>(`/tickets/mine/events${params.size?`?${params}`:''}`);
}
