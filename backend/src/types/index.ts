// Database types
export type AppRole = 'admin' | 'organizer' | 'runner';
export type EventStatus = 'draft' | 'published' | 'ongoing' | 'finished' | 'cancelled';
export type RegistrationStatus = 'pending' | 'confirmed' | 'cancelled' | 'refund_requested' | 'refunded';
export type PaymentStatus = 'pending' | 'paid' | 'refunded' | 'failed';
export type PaymentMethod = 'pix' | 'credit_card' | 'boleto';

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
  created_at: Date | null;
  updated_at: Date | null;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: Date | null;
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

export interface EventCategory {
  id: string;
  event_id: string;
  name: string;
  distance: string;
  price: number;
  max_participants: number | null;
  created_at: Date | null;
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

// API Response types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}





