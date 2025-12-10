// Asaas API Types

export type AsaasBillingType = 'PIX' | 'BOLETO' | 'CREDIT_CARD' | 'DEBIT_CARD';

export type AsaasPaymentStatus =
  | 'PENDING'
  | 'CONFIRMED'
  | 'RECEIVED'
  | 'OVERDUE'
  | 'REFUNDED'
  | 'RECEIVED_IN_CASH_UNDONE'
  | 'CHARGEBACK_REQUESTED'
  | 'CHARGEBACK_DISPUTE'
  | 'AWAITING_CHARGEBACK_REVERSAL'
  | 'DUNNING_REQUESTED'
  | 'DUNNING_RECEIVED'
  | 'AWAITING_RISK_ANALYSIS';

export type AsaasWebhookEventType =
  | 'PAYMENT_CREATED'
  | 'PAYMENT_UPDATED'
  | 'PAYMENT_CONFIRMED'
  | 'PAYMENT_RECEIVED'
  | 'PAYMENT_OVERDUE'
  | 'PAYMENT_DELETED'
  | 'PAYMENT_RESTORED'
  | 'PAYMENT_REFUNDED'
  | 'PAYMENT_CHARGEBACK_REQUESTED'
  | 'PAYMENT_CHARGEBACK_DISPUTE'
  | 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL';

// Asaas Customer Types
export interface AsaasCustomerRequest {
  name: string;
  email: string;
  cpfCnpj: string;
  phone?: string;
  mobilePhone?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  city?: string;
  state?: string;
  externalReference?: string;
}

export interface AsaasCustomerResponse {
  object: 'customer';
  id: string;
  dateCreated: string;
  name: string;
  email: string;
  phone?: string;
  mobilePhone?: string;
  cpfCnpj?: string;
  postalCode?: string;
  address?: string;
  addressNumber?: string;
  complement?: string;
  province?: string;
  city?: string;
  state?: string;
  country?: string;
  externalReference?: string | null;
  notificationDisabled: boolean;
  additionalEmails?: string | null;
  canDelete: boolean;
  cannotBeDeletedReason?: string | null;
  canEdit: boolean;
  cannotEditReason?: string | null;
  personType: 'FISICA' | 'JURIDICA';
  observations?: string | null;
}

// Asaas Payment Types
export interface AsaasPaymentRequest {
  customer: string; // asaas_customer_id
  billingType: AsaasBillingType;
  value: number;
  dueDate: string; // YYYY-MM-DD
  description?: string;
  externalReference?: string;
  installmentCount?: number;
  installmentValue?: number;
}

export interface AsaasPaymentResponse {
  object: 'payment';
  id: string;
  dateCreated: string;
  customer: string;
  paymentLink?: string;
  value: number;
  netValue?: number;
  originalValue?: number | null;
  interestValue?: number | null;
  description?: string;
  billingType: AsaasBillingType;
  status: AsaasPaymentStatus;
  dueDate: string;
  originalDueDate?: string;
  paymentDate?: string | null;
  clientPaymentDate?: string | null;
  installmentNumber?: number | null;
  invoiceUrl?: string;
  bankSlipUrl?: string | null;
  transactionReceiptUrl?: string | null;
  invoiceNumber?: string | null;
  externalReference?: string | null;
  deleted: boolean;
  anticipated: boolean;
  refunds?: any | null;
  pixTransactionId?: string | null;
  pixQrCodeId?: string | null;
  pixQrCode?: string | null;
}

// Asaas Webhook Types
export interface AsaasWebhookPayload {
  event: AsaasWebhookEventType;
  payment: AsaasPaymentResponse;
}

// Database Types (for our tables)
export interface AsaasCustomer {
  id: string;
  user_id: string;
  asaas_customer_id: string;
  created_at: Date;
  updated_at: Date;
}

export interface AsaasPayment {
  id: string;
  registration_id: string;
  asaas_payment_id: string;
  asaas_customer_id: string;
  value: number;
  net_value?: number | null;
  billing_type: string;
  status: string;
  due_date: Date;
  payment_date?: Date | null;
  payment_link?: string | null;
  invoice_url?: string | null;
  bank_slip_url?: string | null;
  external_reference?: string | null;
  pix_qr_code_id?: string | null;
  pix_qr_code?: string | null;
  pix_transaction_id?: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AsaasWebhookEventRecord {
  id: string;
  event_type: string;
  asaas_payment_id?: string | null;
  registration_id?: string | null;
  payload: any; // JSONB
  processed: boolean;
  error_message?: string | null;
  created_at: Date;
}

// Service Response Types
export interface CreateCustomerResult {
  asaas_customer_id: string;
  created: boolean; // true if newly created, false if already existed
}

export interface CreatePaymentResult {
  asaas_payment_id: string;
  payment_link?: string;
  pix_qr_code?: string | null;
  pix_qr_code_id?: string | null;
  status: AsaasPaymentStatus;
  value: number;
  net_value?: number;
  due_date: string;
}

export interface PaymentStatusResult {
  status: AsaasPaymentStatus;
  payment_date?: string | null;
  pix_transaction_id?: string | null;
}


