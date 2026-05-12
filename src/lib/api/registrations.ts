import { apiClient, type ApiResponse } from './client.js';
import type { KitProduct } from './eventKits.js';

export interface Registration {
  id: string;
  event_id: string;
  runner_id: string;
  registered_by: string;
  category_id: string;
  kit_id?: string;
  status?: 'pending' | 'confirmed' | 'cancelled' | 'refund_requested' | 'refunded' | 'transferred';
  payment_status?: 'pending' | 'paid' | 'partially_paid' | 'refunded' | 'failed' | 'convidado' | 'transferred';
  payment_method?: 'pix' | 'credit_card' | 'boleto' | 'free_bonus';
  total_amount: number;
  confirmation_code?: string;
  created_at?: string;
  updated_at?: string;
  event_title?: string;
  event_date?: string;
  event_banner_url?: string | null;
  category_name?: string;
  category_distance?: string;
  modality_id?: string | null;
  modality_name?: string | null;
  runner_name?: string;
  runner_cpf?: string;
  kit_name?: string;
  event_organizer_id?: string;
  event_transfers_enabled?: boolean | null;
  product_selections?: Array<{
    product_id: string;
    product_name: string;
    variant_id: string | null;
    variant_name: string | null;
    attribute_name: string;
    attribute_value: string;
  }>;
  /** Soma das cobranças pendentes (diferença a pagar). */
  pending_difference_amount?: number;
  /** True quando há cobrança pendente para esta inscrição. */
  has_pending_difference?: boolean;
  /** Valor já pago (soma dos pagamentos confirmados). */
  amount_paid?: number;
  /** Taxa de atualização (R$) configurada em Configurações > Taxas. */
  registration_edit_fee?: number;
  /** Taxa da plataforma aplicada na inscrição inicial (R$). OK Etapa 1. */
  platform_fee_amount?: number;
  /** Taxa de atualização aplicada na edição quando o valor mudou (R$). */
  registration_edit_fee_amount?: number;
  /** Etapa 4: true = corredor deve escolher categoria/modalidade/kit; false/null = líder já definiu (ou convite antigo). */
  invitation_runner_chooses_category_modality_kit?: boolean | null;
  /** Valores dos campos personalizados da categoria (category_custom_field_id -> value). */
  custom_field_values?: Record<string, string>;
  coupon_code?: string | null;
  leader_id?: string | null;
  leader_name?: string | null;
  runner_email?: string | null;
  /** Lote de preço da categoria (quando houver lotes). */
  category_batch_id?: string | null;
}

// Credit Card Data Types
export interface CreditCardData {
  holderName: string;
  number: string;
  expiryMonth: string; // MM (01-12)
  expiryYear: string; // YYYY
  ccv: string; // 3 or 4 digits
}

export interface CreditCardHolderInfo {
  name: string;
  email: string;
  cpfCnpj: string;
  postalCode: string;
  addressNumber: string;
  addressComplement?: string;
  phone: string;
  mobilePhone?: string;
}

export interface ProductSelection {
  product_id: string;
  variant_id?: string;
  attribute_selections?: Record<string, string>; // { attributeName: attributeValue }
}

export interface CreateRegistrationData {
  event_id: string;
  runner_id?: string;
  category_id: string;
  kit_id?: string;
  modality_id?: string | null;
  payment_method?: 'pix' | 'credit_card' | 'boleto' | 'free_bonus';
  total_amount: number;
  coupon_code?: string;
  product_selections?: ProductSelection[];
  // Credit card data (only when payment_method is 'credit_card')
  credit_card?: CreditCardData;
  credit_card_holder_info?: CreditCardHolderInfo;
  /** Valores dos campos personalizados da categoria (category_custom_field_id -> value). */
  custom_field_values?: Record<string, string>;
}

