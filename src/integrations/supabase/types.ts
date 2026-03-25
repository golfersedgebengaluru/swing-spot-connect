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
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      admin_config: {
        Row: {
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      bay_config: {
        Row: {
          calendar_email: string | null
          city: string
          close_time: string
          created_at: string
          id: string
          is_active: boolean
          open_time: string
          updated_at: string
        }
        Insert: {
          calendar_email?: string | null
          city: string
          close_time?: string
          created_at?: string
          id?: string
          is_active?: boolean
          open_time?: string
          updated_at?: string
        }
        Update: {
          calendar_email?: string | null
          city?: string
          close_time?: string
          created_at?: string
          id?: string
          is_active?: boolean
          open_time?: string
          updated_at?: string
        }
        Relationships: []
      }
      bay_pricing: {
        Row: {
          city: string
          created_at: string
          currency: string
          day_type: string
          id: string
          label: string
          price_per_hour: number
          session_type: string
          updated_at: string
        }
        Insert: {
          city: string
          created_at?: string
          currency?: string
          day_type?: string
          id?: string
          label?: string
          price_per_hour?: number
          session_type?: string
          updated_at?: string
        }
        Update: {
          city?: string
          created_at?: string
          currency?: string
          day_type?: string
          id?: string
          label?: string
          price_per_hour?: number
          session_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      bays: {
        Row: {
          calendar_email: string | null
          city: string
          close_time: string
          coaching_cancellation_refund_hours: number
          coaching_hours: number
          coaching_mode: string
          created_at: string
          currency: string
          id: string
          is_active: boolean
          name: string
          open_time: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          calendar_email?: string | null
          city: string
          close_time?: string
          coaching_cancellation_refund_hours?: number
          coaching_hours?: number
          coaching_mode?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name: string
          open_time?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          calendar_email?: string | null
          city?: string
          close_time?: string
          coaching_cancellation_refund_hours?: number
          coaching_hours?: number
          coaching_mode?: string
          created_at?: string
          currency?: string
          id?: string
          is_active?: boolean
          name?: string
          open_time?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      bookings: {
        Row: {
          bay_id: string | null
          calendar_event_id: string | null
          city: string
          created_at: string
          duration_minutes: number
          end_time: string
          id: string
          note: string | null
          session_type: string
          start_time: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bay_id?: string | null
          calendar_event_id?: string | null
          city: string
          created_at?: string
          duration_minutes: number
          end_time: string
          id?: string
          note?: string | null
          session_type?: string
          start_time: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bay_id?: string | null
          calendar_event_id?: string | null
          city?: string
          created_at?: string
          duration_minutes?: number
          end_time?: string
          id?: string
          note?: string | null
          session_type?: string
          start_time?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
      }
      community_posts: {
        Row: {
          content: string
          created_at: string
          id: string
          likes_count: number
          post_type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          likes_count?: number
          post_type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          likes_count?: number
          post_type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      earn_methods: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          id: string
          method: string
          points_label: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          method: string
          points_label: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          method?: string
          points_label?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      email_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          metadata: Json | null
          recipient_email: string
          resend_id: string | null
          status: string
          subject: string
          template: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email: string
          resend_id?: string | null
          status?: string
          subject: string
          template: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          metadata?: Json | null
          recipient_email?: string
          resend_id?: string | null
          status?: string
          subject?: string
          template?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_preferences: {
        Row: {
          booking_cancelled: boolean
          booking_confirmed: boolean
          booking_rescheduled: boolean
          created_at: string
          id: string
          league_updates: boolean
          points_earned: boolean
          points_redeemed: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          booking_cancelled?: boolean
          booking_confirmed?: boolean
          booking_rescheduled?: boolean
          created_at?: string
          id?: string
          league_updates?: boolean
          points_earned?: boolean
          points_redeemed?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          booking_cancelled?: boolean
          booking_confirmed?: boolean
          booking_rescheduled?: boolean
          created_at?: string
          id?: string
          league_updates?: boolean
          points_earned?: boolean
          points_redeemed?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      events: {
        Row: {
          created_at: string
          date: string
          description: string | null
          id: string
          is_active: boolean | null
          location: string | null
          price: string | null
          prize: string | null
          spots_taken: number | null
          spots_total: number | null
          time_end: string | null
          time_start: string | null
          title: string
          type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          price?: string | null
          prize?: string | null
          spots_taken?: number | null
          spots_total?: number | null
          time_end?: string | null
          time_start?: string | null
          title: string
          type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          location?: string | null
          price?: string | null
          prize?: string | null
          spots_taken?: number | null
          spots_total?: number | null
          time_end?: string | null
          time_start?: string | null
          title?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      financial_years: {
        Row: {
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          label: string
          start_date: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          label: string
          start_date: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_date?: string
          id?: string
          is_active?: boolean
          label?: string
          start_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      hour_packages: {
        Row: {
          created_at: string
          currency: string
          hours: number
          id: string
          is_active: boolean
          label: string
          price: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          currency?: string
          hours: number
          id?: string
          is_active?: boolean
          label?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          currency?: string
          hours?: number
          id?: string
          is_active?: boolean
          label?: string
          price?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      hours_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          hours: number
          id: string
          note: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          hours: number
          id?: string
          note?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          hours?: number
          id?: string
          note?: string | null
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      member_hours: {
        Row: {
          created_at: string
          hours_purchased: number
          hours_used: number
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hours_purchased?: number
          hours_used?: number
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          hours_purchased?: number
          hours_used?: number
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          city: string | null
          created_at: string
          id: string
          items: Json
          note: string | null
          status: string
          total_price: number
          updated_at: string
          user_id: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          items?: Json
          note?: string | null
          status?: string
          total_price?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          items?: Json
          note?: string | null
          status?: string
          total_price?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      page_content: {
        Row: {
          content: string
          id: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          id?: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          id?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      payment_gateways: {
        Row: {
          api_key: string | null
          api_secret: string | null
          city: string
          config: Json
          created_at: string
          display_name: string
          id: string
          is_active: boolean
          is_test_mode: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          api_key?: string | null
          api_secret?: string | null
          city: string
          config?: Json
          created_at?: string
          display_name: string
          id?: string
          is_active?: boolean
          is_test_mode?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          api_key?: string | null
          api_secret?: string | null
          city?: string
          config?: Json
          created_at?: string
          display_name?: string
          id?: string
          is_active?: boolean
          is_test_mode?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      points_transactions: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          points: number
          reward_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          points: number
          reward_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          points?: number
          reward_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_transactions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          badge: string | null
          category: string
          colors: string[] | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          in_stock: boolean | null
          name: string
          price: number
          sizes: string[] | null
          sort_order: number | null
          type: string
          updated_at: string
        }
        Insert: {
          badge?: string | null
          category?: string
          colors?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          name: string
          price?: number
          sizes?: string[] | null
          sort_order?: number | null
          type?: string
          updated_at?: string
        }
        Update: {
          badge?: string | null
          category?: string
          colors?: string[] | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          name?: string
          price?: number
          sizes?: string[] | null
          sort_order?: number | null
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          apple_user_id: string | null
          avatar_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          handicap: number | null
          id: string
          points: number | null
          preferred_city: string | null
          tier: string | null
          total_rounds: number | null
          updated_at: string
          user_id: string | null
          user_type: string
        }
        Insert: {
          apple_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          handicap?: number | null
          id?: string
          points?: number | null
          preferred_city?: string | null
          tier?: string | null
          total_rounds?: number | null
          updated_at?: string
          user_id?: string | null
          user_type?: string
        }
        Update: {
          apple_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          handicap?: number | null
          id?: string
          points?: number | null
          preferred_city?: string | null
          tier?: string | null
          total_rounds?: number | null
          updated_at?: string
          user_id?: string | null
          user_type?: string
        }
        Relationships: []
      }
      revenue_transactions: {
        Row: {
          amount: number
          booking_id: string | null
          created_at: string
          currency: string
          description: string | null
          gateway_name: string | null
          gateway_order_ref: string | null
          gateway_payment_ref: string | null
          guest_email: string | null
          guest_name: string | null
          guest_phone: string | null
          hours_transaction_id: string | null
          id: string
          metadata: Json | null
          original_transaction_id: string | null
          status: string
          transaction_type: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          gateway_name?: string | null
          gateway_order_ref?: string | null
          gateway_payment_ref?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          hours_transaction_id?: string | null
          id?: string
          metadata?: Json | null
          original_transaction_id?: string | null
          status?: string
          transaction_type: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          amount?: number
          booking_id?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          gateway_name?: string | null
          gateway_order_ref?: string | null
          gateway_payment_ref?: string | null
          guest_email?: string | null
          guest_name?: string | null
          guest_phone?: string | null
          hours_transaction_id?: string | null
          id?: string
          metadata?: Json | null
          original_transaction_id?: string | null
          status?: string
          transaction_type?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "revenue_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_transactions_hours_transaction_id_fkey"
            columns: ["hours_transaction_id"]
            isOneToOne: false
            referencedRelation: "hours_transactions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revenue_transactions_original_transaction_id_fkey"
            columns: ["original_transaction_id"]
            isOneToOne: false
            referencedRelation: "revenue_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      rewards: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_available: boolean | null
          name: string
          points_cost: number
          sort_order: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean | null
          name: string
          points_cost?: number
          sort_order?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean | null
          name?: string
          points_cost?: number
          sort_order?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_email_rate_limit: {
        Args: { p_max_per_hour?: number; p_user_id: string }
        Returns: boolean
      }
      get_hours_balance: { Args: { p_user_id: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
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
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
