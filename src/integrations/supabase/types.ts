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
      gst_profiles: {
        Row: {
          address: string
          city: string
          created_at: string
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
      invoices: {
        Row: {
          business_address: string | null
          business_gstin: string
          business_name: string
          business_state: string | null
          business_state_code: string | null
          cgst_total: number
          city: string | null
          created_at: string
          credit_note_for: string | null
          customer_email: string | null
          customer_gstin: string | null
          customer_name: string | null
          customer_phone: string | null
          customer_state: string | null
          customer_state_code: string | null
          customer_user_id: string | null
          financial_year_id: string | null
          id: string
          igst_total: number
          invoice_date: string
          invoice_number: string
          invoice_type: string
          payment_method: string | null
          revenue_transaction_id: string | null
          sgst_total: number
          status: string
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          business_address?: string | null
          business_gstin: string
          business_name: string
          business_state?: string | null
          business_state_code?: string | null
          cgst_total?: number
          city?: string | null
          created_at?: string
          credit_note_for?: string | null
          customer_email?: string | null
          customer_gstin?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_state?: string | null
          customer_state_code?: string | null
          customer_user_id?: string | null
          financial_year_id?: string | null
          id?: string
          igst_total?: number
          invoice_date?: string
          invoice_number: string
          invoice_type?: string
          payment_method?: string | null
          revenue_transaction_id?: string | null
          sgst_total?: number
          status?: string
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          business_address?: string | null
          business_gstin?: string
          business_name?: string
          business_state?: string | null
          business_state_code?: string | null
          cgst_total?: number
          city?: string | null
          created_at?: string
          credit_note_for?: string | null
          customer_email?: string | null
          customer_gstin?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          customer_state?: string | null
          customer_state_code?: string | null
          customer_user_id?: string | null
          financial_year_id?: string | null
          id?: string
          igst_total?: number
          invoice_date?: string
          invoice_number?: string
          invoice_type?: string
          payment_method?: string | null
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
      offline_payment_methods: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          label: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
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
          colors: string[] | null
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
          colors?: string[] | null
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
          colors?: string[] | null
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
      get_next_invoice_number: {
        Args: {
          p_fy_id: string
          p_gstin: string
          p_prefix?: string
          p_start?: number
        }
        Returns: string
      }
      has_city_access: {
        Args: { _city: string; _user_id: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin_or_site_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "site_admin" | "user"
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
      app_role: ["admin", "site_admin", "user"],
    },
  },
} as const