export interface UpdateRegistrationData {
  status?: 'pending' | 'confirmed' | 'cancelled' | 'refund_requested' | 'refunded' | 'transferred';
  payment_status?: 'pending' | 'paid' | 'partially_paid' | 'refunded' | 'failed' | 'convidado' | 'transferred';
  payment_method?: 'pix' | 'credit_card' | 'boleto' | 'free_bonus';
  /** Categoria da inscrição (admin pode alterar) */
  category_id?: string;
  /** Kit da inscrição (admin pode alterar; null = sem kit) */
  kit_id?: string | null;
  /** Modalidade da inscrição (admin pode alterar; null = não definida) */
  modality_id?: string | null;
  /** Lote da categoria (admin escolhe na edição; usado para preço) */
  batch_id?: string | null;
  /** Valores dos campos personalizados da categoria (category_custom_field_id -> value). Substitui todos ao editar. */
  custom_field_values?: Record<string, string>;
  /** Cupom (código). Null para remover vínculo, se permitido pelo backend. */
  coupon_code?: string | null;
  /**
   * Opcional ao mudar categoria/kit: novas seleções canônicas (mesmo formato da criação).
   * Obrigatório quando o backend retorna PRODUCT_RESELECTION_REQUIRED (409).
   */
  product_selections?: Array<{
    product_id: string;
    variant_id?: string;
    attribute_selections?: Record<string, string>;
  }>;
}

export interface PreviewRegistrationEditBody {
  category_id?: string;
  kit_id?: string | null;
  modality_id?: string | null;
  batch_id?: string | null;
}

export interface PreviewRegistrationEditResponse {
  old_total: number;
  new_subtotal: number;
  update_fee: number;
  new_total: number;
  amount_paid: number;
  amount_paid_for_organizer: number;
  difference_to_pay: number;
  difference_to_refund: number;
}

export const previewRegistrationEdit = async (
  id: string,
  body: PreviewRegistrationEditBody
) => {
  return apiClient.post<PreviewRegistrationEditResponse>(`/registrations/${id}/preview-edit`, body);
};

/** Totais por segmento (mesmos filtros estruturais da listagem; sem status/pagamento/tipo). */
export interface RegistrationSegmentTotals {
  total: number;
  paid: number;
  pending: number;
  partially_paid: number;
  courtesy: number;
  cancelled: number;
  refunded: number;
  transferred: number;
}

/** Resposta paginada de GET /registrations (quando page e page_size são enviados). */
export interface PaginatedRegistrationsData {
  items: Registration[];
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
  summary: {
    total_registrations: number;
    confirmed_payments: number;
    pending_payments: number;
    refunds: number;
  };
  /** Presente nas APIs recentes; usado nos cards de atalho operacional. */
  segment_totals?: RegistrationSegmentTotals;
}

export type GetRegistrationsFilters = {
  event_id?: string;
  runner_id?: string;
  organizer_id?: string;
  status?: string;
  payment_status?: string;
  search?: string;
  category_id?: string;
  modality_id?: string;
  kit_id?: string;
  created_at_from?: string;
  created_at_to?: string;
  /** commercial | courtesy | leader_coupon */
  registration_kind?: string;
};

export async function getRegistrations(
  filters?: GetRegistrationsFilters,
  pagination?: undefined
): Promise<ApiResponse<Registration[]>>;
export async function getRegistrations(
  filters: GetRegistrationsFilters | undefined,
  pagination: { page: number; page_size: 30 | 50 }
): Promise<ApiResponse<PaginatedRegistrationsData>>;
export async function getRegistrations(
  filters?: GetRegistrationsFilters,
  pagination?: { page: number; page_size: 30 | 50 }
): Promise<ApiResponse<Registration[] | PaginatedRegistrationsData>> {
  const queryParams = new URLSearchParams();
  if (filters?.event_id) queryParams.append('event_id', filters.event_id);
  if (filters?.runner_id) queryParams.append('runner_id', filters.runner_id);
  if (filters?.organizer_id) queryParams.append('organizer_id', filters.organizer_id);
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.payment_status) queryParams.append('payment_status', filters.payment_status);
  if (filters?.search) queryParams.append('search', filters.search);
  if (filters?.category_id) queryParams.append('category_id', filters.category_id);
  if (filters?.modality_id) queryParams.append('modality_id', filters.modality_id);
  if (filters?.kit_id) queryParams.append('kit_id', filters.kit_id);
  if (filters?.created_at_from) queryParams.append('created_at_from', filters.created_at_from);
  if (filters?.created_at_to) queryParams.append('created_at_to', filters.created_at_to);
  if (filters?.registration_kind) queryParams.append('registration_kind', filters.registration_kind);
  if (pagination) {
    queryParams.append('page', String(pagination.page));
    queryParams.append('page_size', String(pagination.page_size));
  }

  const queryString = queryParams.toString();
  const endpoint = `/registrations${queryString ? `?${queryString}` : ''}`;

  if (pagination) {
    return apiClient.get<PaginatedRegistrationsData>(endpoint);
  }
  return apiClient.get<Registration[]>(endpoint);
}

