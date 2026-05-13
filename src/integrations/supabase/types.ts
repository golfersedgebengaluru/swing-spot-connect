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
      advance_transactions: {
        Row: {
          amount: number
          city: string
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          id: string
          source_id: string | null
          source_type: string
          transaction_type: string
        }
        Insert: {
          amount?: number
          city: string
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          id?: string
          source_id?: string | null
          source_type?: string
          transaction_type?: string
        }
        Update: {
          amount?: number
          city?: string
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          id?: string
          source_id?: string | null
          source_type?: string
          transaction_type?: string
        }
        Relationships: []
      }
      auto_gift_rules: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          max_per_user: number
          name: string
          reward_description: string | null
          reward_name: string
          sort_order: number
          trigger_date: string | null
          trigger_event: string
          trigger_event_id: string | null
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_per_user?: number
          name: string
          reward_description?: string | null
          reward_name: string
          sort_order?: number
          trigger_date?: string | null
          trigger_event?: string
          trigger_event_id?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          max_per_user?: number
          name?: string
          reward_description?: string | null
          reward_name?: string
          sort_order?: number
          trigger_date?: string | null
          trigger_event?: string
          trigger_event_id?: string | null
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "auto_gift_rules_trigger_event_id_fkey"
            columns: ["trigger_event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
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
      bay_holidays: {
        Row: {
          bay_id: string | null
          city: string
          created_at: string
          holiday_date: string
          id: string
          label: string
        }
        Insert: {
          bay_id?: string | null
          city: string
          created_at?: string
          holiday_date: string
          id?: string
          label?: string
        }
        Update: {
          bay_id?: string | null
          city?: string
          created_at?: string
          holiday_date?: string
          id?: string
          label?: string
        }
        Relationships: [
          {
            foreignKeyName: "bay_holidays_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
      }
      bay_peak_hours: {
        Row: {
          bay_id: string
          created_at: string
          day_of_week: number | null
          id: string
          peak_end: string
          peak_start: string
          sort_order: number
        }
        Insert: {
          bay_id: string
          created_at?: string
          day_of_week?: number | null
          id?: string
          peak_end: string
          peak_start: string
          sort_order?: number
        }
        Update: {
          bay_id?: string
          created_at?: string
          day_of_week?: number | null
          id?: string
          peak_end?: string
          peak_start?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "bay_peak_hours_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
        ]
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
          service_product_id: string | null
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
          service_product_id?: string | null
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
          service_product_id?: string | null
          session_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bay_pricing_service_product_id_fkey"
            columns: ["service_product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
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
          extended_close_time: string | null
          extended_hours_enabled: boolean
          extended_open_time: string | null
          id: string
          is_active: boolean
          name: string
          open_time: string
          peak_end: string | null
          peak_start: string | null
          sort_order: number
          updated_at: string
          weekly_off_days: number[]
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
          extended_close_time?: string | null
          extended_hours_enabled?: boolean
          extended_open_time?: string | null
          id?: string
          is_active?: boolean
          name: string
          open_time?: string
          peak_end?: string | null
          peak_start?: string | null
          sort_order?: number
          updated_at?: string
          weekly_off_days?: number[]
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
          extended_close_time?: string | null
          extended_hours_enabled?: boolean
          extended_open_time?: string | null
          id?: string
          is_active?: boolean
          name?: string
          open_time?: string
          peak_end?: string | null
          peak_start?: string | null
          sort_order?: number
          updated_at?: string
          weekly_off_days?: number[]
        }
        Relationships: []
      }
      bookings: {
        Row: {
          bay_id: string | null
          billing_status: string
          calendar_event_id: string | null
          city: string
          coach_name: string | null
          corporate_invoice_id: string | null
          created_at: string
          duration_minutes: number
          end_time: string
          id: string
          invoice_id: string | null
          note: string | null
          session_type: string
          start_time: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          bay_id?: string | null
          billing_status?: string
          calendar_event_id?: string | null
          city: string
          coach_name?: string | null
          corporate_invoice_id?: string | null
          created_at?: string
          duration_minutes: number
          end_time: string
          id?: string
          invoice_id?: string | null
          note?: string | null
          session_type?: string
          start_time: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          bay_id?: string | null
          billing_status?: string
          calendar_event_id?: string | null
          city?: string
          coach_name?: string | null
          corporate_invoice_id?: string | null
          created_at?: string
          duration_minutes?: number
          end_time?: string
          id?: string
          invoice_id?: string | null
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
          {
            foreignKeyName: "bookings_corporate_invoice_id_fkey"
            columns: ["corporate_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      coach_students: {
        Row: {
          assigned_by: string | null
          coach_id: string
          created_at: string
          id: string
          is_active: boolean
          notes: string | null
          student_profile_id: string
          updated_at: string
        }
        Insert: {
          assigned_by?: string | null
          coach_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          student_profile_id: string
          updated_at?: string
        }
        Update: {
          assigned_by?: string | null
          coach_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          notes?: string | null
          student_profile_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coach_students_coach_id_fkey"
            columns: ["coach_id"]
            isOneToOne: false
            referencedRelation: "coaches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coach_students_student_profile_id_fkey"
            columns: ["student_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      coaches: {
        Row: {
          bio: string | null
          city: string
          created_at: string
          id: string
          is_active: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          bio?: string | null
          city: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          bio?: string | null
          city?: string
          created_at?: string
          id?: string
          is_active?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      coaching_sessions: {
        Row: {
          billing_status: string
          booking_id: string | null
          city: string
          coach_user_id: string
          corporate_invoice_id: string | null
          created_at: string
          drills: string | null
          id: string
          invoice_id: string | null
          notes: string | null
          onform_links: Json
          onform_url: string | null
          other_label: string | null
          other_links: Json
          other_url: string | null
          progress_summary: string | null
          session_date: string
          sportsbox_links: Json
          sportsbox_url: string | null
          student_user_id: string
          superspeed_links: Json
          superspeed_url: string | null
          updated_at: string
        }
        Insert: {
          billing_status?: string
          booking_id?: string | null
          city: string
          coach_user_id: string
          corporate_invoice_id?: string | null
          created_at?: string
          drills?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          onform_links?: Json
          onform_url?: string | null
          other_label?: string | null
          other_links?: Json
          other_url?: string | null
          progress_summary?: string | null
          session_date: string
          sportsbox_links?: Json
          sportsbox_url?: string | null
          student_user_id: string
          superspeed_links?: Json
          superspeed_url?: string | null
          updated_at?: string
        }
        Update: {
          billing_status?: string
          booking_id?: string | null
          city?: string
          coach_user_id?: string
          corporate_invoice_id?: string | null
          created_at?: string
          drills?: string | null
          id?: string
          invoice_id?: string | null
          notes?: string | null
          onform_links?: Json
          onform_url?: string | null
          other_label?: string | null
          other_links?: Json
          other_url?: string | null
          progress_summary?: string | null
          session_date?: string
          sportsbox_links?: Json
          sportsbox_url?: string | null
          student_user_id?: string
          superspeed_links?: Json
          superspeed_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "coaching_sessions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_corporate_invoice_id_fkey"
            columns: ["corporate_invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coaching_sessions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
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
      corporate_accounts: {
        Row: {
          billing_address: string | null
          billing_cycle_day: number
          billing_email: string | null
          created_at: string
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          nickname: string | null
          notes: string | null
          payment_terms_days: number
          state: string | null
          state_code: string | null
          updated_at: string
        }
        Insert: {
          billing_address?: string | null
          billing_cycle_day?: number
          billing_email?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          nickname?: string | null
          notes?: string | null
          payment_terms_days?: number
          state?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Update: {
          billing_address?: string | null
          billing_cycle_day?: number
          billing_email?: string | null
          created_at?: string
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          nickname?: string | null
          notes?: string | null
          payment_terms_days?: number
          state?: string | null
          state_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          created_at: string
          discount_applied: number
          id: string
          order_id: string | null
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          coupon_id: string
          created_at?: string
          discount_applied?: number
          id?: string
          order_id?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          coupon_id?: string
          created_at?: string
          discount_applied?: number
          id?: string
          order_id?: string | null
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      coupons: {
        Row: {
          city: string | null
          code: string
          created_at: string
          discount_type: string
          discount_value: number
          expires_at: string | null
          id: string
          is_active: boolean
          max_total_uses: number | null
          max_uses_per_user: number | null
          total_used: number
          updated_at: string
        }
        Insert: {
          city?: string | null
          code: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_total_uses?: number | null
          max_uses_per_user?: number | null
          total_used?: number
          updated_at?: string
        }
        Update: {
          city?: string | null
          code?: string
          created_at?: string
          discount_type?: string
          discount_value?: number
          expires_at?: string | null
          id?: string
          is_active?: boolean
          max_total_uses?: number | null
          max_uses_per_user?: number | null
          total_used?: number
          updated_at?: string
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
      expense_categories: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      expense_line_items: {
        Row: {
          cgst_amount: number
          created_at: string
          expense_id: string
          gst_rate: number
          hsn_code: string | null
          id: string
          igst_amount: number
          item_name: string
          line_total: number
          product_id: string | null
          quantity: number
          sac_code: string | null
          sgst_amount: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          cgst_amount?: number
          created_at?: string
          expense_id: string
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          item_name: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sac_code?: string | null
          sgst_amount?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          cgst_amount?: number
          created_at?: string
          expense_id?: string
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          item_name?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sac_code?: string | null
          sgst_amount?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "expense_line_items_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          bill_url: string | null
          category_id: string | null
          cgst_total: number
          city: string
          created_at: string
          created_by: string | null
          expense_date: string
          id: string
          igst_total: number
          notes: string | null
          payment_method: string | null
          payment_reference: string | null
          sgst_total: number
          subtotal: number
          total: number
          updated_at: string
          vendor_id: string | null
        }
        Insert: {
          bill_url?: string | null
          category_id?: string | null
          cgst_total?: number
          city: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          igst_total?: number
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          sgst_total?: number
          subtotal?: number
          total?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Update: {
          bill_url?: string | null
          category_id?: string | null
          cgst_total?: number
          city?: string
          created_at?: string
          created_by?: string | null
          expense_date?: string
          id?: string
          igst_total?: number
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          sgst_total?: number
          subtotal?: number
          total?: number
          updated_at?: string
          vendor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expenses_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "expense_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_vendor_id_fkey"
            columns: ["vendor_id"]
            isOneToOne: false
            referencedRelation: "vendors"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_years: {
        Row: {
          city: string | null
          created_at: string
          end_date: string
          id: string
          is_active: boolean
          label: string
          start_date: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          end_date: string
          id?: string
          is_active?: boolean
          label: string
          start_date: string
          updated_at?: string
        }
        Update: {
          city?: string | null
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
      gifted_rewards: {
        Row: {
          created_at: string
          gift_type: string
          gifted_by: string | null
          id: string
          notes: string | null
          redeemed_at: string | null
          reward_description: string | null
          reward_name: string
          status: string
          trigger_event: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          gift_type?: string
          gifted_by?: string | null
          id?: string
          notes?: string | null
          redeemed_at?: string | null
          reward_description?: string | null
          reward_name: string
          status?: string
          trigger_event?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          gift_type?: string
          gifted_by?: string | null
          id?: string
          notes?: string | null
          redeemed_at?: string | null
          reward_description?: string | null
          reward_name?: string
          status?: string
          trigger_event?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      gst_profiles: {
        Row: {
          address: string
          city: string
          created_at: string
          default_sac_code: string | null
          default_service_gst_rate: number
          gstin: string
          id: string
          invoice_prefix: string
          invoice_start_number: number
          legal_name: string
          state: string
          state_code: string
          updated_at: string
        }
        Insert: {
          address?: string
          city: string
          created_at?: string
          default_sac_code?: string | null
          default_service_gst_rate?: number
          gstin?: string
          id?: string
          invoice_prefix?: string
          invoice_start_number?: number
          legal_name?: string
          state?: string
          state_code?: string
          updated_at?: string
        }
        Update: {
          address?: string
          city?: string
          created_at?: string
          default_sac_code?: string | null
          default_service_gst_rate?: number
          gstin?: string
          id?: string
          invoice_prefix?: string
          invoice_start_number?: number
          legal_name?: string
          state?: string
          state_code?: string
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
      invoice_line_items: {
        Row: {
          cgst_amount: number
          created_at: string
          gst_rate: number
          hsn_code: string | null
          id: string
          igst_amount: number
          invoice_id: string
          item_name: string
          item_type: string
          line_total: number
          product_id: string | null
          quantity: number
          sac_code: string | null
          sgst_amount: number
          sort_order: number
          unit_price: number
        }
        Insert: {
          cgst_amount?: number
          created_at?: string
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          invoice_id: string
          item_name: string
          item_type?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sac_code?: string | null
          sgst_amount?: number
          sort_order?: number
          unit_price?: number
        }
        Update: {
          cgst_amount?: number
          created_at?: string
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          igst_amount?: number
          invoice_id?: string
          item_name?: string
          item_type?: string
          line_total?: number
          product_id?: string | null
          quantity?: number
          sac_code?: string | null
          sgst_amount?: number
          sort_order?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_sequences: {
        Row: {
          created_at: string
          financial_year_id: string
          gstin: string
          id: string
          last_number: number
          prefix: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          financial_year_id: string
          gstin: string
          id?: string
          last_number?: number
          prefix?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          financial_year_id?: string
          gstin?: string
          id?: string
          last_number?: number
          prefix?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_sequences_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_settings: {
        Row: {
          city: string | null
          created_at: string
          footer_note: string
          id: string
          logo_url: string
          template: string
          terms: string
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          footer_note?: string
          id?: string
          logo_url?: string
          template?: string
          terms?: string
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          footer_note?: string
          id?: string
          logo_url?: string
          template?: string
          terms?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoices: {
        Row: {
          amount_paid: number
          business_address: string | null
          business_gstin: string
          business_name: string
          business_state: string | null
          business_state_code: string | null
          cgst_total: number
          city: string | null
          created_at: string
          credit_note_disposition: string | null
          credit_note_for: string | null
          customer_email: string | null
          customer_gstin: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_state: string | null
          customer_state_code: string | null
          customer_user_id: string | null
          due_date: string | null
          financial_year_id: string | null
          id: string
          igst_total: number
          invoice_category: string
          invoice_date: string
          invoice_number: string
          invoice_type: string
          notes: string | null
          payment_method: string | null
          payment_reference: string | null
          payment_status: string
          revenue_transaction_id: string | null
          sgst_total: number
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          amount_paid?: number
          business_address?: string | null
          business_gstin: string
          business_name: string
          business_state?: string | null
          business_state_code?: string | null
          cgst_total?: number
          city?: string | null
          created_at?: string
          credit_note_disposition?: string | null
          credit_note_for?: string | null
          customer_email?: string | null
          customer_gstin?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_state?: string | null
          customer_state_code?: string | null
          customer_user_id?: string | null
          due_date?: string | null
          financial_year_id?: string | null
          id?: string
          igst_total?: number
          invoice_category?: string
          invoice_date?: string
          invoice_number: string
          invoice_type?: string
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          revenue_transaction_id?: string | null
          sgst_total?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          amount_paid?: number
          business_address?: string | null
          business_gstin?: string
          business_name?: string
          business_state?: string | null
          business_state_code?: string | null
          cgst_total?: number
          city?: string | null
          created_at?: string
          credit_note_disposition?: string | null
          credit_note_for?: string | null
          customer_email?: string | null
          customer_gstin?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_state?: string | null
          customer_state_code?: string | null
          customer_user_id?: string | null
          due_date?: string | null
          financial_year_id?: string | null
          id?: string
          igst_total?: number
          invoice_category?: string
          invoice_date?: string
          invoice_number?: string
          invoice_type?: string
          notes?: string | null
          payment_method?: string | null
          payment_reference?: string | null
          payment_status?: string
          revenue_transaction_id?: string | null
          sgst_total?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_credit_note_for_fkey"
            columns: ["credit_note_for"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_revenue_transaction_id_fkey"
            columns: ["revenue_transaction_id"]
            isOneToOne: false
            referencedRelation: "revenue_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      league_audit_log: {
        Row: {
          action: string
          actor_id: string
          actor_role: string
          after_data: Json | null
          before_data: Json | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          league_id: string | null
          tenant_id: string
        }
        Insert: {
          action: string
          actor_id: string
          actor_role: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          league_id?: string | null
          tenant_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          actor_role?: string
          after_data?: Json | null
          before_data?: Json | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          league_id?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_audit_log_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_awards: {
        Row: {
          award_type: string
          created_at: string
          created_by: string
          detail: string | null
          id: string
          is_manual: boolean
          league_id: string
          name: string
          tenant_id: string
          updated_at: string
          value: number | null
          winner_player_id: string | null
          winner_team_id: string | null
        }
        Insert: {
          award_type: string
          created_at?: string
          created_by: string
          detail?: string | null
          id?: string
          is_manual?: boolean
          league_id: string
          name: string
          tenant_id: string
          updated_at?: string
          value?: number | null
          winner_player_id?: string | null
          winner_team_id?: string | null
        }
        Update: {
          award_type?: string
          created_at?: string
          created_by?: string
          detail?: string | null
          id?: string
          is_manual?: boolean
          league_id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
          value?: number | null
          winner_player_id?: string | null
          winner_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_awards_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_awards_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_awards_winner_player_id_fkey"
            columns: ["winner_player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_awards_winner_team_id_fkey"
            columns: ["winner_team_id"]
            isOneToOne: false
            referencedRelation: "league_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_bay_blocks: {
        Row: {
          bay_id: string
          blocked_by: string
          blocked_from: string
          blocked_to: string
          created_at: string
          id: string
          reason: string | null
          tenant_id: string
        }
        Insert: {
          bay_id: string
          blocked_by: string
          blocked_from: string
          blocked_to: string
          created_at?: string
          id?: string
          reason?: string | null
          tenant_id: string
        }
        Update: {
          bay_id?: string
          blocked_by?: string
          blocked_from?: string
          blocked_to?: string
          created_at?: string
          id?: string
          reason?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_bay_blocks_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_bay_blocks_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_bay_bookings: {
        Row: {
          bay_id: string
          booked_by: string
          booking_method: string
          created_at: string
          duration_minutes: number
          id: string
          league_id: string
          max_players: number
          notes: string | null
          players: string[]
          scheduled_at: string
          scheduled_end: string
          status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          bay_id: string
          booked_by: string
          booking_method?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          league_id: string
          max_players?: number
          notes?: string | null
          players?: string[]
          scheduled_at: string
          scheduled_end: string
          status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          bay_id?: string
          booked_by?: string
          booking_method?: string
          created_at?: string
          duration_minutes?: number
          id?: string
          league_id?: string
          max_players?: number
          notes?: string | null
          players?: string[]
          scheduled_at?: string
          scheduled_end?: string
          status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_bay_bookings_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_bay_bookings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_bay_bookings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_bay_mappings: {
        Row: {
          bay_id: string
          created_at: string
          created_by: string
          id: string
          league_id: string
          league_location_id: string
          tenant_id: string
        }
        Insert: {
          bay_id: string
          created_at?: string
          created_by: string
          id?: string
          league_id: string
          league_location_id: string
          tenant_id: string
        }
        Update: {
          bay_id?: string
          created_at?: string
          created_by?: string
          id?: string
          league_id?: string
          league_location_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_bay_mappings_bay_id_fkey"
            columns: ["bay_id"]
            isOneToOne: false
            referencedRelation: "bays"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_bay_mappings_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_bay_mappings_league_location_id_fkey"
            columns: ["league_location_id"]
            isOneToOne: false
            referencedRelation: "league_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_bay_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_branding: {
        Row: {
          created_at: string
          id: string
          league_id: string
          logo_url: string | null
          placement_slots: Json
          sponsor_logo_url: string | null
          sponsor_name: string | null
          sponsor_url: string | null
          updated_at: string
          valid_from: string | null
          valid_to: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          league_id: string
          logo_url?: string | null
          placement_slots?: Json
          sponsor_logo_url?: string | null
          sponsor_name?: string | null
          sponsor_url?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string
          logo_url?: string | null
          placement_slots?: Json
          sponsor_logo_url?: string | null
          sponsor_name?: string | null
          sponsor_url?: string | null
          updated_at?: string
          valid_from?: string | null
          valid_to?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "league_branding_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_cities: {
        Row: {
          created_at: string
          created_by: string
          display_order: number
          id: string
          league_id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          display_order?: number
          id?: string
          league_id: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          display_order?: number
          id?: string
          league_id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_cities_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_cities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_competitions: {
        Row: {
          created_at: string
          description: string | null
          id: string
          league_id: string
          name: string
          points_config: Json
          round_id: string
          sort_order: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          league_id: string
          name: string
          points_config?: Json
          round_id: string
          sort_order?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          league_id?: string
          name?: string
          points_config?: Json
          round_id?: string
          sort_order?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_competitions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_competitions_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "league_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_competitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_feed_items: {
        Row: {
          actor_id: string
          created_at: string
          event_type: string
          id: string
          league_id: string
          payload: Json
          tenant_id: string
        }
        Insert: {
          actor_id: string
          created_at?: string
          event_type: string
          id?: string
          league_id: string
          payload?: Json
          tenant_id: string
        }
        Update: {
          actor_id?: string
          created_at?: string
          event_type?: string
          id?: string
          league_id?: string
          payload?: Json
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_feed_items_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_feed_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_feed_reactions: {
        Row: {
          created_at: string
          emoji: string
          feed_item_id: string
          id: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          emoji?: string
          feed_item_id: string
          id?: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          emoji?: string
          feed_item_id?: string
          id?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_feed_reactions_feed_item_id_fkey"
            columns: ["feed_item_id"]
            isOneToOne: false
            referencedRelation: "league_feed_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_feed_reactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_join_codes: {
        Row: {
          code: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          league_id: string
          max_uses: number
          revoked_at: string | null
          team_id: string | null
          use_count: number
        }
        Insert: {
          code: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          league_id: string
          max_uses?: number
          revoked_at?: string | null
          team_id?: string | null
          use_count?: number
        }
        Update: {
          code?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          league_id?: string
          max_uses?: number
          revoked_at?: string | null
          team_id?: string | null
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_join_codes_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_join_codes_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "league_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_lite_venues: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      league_locations: {
        Row: {
          created_at: string
          created_by: string
          display_order: number
          id: string
          league_city_id: string
          league_id: string
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          display_order?: number
          id?: string
          league_city_id: string
          league_id: string
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          display_order?: number
          id?: string
          league_city_id?: string
          league_id?: string
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_locations_league_city_id_fkey"
            columns: ["league_city_id"]
            isOneToOne: false
            referencedRelation: "league_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_locations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_locations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_players: {
        Row: {
          id: string
          joined_at: string
          joined_via_code_id: string | null
          league_city_id: string | null
          league_id: string
          league_location_id: string | null
          team_id: string | null
          user_id: string
        }
        Insert: {
          id?: string
          joined_at?: string
          joined_via_code_id?: string | null
          league_city_id?: string | null
          league_id: string
          league_location_id?: string | null
          team_id?: string | null
          user_id: string
        }
        Update: {
          id?: string
          joined_at?: string
          joined_via_code_id?: string | null
          league_city_id?: string | null
          league_id?: string
          league_location_id?: string | null
          team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_players_joined_via_code_id_fkey"
            columns: ["joined_via_code_id"]
            isOneToOne: false
            referencedRelation: "league_join_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_players_league_city_id_fkey"
            columns: ["league_city_id"]
            isOneToOne: false
            referencedRelation: "league_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_players_league_location_id_fkey"
            columns: ["league_location_id"]
            isOneToOne: false
            referencedRelation: "league_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_players_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "league_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_roles: {
        Row: {
          created_at: string
          id: string
          league_id: string | null
          role: Database["public"]["Enums"]["league_role_type"]
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          league_id?: string | null
          role: Database["public"]["Enums"]["league_role_type"]
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          league_id?: string | null
          role?: Database["public"]["Enums"]["league_role_type"]
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_roles_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_roles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_round_hidden_holes: {
        Row: {
          created_at: string
          hidden_holes: number[]
          id: string
          league_id: string
          revealed_at: string | null
          round_number: number
          selected_by: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          hidden_holes: number[]
          id?: string
          league_id: string
          revealed_at?: string | null
          round_number: number
          selected_by: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          hidden_holes?: number[]
          id?: string
          league_id?: string
          revealed_at?: string | null
          round_number?: number
          selected_by?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_round_hidden_holes_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_round_hidden_holes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_rounds: {
        Row: {
          created_at: string
          description: string | null
          end_date: string
          id: string
          league_id: string
          name: string
          par_per_hole: number[]
          round_number: number
          start_date: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          end_date: string
          id?: string
          league_id: string
          name: string
          par_per_hole?: number[]
          round_number: number
          start_date: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          end_date?: string
          id?: string
          league_id?: string
          name?: string
          par_per_hole?: number[]
          round_number?: number
          start_date?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_rounds_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_rounds_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_scores: {
        Row: {
          confirmed_at: string | null
          created_at: string
          hole_scores: Json
          id: string
          league_id: string
          method: Database["public"]["Enums"]["score_entry_method"]
          photo_url: string | null
          player_id: string
          round_number: number
          submitted_by: string
          tenant_id: string
          total_score: number | null
          updated_at: string
        }
        Insert: {
          confirmed_at?: string | null
          created_at?: string
          hole_scores?: Json
          id?: string
          league_id: string
          method?: Database["public"]["Enums"]["score_entry_method"]
          photo_url?: string | null
          player_id: string
          round_number?: number
          submitted_by: string
          tenant_id: string
          total_score?: number | null
          updated_at?: string
        }
        Update: {
          confirmed_at?: string | null
          created_at?: string
          hole_scores?: Json
          id?: string
          league_id?: string
          method?: Database["public"]["Enums"]["score_entry_method"]
          photo_url?: string | null
          player_id?: string
          round_number?: number
          submitted_by?: string
          tenant_id?: string
          total_score?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_scores_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_scores_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_season_snapshots: {
        Row: {
          completed_at: string
          completed_by: string
          created_at: string
          gross_standings: Json
          id: string
          league_id: string
          net_standings: Json
          stats: Json
          tenant_id: string
          updated_at: string
        }
        Insert: {
          completed_at?: string
          completed_by: string
          created_at?: string
          gross_standings?: Json
          id?: string
          league_id: string
          net_standings?: Json
          stats?: Json
          tenant_id: string
          updated_at?: string
        }
        Update: {
          completed_at?: string
          completed_by?: string
          created_at?: string
          gross_standings?: Json
          id?: string
          league_id?: string
          net_standings?: Json
          stats?: Json
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_season_snapshots_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: true
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_season_snapshots_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      league_team_members: {
        Row: {
          assigned_at: string
          assigned_by: string
          id: string
          player_id: string
          team_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by: string
          id?: string
          player_id: string
          team_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string
          id?: string
          player_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_team_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "league_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "league_teams"
            referencedColumns: ["id"]
          },
        ]
      }
      league_teams: {
        Row: {
          created_at: string
          created_by: string
          id: string
          league_city_id: string | null
          league_id: string
          league_location_id: string | null
          max_roster_size: number
          name: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          league_city_id?: string | null
          league_id: string
          league_location_id?: string | null
          max_roster_size?: number
          name: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          league_city_id?: string | null
          league_id?: string
          league_location_id?: string | null
          max_roster_size?: number
          name?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_teams_league_city_id_fkey"
            columns: ["league_city_id"]
            isOneToOne: false
            referencedRelation: "league_cities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_league_location_id_fkey"
            columns: ["league_location_id"]
            isOneToOne: false
            referencedRelation: "league_locations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_teams_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          allowed_team_sizes: number[]
          created_at: string
          created_by: string
          currency: string
          fairness_factor_pct: number
          format: Database["public"]["Enums"]["league_format"]
          id: string
          leaderboard_visibility: string
          name: string
          peoria_multiplier: number
          price_per_person: number
          score_entry_method: Database["public"]["Enums"]["score_entry_method"]
          scoring_holes: number
          season_end: string | null
          season_start: string | null
          show_on_landing: boolean
          status: Database["public"]["Enums"]["league_status"]
          team_aggregation_method: string
          tenant_id: string
          updated_at: string
          venue_id: string | null
        }
        Insert: {
          allowed_team_sizes?: number[]
          created_at?: string
          created_by: string
          currency?: string
          fairness_factor_pct?: number
          format?: Database["public"]["Enums"]["league_format"]
          id?: string
          leaderboard_visibility?: string
          name: string
          peoria_multiplier?: number
          price_per_person?: number
          score_entry_method?: Database["public"]["Enums"]["score_entry_method"]
          scoring_holes?: number
          season_end?: string | null
          season_start?: string | null
          show_on_landing?: boolean
          status?: Database["public"]["Enums"]["league_status"]
          team_aggregation_method?: string
          tenant_id: string
          updated_at?: string
          venue_id?: string | null
        }
        Update: {
          allowed_team_sizes?: number[]
          created_at?: string
          created_by?: string
          currency?: string
          fairness_factor_pct?: number
          format?: Database["public"]["Enums"]["league_format"]
          id?: string
          leaderboard_visibility?: string
          name?: string
          peoria_multiplier?: number
          price_per_person?: number
          score_entry_method?: Database["public"]["Enums"]["score_entry_method"]
          scoring_holes?: number
          season_end?: string | null
          season_start?: string | null
          show_on_landing?: boolean
          status?: Database["public"]["Enums"]["league_status"]
          team_aggregation_method?: string
          tenant_id?: string
          updated_at?: string
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leagues_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues_lite: {
        Row: {
          allowed_team_sizes: number[]
          created_at: string
          created_by: string | null
          currency: string
          id: string
          is_active: boolean
          multi_location: boolean
          name: string | null
          price_per_person: number
          show_on_landing: boolean
          updated_at: string
        }
        Insert: {
          allowed_team_sizes?: number[]
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          multi_location?: boolean
          name?: string | null
          price_per_person?: number
          show_on_landing?: boolean
          updated_at?: string
        }
        Update: {
          allowed_team_sizes?: number[]
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          is_active?: boolean
          multi_location?: boolean
          name?: string | null
          price_per_person?: number
          show_on_landing?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      leagues_lite_venues: {
        Row: {
          created_at: string
          league_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          league_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          league_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leagues_lite_venues_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues_lite"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_lite_venues_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "league_lite_venues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues_only_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      loyalty_bonuses: {
        Row: {
          bonus_type: string
          bonus_value: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          sort_order: number
          trigger_conditions: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          bonus_type?: string
          bonus_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          sort_order?: number
          trigger_conditions?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          bonus_type?: string
          bonus_value?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          sort_order?: number
          trigger_conditions?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_config: {
        Row: {
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      loyalty_earning_rules: {
        Row: {
          base_rate: number
          conditions: Json
          created_at: string
          event_type: string
          id: string
          is_active: boolean
          label: string
          rate_unit: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          base_rate?: number
          conditions?: Json
          created_at?: string
          event_type: string
          id?: string
          is_active?: boolean
          label: string
          rate_unit?: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          base_rate?: number
          conditions?: Json
          created_at?: string
          event_type?: string
          id?: string
          is_active?: boolean
          label?: string
          rate_unit?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_milestones: {
        Row: {
          bonus_points: number
          created_at: string
          id: string
          is_active: boolean
          milestone_type: string
          name: string
          sort_order: number
          threshold_hours: number
          updated_at: string
        }
        Insert: {
          bonus_points: number
          created_at?: string
          id?: string
          is_active?: boolean
          milestone_type: string
          name: string
          sort_order?: number
          threshold_hours: number
          updated_at?: string
        }
        Update: {
          bonus_points?: number
          created_at?: string
          id?: string
          is_active?: boolean
          milestone_type?: string
          name?: string
          sort_order?: number
          threshold_hours?: number
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_multipliers: {
        Row: {
          condition_type: string
          condition_value: Json
          created_at: string
          id: string
          is_active: boolean
          is_stackable: boolean
          multiplier: number
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          condition_type: string
          condition_value?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          is_stackable?: boolean
          multiplier?: number
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          condition_type?: string
          condition_value?: Json
          created_at?: string
          id?: string
          is_active?: boolean
          is_stackable?: boolean
          multiplier?: number
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_user_progress: {
        Row: {
          created_at: string
          hours_logged: number
          id: string
          milestones_achieved: Json
          period_end: string
          period_start: string
          period_type: string
          updated_at: string
          user_id: string
          visit_count: number
        }
        Insert: {
          created_at?: string
          hours_logged?: number
          id?: string
          milestones_achieved?: Json
          period_end: string
          period_start: string
          period_type: string
          updated_at?: string
          user_id: string
          visit_count?: number
        }
        Update: {
          created_at?: string
          hours_logged?: number
          id?: string
          milestones_achieved?: Json
          period_end?: string
          period_start?: string
          period_type?: string
          updated_at?: string
          user_id?: string
          visit_count?: number
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
          action_url: string | null
          created_at: string
          id: string
          is_read: boolean
          message: string
          title: string
          type: string
          user_id: string
        }
        Insert: {
          action_url?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          title: string
          type?: string
          user_id: string
        }
        Update: {
          action_url?: string | null
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
      offline_payment_methods: {
        Row: {
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          sort_order?: number
          updated_at?: string
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
      payment_events: {
        Row: {
          amount_paise: number | null
          city: string | null
          created_at: string
          currency: string | null
          event_type: string
          id: string
          processed: boolean
          raw_payload: Json | null
          razorpay_event_id: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
        }
        Insert: {
          amount_paise?: number | null
          city?: string | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          processed?: boolean
          raw_payload?: Json | null
          razorpay_event_id: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
        }
        Update: {
          amount_paise?: number | null
          city?: string | null
          created_at?: string
          currency?: string | null
          event_type?: string
          id?: string
          processed?: boolean
          raw_payload?: Json | null
          razorpay_event_id?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
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
      pending_guest_bookings: {
        Row: {
          amount: number
          bay_id: string | null
          bay_name: string | null
          calendar_email: string | null
          city: string
          created_at: string
          currency: string
          duration_minutes: number
          end_time: string
          error_message: string | null
          finalized_at: string | null
          guest_email: string
          guest_name: string
          guest_phone: string | null
          id: string
          razorpay_order_id: string
          session_type: string | null
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          amount?: number
          bay_id?: string | null
          bay_name?: string | null
          calendar_email?: string | null
          city: string
          created_at?: string
          currency?: string
          duration_minutes: number
          end_time: string
          error_message?: string | null
          finalized_at?: string | null
          guest_email: string
          guest_name: string
          guest_phone?: string | null
          id?: string
          razorpay_order_id: string
          session_type?: string | null
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          bay_id?: string | null
          bay_name?: string | null
          calendar_email?: string | null
          city?: string
          created_at?: string
          currency?: string
          duration_minutes?: number
          end_time?: string
          error_message?: string | null
          finalized_at?: string | null
          guest_email?: string
          guest_name?: string
          guest_phone?: string | null
          id?: string
          razorpay_order_id?: string
          session_type?: string | null
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pending_purchases: {
        Row: {
          city: string
          created_at: string
          currency: string
          error_message: string | null
          hours_transaction_id: string | null
          id: string
          package_hours: number
          package_label: string
          package_price: number
          razorpay_order_id: string
          revenue_transaction_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          city: string
          created_at?: string
          currency?: string
          error_message?: string | null
          hours_transaction_id?: string | null
          id?: string
          package_hours: number
          package_label?: string
          package_price: number
          razorpay_order_id: string
          revenue_transaction_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          currency?: string
          error_message?: string | null
          hours_transaction_id?: string | null
          id?: string
          package_hours?: number
          package_label?: string
          package_price?: number
          razorpay_order_id?: string
          revenue_transaction_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      points_transactions: {
        Row: {
          base_points: number | null
          booking_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          event_metadata: Json | null
          event_type: string | null
          id: string
          multipliers_applied: Json | null
          points: number
          reason: string | null
          reward_id: string | null
          rule_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          base_points?: number | null
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_metadata?: Json | null
          event_type?: string | null
          id?: string
          multipliers_applied?: Json | null
          points: number
          reason?: string | null
          reward_id?: string | null
          rule_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          base_points?: number | null
          booking_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          event_metadata?: Json | null
          event_type?: string | null
          id?: string
          multipliers_applied?: Json | null
          points?: number
          reason?: string | null
          reward_id?: string | null
          rule_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "points_transactions_booking_id_fkey"
            columns: ["booking_id"]
            isOneToOne: false
            referencedRelation: "bookings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_transactions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "rewards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "points_transactions_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "loyalty_earning_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          badge: string | null
          bookable: boolean
          category: string
          city: string | null
          colors: string[] | null
          corporate_account_id: string | null
          cost_price: number
          created_at: string
          description: string | null
          duration_minutes: number | null
          gst_rate: number
          hsn_code: string | null
          id: string
          image_url: string | null
          in_stock: boolean | null
          item_type: string
          name: string
          opening_stock: number | null
          price: number
          reorder_level: number | null
          reorder_quantity: number | null
          sac_code: string | null
          sizes: string[] | null
          sku: string | null
          sort_order: number | null
          type: string
          unit_of_measure: string
          updated_at: string
        }
        Insert: {
          badge?: string | null
          bookable?: boolean
          category?: string
          city?: string | null
          colors?: string[] | null
          corporate_account_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          item_type?: string
          name: string
          opening_stock?: number | null
          price?: number
          reorder_level?: number | null
          reorder_quantity?: number | null
          sac_code?: string | null
          sizes?: string[] | null
          sku?: string | null
          sort_order?: number | null
          type?: string
          unit_of_measure?: string
          updated_at?: string
        }
        Update: {
          badge?: string | null
          bookable?: boolean
          category?: string
          city?: string | null
          colors?: string[] | null
          corporate_account_id?: string | null
          cost_price?: number
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          gst_rate?: number
          hsn_code?: string | null
          id?: string
          image_url?: string | null
          in_stock?: boolean | null
          item_type?: string
          name?: string
          opening_stock?: number | null
          price?: number
          reorder_level?: number | null
          reorder_quantity?: number | null
          sac_code?: string | null
          sizes?: string[] | null
          sku?: string | null
          sort_order?: number | null
          type?: string
          unit_of_measure?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_corporate_account_id_fkey"
            columns: ["corporate_account_id"]
            isOneToOne: false
            referencedRelation: "corporate_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          apple_user_id: string | null
          avatar_url: string | null
          billing_mode: string
          corporate_account_id: string | null
          created_at: string
          display_name: string | null
          email: string | null
          extended_hours_access: boolean
          handicap: number | null
          id: string
          phone: string | null
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
          billing_mode?: string
          corporate_account_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          extended_hours_access?: boolean
          handicap?: number | null
          id?: string
          phone?: string | null
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
          billing_mode?: string
          corporate_account_id?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          extended_hours_access?: boolean
          handicap?: number | null
          id?: string
          phone?: string | null
          points?: number | null
          preferred_city?: string | null
          tier?: string | null
          total_rounds?: number | null
          updated_at?: string
          user_id?: string | null
          user_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_corporate_account_id_fkey"
            columns: ["corporate_account_id"]
            isOneToOne: false
            referencedRelation: "corporate_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      qc_entries: {
        Row: {
          amount: number
          competition_id: string
          created_at: string
          currency: string
          id: string
          phone: string
          player_id: string | null
          player_name: string
          razorpay_order_id: string | null
          razorpay_payment_id: string | null
          refund_id: string | null
          refunded_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          competition_id: string
          created_at?: string
          currency?: string
          id?: string
          phone: string
          player_id?: string | null
          player_name: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          refund_id?: string | null
          refunded_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          competition_id?: string
          created_at?: string
          currency?: string
          id?: string
          phone?: string
          player_id?: string | null
          player_name?: string
          razorpay_order_id?: string | null
          razorpay_payment_id?: string | null
          refund_id?: string | null
          refunded_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qc_entries_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "quick_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "qc_entries_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "quick_competition_players"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_competition_attempts: {
        Row: {
          competition_id: string
          created_at: string
          created_by: string | null
          distance: number
          excluded: boolean
          id: string
          offline: number
          player_id: string
          set_number: number | null
          shot_number: number | null
        }
        Insert: {
          competition_id: string
          created_at?: string
          created_by?: string | null
          distance: number
          excluded?: boolean
          id?: string
          offline: number
          player_id: string
          set_number?: number | null
          shot_number?: number | null
        }
        Update: {
          competition_id?: string
          created_at?: string
          created_by?: string | null
          distance?: number
          excluded?: boolean
          id?: string
          offline?: number
          player_id?: string
          set_number?: number | null
          shot_number?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "quick_competition_attempts_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "quick_competitions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_competition_attempts_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "quick_competition_players"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_competition_audit: {
        Row: {
          action: string
          actor_id: string | null
          competition_id: string
          created_at: string
          details: Json | null
          id: string
        }
        Insert: {
          action: string
          actor_id?: string | null
          competition_id: string
          created_at?: string
          details?: Json | null
          id?: string
        }
        Update: {
          action?: string
          actor_id?: string | null
          competition_id?: string
          created_at?: string
          details?: Json | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_competition_audit_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "quick_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_competition_categories: {
        Row: {
          competition_id: string
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          competition_id: string
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          competition_id?: string
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "quick_competition_categories_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "quick_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_competition_players: {
        Row: {
          category_id: string | null
          competition_id: string
          created_at: string
          id: string
          name: string
        }
        Insert: {
          category_id?: string | null
          competition_id: string
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          category_id?: string | null
          competition_id?: string
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_competition_players_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "quick_competition_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quick_competition_players_competition_id_fkey"
            columns: ["competition_id"]
            isOneToOne: false
            referencedRelation: "quick_competitions"
            referencedColumns: ["id"]
          },
        ]
      }
      quick_competitions: {
        Row: {
          categories_enabled: boolean
          category_winners: Json | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          entry_currency: string
          entry_fee: number | null
          entry_type: string
          format: string
          id: string
          longest_card_url: string | null
          longest_winner_player_id: string | null
          longest_winner_value: number | null
          max_attempts: number
          name: string
          refunds_allowed: boolean
          runners_up: Json | null
          sponsor_enabled: boolean
          sponsor_logo_url: string | null
          status: string
          straightest_card_url: string | null
          straightest_winner_player_id: string | null
          straightest_winner_value: number | null
          tenant_id: string
          uld_location_logo_url: string | null
          uld_logo_url: string | null
          uld_max_offline: number | null
          uld_set_duration_seconds: number
          uld_sets_per_player: number
          uld_shots_per_set: number
          unit: string
          updated_at: string
        }
        Insert: {
          categories_enabled?: boolean
          category_winners?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          entry_currency?: string
          entry_fee?: number | null
          entry_type?: string
          format?: string
          id?: string
          longest_card_url?: string | null
          longest_winner_player_id?: string | null
          longest_winner_value?: number | null
          max_attempts?: number
          name: string
          refunds_allowed?: boolean
          runners_up?: Json | null
          sponsor_enabled?: boolean
          sponsor_logo_url?: string | null
          status?: string
          straightest_card_url?: string | null
          straightest_winner_player_id?: string | null
          straightest_winner_value?: number | null
          tenant_id: string
          uld_location_logo_url?: string | null
          uld_logo_url?: string | null
          uld_max_offline?: number | null
          uld_set_duration_seconds?: number
          uld_sets_per_player?: number
          uld_shots_per_set?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          categories_enabled?: boolean
          category_winners?: Json | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          entry_currency?: string
          entry_fee?: number | null
          entry_type?: string
          format?: string
          id?: string
          longest_card_url?: string | null
          longest_winner_player_id?: string | null
          longest_winner_value?: number | null
          max_attempts?: number
          name?: string
          refunds_allowed?: boolean
          runners_up?: Json | null
          sponsor_enabled?: boolean
          sponsor_logo_url?: string | null
          status?: string
          straightest_card_url?: string | null
          straightest_winner_player_id?: string | null
          straightest_winner_value?: number | null
          tenant_id?: string
          uld_location_logo_url?: string | null
          uld_logo_url?: string | null
          uld_max_offline?: number | null
          uld_set_duration_seconds?: number
          uld_sets_per_player?: number
          uld_shots_per_set?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quick_competitions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      recycled_invoice_numbers: {
        Row: {
          created_at: string
          financial_year_id: string
          gstin: string
          id: string
          invoice_number_text: string
          number: number
          prefix: string
        }
        Insert: {
          created_at?: string
          financial_year_id: string
          gstin: string
          id?: string
          invoice_number_text: string
          number: number
          prefix?: string
        }
        Update: {
          created_at?: string
          financial_year_id?: string
          gstin?: string
          id?: string
          invoice_number_text?: string
          number?: number
          prefix?: string
        }
        Relationships: [
          {
            foreignKeyName: "recycled_invoice_numbers_financial_year_id_fkey"
            columns: ["financial_year_id"]
            isOneToOne: false
            referencedRelation: "financial_years"
            referencedColumns: ["id"]
          },
        ]
      }
      revenue_transactions: {
        Row: {
          amount: number
          booking_id: string | null
          city: string | null
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
          city?: string | null
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
          city?: string | null
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
          redemption_cap_per_day: number | null
          reward_type: string | null
          reward_value: number | null
          sort_order: number | null
          updated_at: string
          usage_gate_percentage: number | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean | null
          name: string
          points_cost?: number
          redemption_cap_per_day?: number | null
          reward_type?: string | null
          reward_value?: number | null
          sort_order?: number | null
          updated_at?: string
          usage_gate_percentage?: number | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_available?: boolean | null
          name?: string
          points_cost?: number
          redemption_cap_per_day?: number | null
          reward_type?: string | null
          reward_value?: number | null
          sort_order?: number | null
          updated_at?: string
          usage_gate_percentage?: number | null
        }
        Relationships: []
      }
      site_admin_cities: {
        Row: {
          city: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          city: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          city?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      tenants: {
        Row: {
          city: string
          config: Json
          created_at: string
          default_logo_url: string | null
          id: string
          name: string
          sponsorship_enabled: boolean
          updated_at: string
        }
        Insert: {
          city: string
          config?: Json
          created_at?: string
          default_logo_url?: string | null
          id?: string
          name: string
          sponsorship_enabled?: boolean
          updated_at?: string
        }
        Update: {
          city?: string
          config?: Json
          created_at?: string
          default_logo_url?: string | null
          id?: string
          name?: string
          sponsorship_enabled?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      units_of_measure: {
        Row: {
          created_at: string
          id: string
          name: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
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
      vendors: {
        Row: {
          category: string | null
          city: string
          contact_name: string | null
          created_at: string
          email: string | null
          gstin: string | null
          id: string
          is_active: boolean
          name: string
          notes: string | null
          phone: string | null
          updated_at: string
        }
        Insert: {
          category?: string | null
          city: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Update: {
          category?: string | null
          city?: string
          contact_name?: string | null
          created_at?: string
          email?: string | null
          gstin?: string | null
          id?: string
          is_active?: boolean
          name?: string
          notes?: string | null
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      auto_create_invoice_for_revenue: {
        Args: { p_revenue_id: string }
        Returns: string
      }
      backfill_missing_invoices: {
        Args: never
        Returns: {
          invoice_id: string
          revenue_id: string
        }[]
      }
      cancel_booking_with_clawback: {
        Args: { p_booking_id: string; p_cancelled_by?: string }
        Returns: Json
      }
      check_email_rate_limit: {
        Args: { p_max_per_hour?: number; p_user_id: string }
        Returns: boolean
      }
      complete_hour_purchase: {
        Args: {
          p_amount: number
          p_city: string
          p_currency: string
          p_description: string
          p_hours: number
          p_order_id: string
          p_payment_id: string
          p_user_id: string
        }
        Returns: Json
      }
      decrement_user_points_safe: {
        Args: { p_delta: number; p_user_id: string }
        Returns: number
      }
      get_advance_balance: { Args: { p_customer_id: string }; Returns: number }
      get_hours_balance: { Args: { p_user_id: string }; Returns: number }
      get_next_invoice_number: {
        Args: {
          p_fy_id: string
          p_gstin: string
          p_prefix?: string
          p_start?: number
        }
        Returns: string
      }
      get_user_tenant_ids: { Args: { _user_id: string }; Returns: string[] }
      has_city_access: {
        Args: { _city: string; _user_id: string }
        Returns: boolean
      }
      has_league_role: {
        Args: {
          _role: Database["public"]["Enums"]["league_role_type"]
          _tenant_id: string
          _user_id: string
        }
        Returns: boolean
      }
      has_league_role_for_league: {
        Args: {
          _league_id: string
          _role: Database["public"]["Enums"]["league_role_type"]
          _user_id: string
        }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_user_points: {
        Args: { p_delta: number; p_user_id: string }
        Returns: number
      }
      is_admin_or_site_admin: { Args: { _user_id: string }; Returns: boolean }
      is_coach: { Args: { _user_id: string }; Returns: boolean }
      is_franchise_or_site_admin: {
        Args: { _tenant_id: string; _user_id: string }
        Returns: boolean
      }
      upsert_member_hours: {
        Args: { p_hours: number; p_user_id: string }
        Returns: undefined
      }
      validate_coupon: {
        Args: { p_code: string; p_session_id?: string; p_user_id?: string }
        Returns: Json
      }
    }
    Enums: {
      app_role: "admin" | "site_admin" | "user" | "coach"
      league_format:
        | "stroke_play"
        | "match_play"
        | "stableford"
        | "scramble"
        | "best_ball"
        | "skins"
      league_role_type: "franchise_admin" | "league_admin" | "player"
      league_status: "draft" | "active" | "completed" | "archived"
      score_entry_method: "photo_ocr" | "manual" | "api" | "not_set"
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
      app_role: ["admin", "site_admin", "user", "coach"],
      league_format: [
        "stroke_play",
        "match_play",
        "stableford",
        "scramble",
        "best_ball",
        "skins",
      ],
      league_role_type: ["franchise_admin", "league_admin", "player"],
      league_status: ["draft", "active", "completed", "archived"],
      score_entry_method: ["photo_ocr", "manual", "api", "not_set"],
    },
  },
} as const
