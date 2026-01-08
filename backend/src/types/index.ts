// Database types
export type AppRole = 'admin' | 'organizer' | 'runner';
export type EventStatus = 'draft' | 'published' | 'ongoing' | 'finished' | 'cancelled';
export type RegistrationStatus = 'pending' | 'confirmed' | 'cancelled' | 'refund_requested' | 'refunded' | 'transferred';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';
export type PaymentMethod = 'pix' | 'credit_card' | 'boleto' | 'free_bonus';

// User types
export interface User {
  id: string;
  email: string;
  password_hash: string;
  email_verified: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Profile {
  id: string;
  full_name: string;
  cpf: string;
  phone: string;
  gender: string | null;
  birth_date: Date;
  lgpd_consent: boolean | null;
  is_public: boolean | null;
  preferred_name: string | null;
  profession: string | null;
  cbat: string | null;
  postal_code: string | null;
  street: string | null;
  address_number: string | null;
  address_complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: Date | null;
}

// Group Leaders types
export type CommissionStatus = 'pending' | 'paid' | 'cancelled';
export type ReferralType = 'link' | 'code';

export interface GroupLeader {
  id: string;
  user_id: string;
  referral_code: string;
  is_active: boolean;
  commission_percentage: number | null;
  total_earnings: number;
  total_referrals: number;
  created_at: Date;
  updated_at: Date;
}

export interface UserReferral {
  id: string;
  user_id: string;
  leader_id: string;
  referral_code: string;
  referral_type: ReferralType;
  created_at: Date;
}

export interface LeaderCommission {
  id: string;
  leader_id: string;
  registration_id: string;
  referred_user_id: string;
  event_id: string;
  commission_amount: number;
  commission_percentage: number;
  registration_amount: number;
  status: CommissionStatus;
  paid_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface LeaderEventCommission {
  id: string;
  leader_id: string;
  event_id: string;
  commission_percentage: number;
  bonus_type: 'commission' | 'invitation' | 'both';
  required_purchases: number | null;
  bonus_registration_id: string | null;
  bonus_earned_at: Date | null;
  name: string | null;
  created_at: Date;
  updated_at: Date;
  event_title?: string;
  event_date?: string;
  organizer_id?: string;
  coupon?: {
    id: string;
    code: string;
    link: string;
  } | null;
}

export interface CreateLeaderEventCommissionData {
  leader_id: string;
  event_id: string;
  commission_percentage: number;
  bonus_type?: 'commission' | 'invitation' | 'both';
  required_purchases?: number | null;
  name?: string | null;
}

export interface UpdateLeaderEventCommissionData {
  commission_percentage?: number;
  bonus_type?: 'commission' | 'invitation' | 'both';
  required_purchases?: number | null;
  name?: string | null;
  coupon_discount?: number;
}

// Event types
export interface Event {
  id: string;
  organizer_id: string;
  title: string;
  description: string | null;
  event_date: Date;
  location: string;
  city: string;
  state: string;
  banner_url: string | null;
  regulation_url: string | null;
  result_url: string | null;
  status: EventStatus | null;
  created_at: Date | null;
  updated_at: Date | null;
}

// Legacy EventCategory (mantida para compatibilidade durante transição)
export interface EventCategory {
  id: string;
  event_id: string;
  name: string;
  distance: string;
  price: number;
  max_participants: number | null;
  created_at: Date | null;
}

// New Modality and Category types
export type CategoryType = 'visitante' | 'local' | 'geral' | 'PCD' | 'militar' | 'civil' | 'outro';
export type CategoryGender = 'ambos' | 'masculino' | 'feminino';

export interface Modality {
  id: string;
  event_id: string;
  name: string;
  distance: string;
  display_order: number;
  created_at: Date;
  updated_at: Date;
}

export interface Category {
  id: string;
  event_id: string;
  name: string;
  price: number;
  category_type: CategoryType;
  gender: CategoryGender;
  min_age: number | null;
  max_age: number | null;
  max_participants: number | null;
  is_default: boolean;
  display_order: number;
  created_at: Date;
  updated_at: Date;
  modality_ids?: string[]; // Para relacionamento (não está no banco, apenas para API)
}

export interface CategoryModality {
  category_id: string;
  modality_id: string;
  created_at: Date;
}

// Data types for creating/updating modalities and categories
export interface CreateModalityData {
  event_id: string;
  name: string;
  distance: string;
  display_order?: number; // Opcional na criação - será calculado automaticamente se não fornecido
}

export interface UpdateModalityData {
  name?: string;
  distance?: string;
  display_order?: number; // Permite atualizar a ordem de exibição
}

export interface CreateCategoryData {
  event_id: string;
  name: string;
  price: number;
  category_type: CategoryType;
  gender: CategoryGender;
  min_age?: number | null;
  max_age?: number | null;
  max_participants?: number | null;
  is_default?: boolean;
  display_order?: number; // Opcional na criação - será calculado automaticamente se não fornecido
  modality_ids?: string[]; // IDs das modalidades associadas
}

export interface UpdateCategoryData {
  name?: string;
  price?: number;
  category_type?: CategoryType;
  gender?: CategoryGender;
  min_age?: number | null;
  max_age?: number | null;
  max_participants?: number | null;
  is_default?: boolean;
  display_order?: number; // Permite atualizar a ordem de exibição
  modality_ids?: string[]; // IDs das modalidades associadas
}

export interface Registration {
  id: string;
  event_id: string;
  runner_id: string;
  registered_by: string;
  category_id: string;
  kit_id: string | null;
  status: RegistrationStatus | null;
  payment_status: PaymentStatus | null;
  payment_method: PaymentMethod | null;
  total_amount: number;
  confirmation_code: string | null;
  created_at: Date | null;
  updated_at: Date | null;
}

// Coupon types
export type CouponType = 'percentage' | 'fixed';

export interface Coupon {
  id: string;
  organizer_id: string;
  event_id: string | null; // Deprecated, use event_ids instead
  event_ids?: string[]; // Array of event IDs
  leader_id: string | null; // ID do líder de grupo (opcional - cupons exclusivos)
  code: string;
  name: string;
  type: CouponType;
  discount_value: number;
  expiration_date: Date | null;
  max_uses: number | null;
  current_uses: number;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}