// Check if user already has an active registration for an event
export const checkExistingRegistration = async (eventId: string) => {
  return apiClient.get<{ hasExistingRegistration: boolean; registration: Registration | null }>(`/registrations/check-existing?event_id=${encodeURIComponent(eventId)}`);
};

// Get registration by ID (requires authentication)
export const getRegistrationById = async (id: string) => {
  return apiClient.get<Registration>(`/registrations/${id}`);
};

/** Contexto editável do kit da inscrição (produtos/variantes/atributos + inconsistências). Backend: registrations/:id/editable-kit-context */
export type EditableKitIssueCode =
  | 'NO_KIT_ASSIGNED'
  | 'KIT_NOT_FOUND_OR_WRONG_EVENT'
  | 'KIT_CATEGORY_MISMATCH'
  | 'SELECTION_PRODUCT_NOT_IN_KIT'
  | 'INVALID_VARIANT'
  | 'MISSING_VARIANT_ATTRIBUTES'
  | 'VARIANT_ATTRIBUTES_INFERRED';

export interface EditableKitIssue {
  code: EditableKitIssueCode;
  message: string;
  detail?: Record<string, unknown>;
}

export interface EditableCanonicalSelectionRow {
  product_id: string;
  product_name: string | null;
  variant_id: string | null;
  variant_name: string | null;
  attribute_name: string;
  attribute_value: string;
  product_unlinked?: boolean;
}

export interface RegistrationEditableKitContext {
  registration_id: string;
  event_id: string;
  category_id: string | null;
  kit_id: string | null;
  kit_category_ids: string[];
  kit_category_consistent: boolean;
  kit: {
    id: string;
    event_id: string;
    name: string;
    description: string | null;
    price: number;
    display_order: number;
    created_at: string | null;
  } | null;
  products: KitProduct[];
  canonical_selections: EditableCanonicalSelectionRow[];
  issues: EditableKitIssue[];
}

export const getRegistrationEditableKitContext = async (registrationId: string) => {
  return apiClient.get<RegistrationEditableKitContext>(`/registrations/${registrationId}/editable-kit-context`);
};

/** Admin read-only: inscrições com kit variável configurado e sem registration_product_selections. */
export type MissingKitProductSelectionAuditItem = {
  registration_id: string;
  event_id: string;
  kit_id: string;
  status: string;
  runner_name: string | null;
  confirmation_code: string | null;
  created_at: string;
};

export type MissingKitProductSelectionAuditPayload = {
  items: MissingKitProductSelectionAuditItem[];
  count: number;
  criteria: string;
};

export async function getAuditMissingKitProductSelections(params?: {
  event_id?: string;
  limit?: number;
}) {
  const queryParams = new URLSearchParams();
  if (params?.event_id) queryParams.append('event_id', params.event_id);
  if (params?.limit != null) queryParams.append('limit', String(params.limit));
  const qs = queryParams.toString();
  return apiClient.get<MissingKitProductSelectionAuditPayload>(
    `/registrations/audit/missing-kit-product-selections${qs ? `?${qs}` : ''}`
  );
}

// Get registration by ID for validation (public - no authentication required)
export const getRegistrationForValidation = async (id: string) => {
  // Use same URL logic as apiClient
  const getApiUrl = () => {
    const envUrl = import.meta.env.VITE_API_URL;
    
    if (envUrl && !envUrl.includes('localhost')) {
      return envUrl;
    }
    
    if (import.meta.env.PROD) {
      return 'https://cronoteam-crono-back.e758qe.easypanel.host/api';
    }
    
    return 'http://localhost:3001/api';
  };

  const apiUrl = getApiUrl();
  const response = await fetch(`${apiUrl}/registrations/${id}/validate`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Failed to fetch registration' }));
    throw new Error(error.error || error.message || 'Failed to fetch registration');
  }

  return response.json();
};

// Get payment status by registration ID
export const getPaymentStatus = async (registrationId: string, signal?: AbortSignal) => {
  return apiClient.get<{ status: string; payment_date?: string; pix_qr_code?: string | null; due_date?: string | null }>(
    `/registrations/${registrationId}/payment-status`,
    { signal }
  );
};

