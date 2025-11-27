export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      event_categories: {
        Row: {
          created_at: string | null
          distance: string
          event_id: string
          id: string
          max_participants: number | null
          name: string
          price: number
        }
        Insert: {
          created_at?: string | null
          distance: string
          event_id: string
          id?: string
          max_participants?: number | null
          name: string
          price: number
        }
        Update: {
          created_at?: string | null
          distance?: string
          event_id?: string
          id?: string
          max_participants?: number | null
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_categories_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_kits: {
        Row: {
          created_at: string | null
          description: string | null
          event_id: string
          id: string
          name: string
          price: number
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          event_id: string
          id?: string
          name: string
          price: number
        }
        Update: {
          created_at?: string | null
          description?: string | null
          event_id?: string
          id?: string
          name?: string
          price?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_kits_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          banner_url: string | null
          city: string
          created_at: string | null
          description: string | null
          event_date: string
          id: string
          location: string
          organizer_id: string
          regulation_url: string | null
          state: string
          status: Database["public"]["Enums"]["event_status"] | null
          title: string
          updated_at: string | null
        }
        Insert: {
          banner_url?: string | null
          city: string
          created_at?: string | null
          description?: string | null
          event_date: string
          id?: string
          location: string
          organizer_id: string
          regulation_url?: string | null
          state: string
          status?: Database["public"]["Enums"]["event_status"] | null
          title: string
          updated_at?: string | null
        }
        Update: {
          banner_url?: string | null
          city?: string
          created_at?: string | null
          description?: string | null
          event_date?: string
          id?: string
          location?: string
          organizer_id?: string
          regulation_url?: string | null
          state?: string
          status?: Database["public"]["Enums"]["event_status"] | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "events_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      home_page_settings: {
        Row: {
          consultoria_description: string | null
          consultoria_title: string | null
          created_at: string | null
          hero_image_url: string | null
          hero_subtitle: string | null
          hero_title: string
          id: string
          stats_cities: string | null
          stats_cities_label: string | null
          stats_events: string | null
          stats_events_label: string | null
          stats_runners: string | null
          stats_runners_label: string | null
          stats_years: string | null
          stats_years_label: string | null
          updated_at: string | null
          whatsapp_number: string | null
          whatsapp_text: string | null
        }
        Insert: {
          consultoria_description?: string | null
          consultoria_title?: string | null
          created_at?: string | null
          hero_image_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string
          id?: string
          stats_cities?: string | null
          stats_cities_label?: string | null
          stats_events?: string | null
          stats_events_label?: string | null
          stats_runners?: string | null
          stats_runners_label?: string | null
          stats_years?: string | null
          stats_years_label?: string | null
          updated_at?: string | null
          whatsapp_number?: string | null
          whatsapp_text?: string | null
        }
        Update: {
          consultoria_description?: string | null
          consultoria_title?: string | null
          created_at?: string | null
          hero_image_url?: string | null
          hero_subtitle?: string | null
          hero_title?: string
          id?: string
          stats_cities?: string | null
          stats_cities_label?: string | null
          stats_events?: string | null
          stats_events_label?: string | null
          stats_runners?: string | null
          stats_runners_label?: string | null
          stats_years?: string | null
          stats_years_label?: string | null
          updated_at?: string | null
          whatsapp_number?: string | null
          whatsapp_text?: string | null
        }
        Relationships: []
      }
      kit_pickup_locations: {
        Row: {
          address: string
          created_at: string | null
          id: string
          kit_id: string
          latitude: number | null
          longitude: number | null
          pickup_date: string
        }
        Insert: {
          address: string
          created_at?: string | null
          id?: string
          kit_id: string
          latitude?: number | null
          longitude?: number | null
          pickup_date: string
        }
        Update: {
          address?: string
          created_at?: string | null
          id?: string
          kit_id?: string
          latitude?: number | null
          longitude?: number | null
          pickup_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "kit_pickup_locations_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "event_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      kit_products: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          image_url: string | null
          kit_id: string
          name: string
          type: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          kit_id: string
          name: string
          type: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          image_url?: string | null
          kit_id?: string
          name?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "kit_products_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "event_kits"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          created_at: string | null
          id: string
          name: string
          product_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          product_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          product_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "kit_products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          birth_date: string
          cpf: string
          created_at: string | null
          full_name: string
          gender: string | null
          id: string
          lgpd_consent: boolean | null
          phone: string
          updated_at: string | null
        }
        Insert: {
          birth_date: string
          cpf: string
          created_at?: string | null
          full_name: string
          gender?: string | null
          id: string
          lgpd_consent?: boolean | null
          phone: string
          updated_at?: string | null
        }
        Update: {
          birth_date?: string
          cpf?: string
          created_at?: string | null
          full_name?: string
          gender?: string | null
          id?: string
          lgpd_consent?: boolean | null
          phone?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      registrations: {
        Row: {
          category_id: string
          confirmation_code: string | null
          created_at: string | null
          event_id: string
          id: string
          kit_id: string | null
          payment_status: Database["public"]["Enums"]["payment_status"] | null
          registered_by: string
          runner_id: string
          status: Database["public"]["Enums"]["registration_status"] | null
          total_amount: number
          updated_at: string | null
        }
        Insert: {
          category_id: string
          confirmation_code?: string | null
          created_at?: string | null
          event_id: string
          id?: string
          kit_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          registered_by: string
          runner_id: string
          status?: Database["public"]["Enums"]["registration_status"] | null
          total_amount: number
          updated_at?: string | null
        }
        Update: {
          category_id?: string
          confirmation_code?: string | null
          created_at?: string | null
          event_id?: string
          id?: string
          kit_id?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"] | null
          registered_by?: string
          runner_id?: string
          status?: Database["public"]["Enums"]["registration_status"] | null
          total_amount?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "registrations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "event_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_kit_id_fkey"
            columns: ["kit_id"]
            isOneToOne: false
            referencedRelation: "event_kits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_registered_by_fkey"
            columns: ["registered_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "registrations_runner_id_fkey"
            columns: ["runner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "organizer" | "runner"
      event_status: "draft" | "published" | "ongoing" | "finished" | "cancelled"
      payment_status: "pending" | "paid" | "refunded" | "failed"
      registration_status:
        | "pending"
        | "confirmed"
        | "cancelled"
        | "refund_requested"
        | "refunded"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "organizer", "runner"],
      event_status: ["draft", "published", "ongoing", "finished", "cancelled"],
      payment_status: ["pending", "paid", "refunded", "failed"],
      registration_status: [
        "pending",
        "confirmed",
        "cancelled",
        "refund_requested",
        "refunded",
      ],
    },
  },
} as const