// Generate payment for registration (creates payment if it doesn't exist)
export const generatePayment = async (registrationId: string) => {
  return apiClient.post<{ status: string; payment_date?: string; pix_qr_code?: string | null; due_date?: string | null; asaas_payment_id?: string }>(`/registrations/${registrationId}/generate-payment`);
};

// Get pending difference payment (PIX for complement after edit). Runner only.
export const getPendingDifferencePayment = async (registrationId: string) => {
  return apiClient.get<{ pix_qr_code: string | null; value: number; due_date: string }>(`/registrations/${registrationId}/pending-difference-payment`);
};

// Verificação manual: consulta o Asaas se o pagamento foi realizado e sincroniza a inscrição. Runner only.
export const verifyPayment = async (registrationId: string) => {
  return apiClient.post<{ payment_verified: boolean; message?: string }>(`/registrations/${registrationId}/verify-payment`);
};

// Admin confirma que recebeu o pagamento da diferença manualmente. Apenas admin.
export const confirmDifferencePayment = async (registrationId: string) => {
  return apiClient.post<{ message?: string }>(`/registrations/${registrationId}/confirm-difference-payment`);
};

// Create registration
export const createRegistration = async (data: CreateRegistrationData) => {
  return apiClient.post<Registration>('/registrations', data);
};

// Runner data when organizer creates new athlete (CPF not registered)
export interface RunnerDataByOrganizer {
  full_name: string;
  birth_date: string;
  city: string;
  gender: string;
  team?: string;
  email?: string;
  phone?: string;
}

// Create registration by organizer for an athlete (identified by CPF)
export interface CreateRegistrationByOrganizerData {
  cpf: string;
  runner_data?: RunnerDataByOrganizer;
  event_id: string;
  category_id: string;
  kit_id?: string;
  modality_id?: string | null;
  product_selections?: ProductSelection[];
  custom_field_values?: Record<string, string>;
}

export const createRegistrationByOrganizer = async (data: CreateRegistrationByOrganizerData) => {
  return apiClient.post<Registration>('/registrations/organizer/register-athlete', data);
};

/** Inscrição administrativa pelo super admin: mesma carga útil do organizador, sem taxa da plataforma; backend ignora janela de inscrições. */
export const createRegistrationBySuperAdmin = async (data: CreateRegistrationByOrganizerData) => {
  return apiClient.post<Registration>('/registrations/admin/register-athlete', data);
};

// Create registration by group leader
export interface CreateRegistrationByLeaderData {
  email: string;
  event_id: string;
  category_id: string;
  kit_id?: string;
  commission_id?: string; // NOVO: ID da comissão específica (opcional)
  product_selections?: ProductSelection[];
  custom_field_values?: Record<string, string>;
}

export const createRegistrationByLeader = async (data: CreateRegistrationByLeaderData) => {
  return apiClient.post<Registration>('/registrations/leader/register-athlete', data);
};

// Update registration
export const updateRegistration = async (id: string, data: UpdateRegistrationData) => {
  return apiClient.put<Registration>(`/registrations/${id}`, data);
};

// Attach registration to a leader event commission (organizer or admin). Applies the commission.
export const attachRegistrationToCommission = async (
  registrationId: string,
  body: { leader_event_commission_id: string }
) => {
  return apiClient.post<{ registration: Registration; commission: any }>(
    `/registrations/${registrationId}/attach-commission`,
    body
  );
};

// Commission linked to a registration (with leader info) - for attach popup
export interface RegistrationCommissionInfo {
  id: string;
  leader_id: string;
  registration_id: string;
  event_id: string;
  commission_amount: number;
  commission_percentage: number;
  registration_amount: number;
  status: string;
  leader_name?: string | null;
  leader_referral_code?: string | null;
}

// Get commission linked to this registration (organizer of event or admin). For attach popup.
export const getRegistrationCommission = async (registrationId: string) => {
  return apiClient.get<RegistrationCommissionInfo>(`/registrations/${registrationId}/commission`);
};

// Detach commission from this registration (organizer of event or admin). Allows attaching another.
export const detachCommission = async (registrationId: string) => {
  return apiClient.post<{ data: any; message: string }>(`/registrations/${registrationId}/detach-commission`, {});
};

// Change coupon/commission on this registration (organizer or admin). Subtracts old bonus and applies new.
export const changeRegistrationCommission = async (
  registrationId: string,
  body: { leader_event_commission_id: string }
) => {
  return apiClient.post<{ data: { registration: Registration; commission: any }; message: string }>(
    `/registrations/${registrationId}/change-commission`,
    body
  );
};

// Transfer registration to another runner by CPF or email
export const transferRegistration = async (id: string, cpf?: string, email?: string) => {
  return apiClient.put<Registration>(`/registrations/${id}/transfer`, { cpf, email });
};

// Cancel registration
export const cancelRegistration = async (id: string) => {
  return apiClient.put<Registration>(`/registrations/${id}/cancel`, {});
};

// Delete registration (hard delete - only for admin)
export const deleteRegistration = async (id: string) => {
  return apiClient.delete<Registration>(`/registrations/${id}`);
};

// Get registration receipt
export const getRegistrationReceipt = async (id: string) => {
  return apiClient.get<Registration>(`/registrations/${id}/receipt`);
};

// Get registrations with missing attributes
export interface MissingAttributesRegistration {
  registration_id: string;
  event_title: string;
  event_date: string;
  kit_id: string;
  kit_name: string;
  products_with_missing_attributes: Array<{
    product_id: string;
    product_name: string;
    variant_attributes: string[];
    available_variants: Array<{
      variant_id: string;
      variant_name: string;
      attribute_values: { [key: string]: string };
      in_stock?: boolean;
    }>;
  }>;
}

export const getRegistrationsWithMissingAttributes = async () => {
  return apiClient.get<MissingAttributesRegistration[]>("/registrations/missing-attributes");
};

// Complete registration attributes
export interface CompleteAttributesData {
  product_selections: Array<{
    product_id: string;
    variant_id?: string;
    attribute_selections: { [key: string]: string };
  }>;
}

export const completeRegistrationAttributes = async (
  registrationId: string,
  data: CompleteAttributesData
) => {
  return apiClient.post<{ success: boolean; message: string }>(
    `/registrations/${registrationId}/complete-attributes`,
    data
  );
};

// Remove registration attributes
export interface RemoveAttributesData {
  product_ids?: string[];
}

export const removeRegistrationAttributes = async (
  registrationId: string,
  data?: RemoveAttributesData
) => {
  return apiClient.post<{ success: boolean; message: string }>(
    `/registrations/${registrationId}/remove-attributes`,
    data || {}
  );
};

// Complete invitation (runner chooses category, modality, kit and optional variant)
export interface CompleteInvitationData {
  category_id: string;
  modality_id?: string | null;
  kit_id?: string | null;
  product_selections?: Array<{
    product_id: string;
    variant_id?: string;
    attribute_selections?: Record<string, string>;
  }>;
  custom_field_values?: Record<string, string>;
}

export const completeInvitation = async (
  registrationId: string,
  data: CompleteInvitationData
) => {
  return apiClient.post<Registration>(
    `/registrations/${registrationId}/complete-invitation`,
    data
  );
};

export type ExportRegistrationsFilters = GetRegistrationsFilters;

// Export registrations (mesmos filtros da listagem, quando suportados pelo backend)
export const exportRegistrations = async (filters?: ExportRegistrationsFilters, downloadFilename?: string) => {
  const queryParams = new URLSearchParams();
  if (filters?.event_id) queryParams.append('event_id', filters.event_id);
  if (filters?.status) queryParams.append('status', filters.status);
  if (filters?.payment_status) queryParams.append('payment_status', filters.payment_status);
  if (filters?.search) queryParams.append('search', filters.search);
  if (filters?.category_id) queryParams.append('category_id', filters.category_id);
  if (filters?.modality_id) queryParams.append('modality_id', filters.modality_id);
  if (filters?.kit_id) queryParams.append('kit_id', filters.kit_id);
  if (filters?.created_at_from) queryParams.append('created_at_from', filters.created_at_from);
  if (filters?.created_at_to) queryParams.append('created_at_to', filters.created_at_to);
  if (filters?.registration_kind) queryParams.append('registration_kind', filters.registration_kind);

  const queryString = queryParams.toString();
  const endpoint = `/registrations/export${queryString ? `?${queryString}` : ''}`;

  const response = await fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3001/api'}${endpoint}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${localStorage.getItem('auth_token')}`,
    },
  });

  if (!response.ok) {
    throw new Error('Failed to export registrations');
  }

  const blob = await response.blob();
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = downloadFilename || `inscricoes_${new Date().toISOString().split('T')[0]}.csv`;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
};


