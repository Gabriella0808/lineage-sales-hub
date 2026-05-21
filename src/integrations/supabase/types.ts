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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          created_at: string
          description: string | null
          id: string
          manager_id: string | null
          related_to: string | null
          related_type: string | null
          timestamp: string
          title: string
          type: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          related_to?: string | null
          related_type?: string | null
          timestamp?: string
          title: string
          type?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          manager_id?: string | null
          related_to?: string | null
          related_type?: string | null
          timestamp?: string
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activities_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      compare_periods_notes: {
        Row: {
          account: string
          collection: string
          created_at: string
          id: string
          note: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          account: string
          collection: string
          created_at?: string
          id?: string
          note?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          account?: string
          collection?: string
          created_at?: string
          id?: string
          note?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          assigned_to: string | null
          cell: string | null
          company: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          role: string | null
          territory: string | null
          title: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          assigned_to?: string | null
          cell?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          role?: string | null
          territory?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          assigned_to?: string | null
          cell?: string | null
          company?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          role?: string | null
          territory?: string | null
          title?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: []
      }
      customer_quote_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          name: string
          product_id: string | null
          qty: number
          quote_id: string
          sku: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          name: string
          product_id?: string | null
          qty?: number
          quote_id: string
          sku: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          name?: string
          product_id?: string | null
          qty?: number
          quote_id?: string
          sku?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "customer_quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_quotes: {
        Row: {
          created_at: string
          customer_company: string | null
          customer_email: string | null
          customer_name: string
          dealer_user_id: string
          footer_message: string | null
          id: string
          intro_message: string | null
          sent_at: string | null
          share_token: string
          status: string
          total: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_company?: string | null
          customer_email?: string | null
          customer_name: string
          dealer_user_id: string
          footer_message?: string | null
          id?: string
          intro_message?: string | null
          sent_at?: string | null
          share_token?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_company?: string | null
          customer_email?: string | null
          customer_name?: string
          dealer_user_id?: string
          footer_message?: string | null
          id?: string
          intro_message?: string | null
          sent_at?: string | null
          share_token?: string
          status?: string
          total?: number
          updated_at?: string
        }
        Relationships: []
      }
      dealer_branding: {
        Row: {
          company_name: string | null
          contact_address: string | null
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          footer_message: string | null
          intro_message: string | null
          logo_url: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          company_name?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          footer_message?: string | null
          intro_message?: string | null
          logo_url?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          company_name?: string | null
          contact_address?: string | null
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          footer_message?: string | null
          intro_message?: string | null
          logo_url?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dealer_check_ins: {
        Row: {
          brand: string | null
          created_at: string
          dealer_id: string
          id: string
          log_type: string | null
          new_placement: string | null
          notes: string | null
          outcome: string | null
          updated_at: string
          user_id: string
          visit_date: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          dealer_id: string
          id?: string
          log_type?: string | null
          new_placement?: string | null
          notes?: string | null
          outcome?: string | null
          updated_at?: string
          user_id: string
          visit_date?: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          dealer_id?: string
          id?: string
          log_type?: string | null
          new_placement?: string | null
          notes?: string | null
          outcome?: string | null
          updated_at?: string
          user_id?: string
          visit_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_check_ins_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_demand_signals: {
        Row: {
          created_at: string
          dealer_id: string | null
          dealer_name: string | null
          id: string
          notes: string | null
          signal_date: string
          signal_strength: number
          signal_type: string
          sku: string
        }
        Insert: {
          created_at?: string
          dealer_id?: string | null
          dealer_name?: string | null
          id?: string
          notes?: string | null
          signal_date?: string
          signal_strength?: number
          signal_type: string
          sku: string
        }
        Update: {
          created_at?: string
          dealer_id?: string | null
          dealer_name?: string | null
          id?: string
          notes?: string | null
          signal_date?: string
          signal_strength?: number
          signal_type?: string
          sku?: string
        }
        Relationships: []
      }
      dealer_sales: {
        Row: {
          booking_count: number | null
          bookings: number | null
          created_at: string
          dealer_id: string
          id: string
          invoice_count: number | null
          invoices: number | null
          month: string
          order_count: number | null
          revenue: number | null
          updated_at: string
          year: number
        }
        Insert: {
          booking_count?: number | null
          bookings?: number | null
          created_at?: string
          dealer_id: string
          id?: string
          invoice_count?: number | null
          invoices?: number | null
          month: string
          order_count?: number | null
          revenue?: number | null
          updated_at?: string
          year: number
        }
        Update: {
          booking_count?: number | null
          bookings?: number | null
          created_at?: string
          dealer_id?: string
          id?: string
          invoice_count?: number | null
          invoices?: number | null
          month?: string
          order_count?: number | null
          revenue?: number | null
          updated_at?: string
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "dealer_sales_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_sales_lines: {
        Row: {
          booking_count: number
          bookings: number
          created_at: string
          dealer_id: string
          id: string
          invoice_count: number
          invoices: number
          month: string
          product_id: string
          updated_at: string
          year: number
        }
        Insert: {
          booking_count?: number
          bookings?: number
          created_at?: string
          dealer_id: string
          id?: string
          invoice_count?: number
          invoices?: number
          month: string
          product_id: string
          updated_at?: string
          year: number
        }
        Update: {
          booking_count?: number
          bookings?: number
          created_at?: string
          dealer_id?: string
          id?: string
          invoice_count?: number
          invoices?: number
          month?: string
          product_id?: string
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      dealers: {
        Row: {
          acctivate_id: string | null
          buying_group: string | null
          city: string | null
          created_at: string
          email: string | null
          engagement: string | null
          first_name: string | null
          id: string
          last_contact: string | null
          last_name: string | null
          lat: number | null
          lng: number | null
          name: string
          notes: string | null
          phone: string | null
          rep_id: string | null
          rep_owner: string | null
          revenue: number | null
          salesperson: string | null
          state: string | null
          status: string
          street_address: string | null
          territory: string | null
          territory_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          acctivate_id?: string | null
          buying_group?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          engagement?: string | null
          first_name?: string | null
          id?: string
          last_contact?: string | null
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          name: string
          notes?: string | null
          phone?: string | null
          rep_id?: string | null
          rep_owner?: string | null
          revenue?: number | null
          salesperson?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          territory?: string | null
          territory_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          acctivate_id?: string | null
          buying_group?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          engagement?: string | null
          first_name?: string | null
          id?: string
          last_contact?: string | null
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          name?: string
          notes?: string | null
          phone?: string | null
          rep_id?: string | null
          rep_owner?: string | null
          revenue?: number | null
          salesperson?: string | null
          state?: string | null
          status?: string
          street_address?: string | null
          territory?: string | null
          territory_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dealers_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealers_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          resurrect_attempts: number
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          resurrect_attempts?: number
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          resurrect_attempts?: number
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          per_recipient_throttle_seconds: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          per_recipient_throttle_seconds?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          per_recipient_throttle_seconds?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      inventory: {
        Row: {
          acctivate_id: string | null
          available: number | null
          avg_monthly_sales: number | null
          closeout_initial_qty: number | null
          closeout_units_sold: number | null
          collection: string | null
          created_at: string
          cubes: number | null
          factory: string | null
          forecast_monthly: number | null
          id: string
          in_transit: number | null
          is_clearance: boolean
          is_closeout: boolean
          is_discontinued: boolean
          last_synced_at: string | null
          lead_time_days: number | null
          lead_time_months: number | null
          link: string | null
          list_price: number | null
          months_supply: number | null
          moq: number | null
          on_hand: number | null
          on_hand_nc: number | null
          on_hand_value: number | null
          on_hand_vn: number | null
          on_po: number | null
          on_sales_order: number | null
          product: string
          received_date: string | null
          reorder_basis: string | null
          reorder_max: number | null
          reorder_min: number | null
          reorder_override_per_week: number | null
          sku: string
          status: string | null
          supplier: string | null
          unit_cost: number | null
          units_l12m: number | null
          units_l3m: number | null
          units_l6m: number | null
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          available?: number | null
          avg_monthly_sales?: number | null
          closeout_initial_qty?: number | null
          closeout_units_sold?: number | null
          collection?: string | null
          created_at?: string
          cubes?: number | null
          factory?: string | null
          forecast_monthly?: number | null
          id?: string
          in_transit?: number | null
          is_clearance?: boolean
          is_closeout?: boolean
          is_discontinued?: boolean
          last_synced_at?: string | null
          lead_time_days?: number | null
          lead_time_months?: number | null
          link?: string | null
          list_price?: number | null
          months_supply?: number | null
          moq?: number | null
          on_hand?: number | null
          on_hand_nc?: number | null
          on_hand_value?: number | null
          on_hand_vn?: number | null
          on_po?: number | null
          on_sales_order?: number | null
          product: string
          received_date?: string | null
          reorder_basis?: string | null
          reorder_max?: number | null
          reorder_min?: number | null
          reorder_override_per_week?: number | null
          sku: string
          status?: string | null
          supplier?: string | null
          unit_cost?: number | null
          units_l12m?: number | null
          units_l3m?: number | null
          units_l6m?: number | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          available?: number | null
          avg_monthly_sales?: number | null
          closeout_initial_qty?: number | null
          closeout_units_sold?: number | null
          collection?: string | null
          created_at?: string
          cubes?: number | null
          factory?: string | null
          forecast_monthly?: number | null
          id?: string
          in_transit?: number | null
          is_clearance?: boolean
          is_closeout?: boolean
          is_discontinued?: boolean
          last_synced_at?: string | null
          lead_time_days?: number | null
          lead_time_months?: number | null
          link?: string | null
          list_price?: number | null
          months_supply?: number | null
          moq?: number | null
          on_hand?: number | null
          on_hand_nc?: number | null
          on_hand_value?: number | null
          on_hand_vn?: number | null
          on_po?: number | null
          on_sales_order?: number | null
          product?: string
          received_date?: string | null
          reorder_basis?: string | null
          reorder_max?: number | null
          reorder_min?: number | null
          reorder_override_per_week?: number | null
          sku?: string
          status?: string | null
          supplier?: string | null
          unit_cost?: number | null
          units_l12m?: number | null
          units_l3m?: number | null
          units_l6m?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      kpi_records: {
        Row: {
          conversion_rate: number | null
          created_at: string
          dealer_visits: number | null
          id: string
          month: string
          new_dealers: number | null
          quota: number | null
          rep_id: string
          revenue: number | null
          tasks_completed: number | null
          year: number
        }
        Insert: {
          conversion_rate?: number | null
          created_at?: string
          dealer_visits?: number | null
          id?: string
          month: string
          new_dealers?: number | null
          quota?: number | null
          rep_id: string
          revenue?: number | null
          tasks_completed?: number | null
          year: number
        }
        Update: {
          conversion_rate?: number | null
          created_at?: string
          dealer_visits?: number | null
          id?: string
          month?: string
          new_dealers?: number | null
          quota?: number | null
          rep_id?: string
          revenue?: number | null
          tasks_completed?: number | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "kpi_records_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_sales_events: {
        Row: {
          created_at: string
          dealer_name: string | null
          estimated_value: number
          event_date: string
          id: string
          qty_requested: number
          reason: string | null
          sku: string
        }
        Insert: {
          created_at?: string
          dealer_name?: string | null
          estimated_value?: number
          event_date: string
          id?: string
          qty_requested?: number
          reason?: string | null
          sku: string
        }
        Update: {
          created_at?: string
          dealer_name?: string | null
          estimated_value?: number
          event_date?: string
          id?: string
          qty_requested?: number
          reason?: string | null
          sku?: string
        }
        Relationships: []
      }
      manager_task_assignees: {
        Row: {
          created_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_task_assignees_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "manager_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_tasks: {
        Row: {
          assigned_manager_id: string | null
          assigned_user_id: string | null
          board_id: string | null
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          group_id: string | null
          id: string
          position: number | null
          status: Database["public"]["Enums"]["manager_task_status"]
          title: string
          updated_at: string
          user_id: string
          visibility: string
        }
        Insert: {
          assigned_manager_id?: string | null
          assigned_user_id?: string | null
          board_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          group_id?: string | null
          id?: string
          position?: number | null
          status?: Database["public"]["Enums"]["manager_task_status"]
          title: string
          updated_at?: string
          user_id: string
          visibility?: string
        }
        Update: {
          assigned_manager_id?: string | null
          assigned_user_id?: string | null
          board_id?: string | null
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          group_id?: string | null
          id?: string
          position?: number | null
          status?: Database["public"]["Enums"]["manager_task_status"]
          title?: string
          updated_at?: string
          user_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_tasks_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "manager_tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "task_board_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      managers: {
        Row: {
          acctivate_id: string | null
          created_at: string
          email: string | null
          id: string
          monday_id: string | null
          name: string
          phone: string | null
          region: string | null
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          monday_id?: string | null
          name: string
          phone?: string | null
          region?: string | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          monday_id?: string | null
          name?: string
          phone?: string | null
          region?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      monday_boards: {
        Row: {
          created_at: string
          id: string
          monday_board_id: string
          name: string
          workspace_name: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          monday_board_id: string
          name: string
          workspace_name?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          monday_board_id?: string
          name?: string
          workspace_name?: string | null
        }
        Relationships: []
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          id: string
          link: string | null
          read_at: string | null
          related_id: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          related_id?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          id?: string
          link?: string | null
          read_at?: string | null
          related_id?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      open_sales_orders: {
        Row: {
          acctivate_id: string | null
          created_at: string
          dealer_id: string | null
          dealer_name: string | null
          extended_value: number
          id: string
          last_synced_at: string | null
          order_date: string | null
          order_number: string | null
          promised_date: string | null
          qty_open: number
          sku: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          created_at?: string
          dealer_id?: string | null
          dealer_name?: string | null
          extended_value?: number
          id?: string
          last_synced_at?: string | null
          order_date?: string | null
          order_number?: string | null
          promised_date?: string | null
          qty_open?: number
          sku: string
          unit_price?: number
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          created_at?: string
          dealer_id?: string | null
          dealer_name?: string | null
          extended_value?: number
          id?: string
          last_synced_at?: string | null
          order_date?: string | null
          order_number?: string | null
          promised_date?: string | null
          qty_open?: number
          sku?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      org_position_dotted_reports: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          position_id: string
          reports_to_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          position_id: string
          reports_to_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          position_id?: string
          reports_to_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_position_dotted_reports_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "org_position_dotted_reports_reports_to_id_fkey"
            columns: ["reports_to_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_position_reviews: {
        Row: {
          areas_for_improvement: string | null
          created_at: string
          created_by: string | null
          goals_next_year: string | null
          id: string
          notes: string | null
          position_id: string
          rating: number | null
          review_year: number
          reviewer_name: string | null
          strengths: string | null
          updated_at: string
        }
        Insert: {
          areas_for_improvement?: string | null
          created_at?: string
          created_by?: string | null
          goals_next_year?: string | null
          id?: string
          notes?: string | null
          position_id: string
          rating?: number | null
          review_year: number
          reviewer_name?: string | null
          strengths?: string | null
          updated_at?: string
        }
        Update: {
          areas_for_improvement?: string | null
          created_at?: string
          created_by?: string | null
          goals_next_year?: string | null
          id?: string
          notes?: string | null
          position_id?: string
          rating?: number | null
          review_year?: number
          reviewer_name?: string | null
          strengths?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_position_reviews_position_id_fkey"
            columns: ["position_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      org_positions: {
        Row: {
          created_at: string
          created_by: string | null
          department: string | null
          holder_name: string | null
          id: string
          job_description: string | null
          main_objectives: string | null
          parent_id: string | null
          position_order: number
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          holder_name?: string | null
          id?: string
          job_description?: string | null
          main_objectives?: string | null
          parent_id?: string | null
          position_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          department?: string | null
          holder_name?: string | null
          id?: string
          job_description?: string | null
          main_objectives?: string | null
          parent_id?: string | null
          position_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "org_positions_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "org_positions"
            referencedColumns: ["id"]
          },
        ]
      }
      product_collections: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      product_price_tiers: {
        Row: {
          created_at: string
          customer_group_label: string
          id: string
          price: number
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_group_label: string
          id?: string
          price?: number
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_group_label?: string
          id?: string
          price?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_price_tiers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          acctivate_id: string | null
          base_price: number | null
          bc_product_id: string | null
          brand: string | null
          category: string | null
          collection: string | null
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          image_urls: string[] | null
          inventory_level: number | null
          is_active: boolean
          last_synced_at: string | null
          name: string | null
          sku: string
          stock_status: string | null
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          base_price?: number | null
          bc_product_id?: string | null
          brand?: string | null
          category?: string | null
          collection?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          inventory_level?: number | null
          is_active?: boolean
          last_synced_at?: string | null
          name?: string | null
          sku: string
          stock_status?: string | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          base_price?: number | null
          bc_product_id?: string | null
          brand?: string | null
          category?: string | null
          collection?: string | null
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          image_urls?: string[] | null
          inventory_level?: number | null
          is_active?: boolean
          last_synced_at?: string | null
          name?: string | null
          sku?: string
          stock_status?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      purchase_order_lines: {
        Row: {
          created_at: string
          eta: string | null
          id: string
          po_id: string | null
          qty_ordered: number
          qty_received: number
          sku: string
          unit_cost: number
        }
        Insert: {
          created_at?: string
          eta?: string | null
          id?: string
          po_id?: string | null
          qty_ordered?: number
          qty_received?: number
          sku: string
          unit_cost?: number
        }
        Update: {
          created_at?: string
          eta?: string | null
          id?: string
          po_id?: string | null
          qty_ordered?: number
          qty_received?: number
          sku?: string
          unit_cost?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchase_order_lines_po_id_fkey"
            columns: ["po_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      purchase_orders: {
        Row: {
          acctivate_id: string | null
          container_type: string | null
          created_at: string
          eta: string | null
          factory: string | null
          id: string
          is_prepaid: boolean
          last_synced_at: string | null
          order_date: string | null
          po_number: string | null
          prepaid_amount: number
          production_stage: string | null
          status: string | null
          total_value: number
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          container_type?: string | null
          created_at?: string
          eta?: string | null
          factory?: string | null
          id?: string
          is_prepaid?: boolean
          last_synced_at?: string | null
          order_date?: string | null
          po_number?: string | null
          prepaid_amount?: number
          production_stage?: string | null
          status?: string | null
          total_value?: number
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          container_type?: string | null
          created_at?: string
          eta?: string | null
          factory?: string | null
          id?: string
          is_prepaid?: boolean
          last_synced_at?: string | null
          order_date?: string | null
          po_number?: string | null
          prepaid_amount?: number
          production_stage?: string | null
          status?: string | null
          total_value?: number
          updated_at?: string
        }
        Relationships: []
      }
      quote_items: {
        Row: {
          created_at: string
          id: string
          line_total: number
          name: string
          product_id: string | null
          qty: number
          quote_id: string
          sku: string
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          line_total?: number
          name: string
          product_id?: string | null
          qty?: number
          quote_id: string
          sku: string
          unit_price?: number
        }
        Update: {
          created_at?: string
          id?: string
          line_total?: number
          name?: string
          product_id?: string | null
          qty?: number
          quote_id?: string
          sku?: string
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          dealer_id: string | null
          id: string
          notes: string | null
          status: string
          submitted_at: string | null
          total: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dealer_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          submitted_at?: string | null
          total?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          dealer_id?: string | null
          id?: string
          notes?: string | null
          status?: string
          submitted_at?: string | null
          total?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rep_targets: {
        Row: {
          annual_target: number
          apr: number
          aug: number
          created_at: string
          created_by: string | null
          dec: number
          feb: number
          id: string
          jan: number
          jul: number
          jun: number
          mar: number
          may: number
          notes: string | null
          nov: number
          oct: number
          rep_id: string
          sep: number
          updated_at: string
          year: number
        }
        Insert: {
          annual_target?: number
          apr?: number
          aug?: number
          created_at?: string
          created_by?: string | null
          dec?: number
          feb?: number
          id?: string
          jan?: number
          jul?: number
          jun?: number
          mar?: number
          may?: number
          notes?: string | null
          nov?: number
          oct?: number
          rep_id: string
          sep?: number
          updated_at?: string
          year: number
        }
        Update: {
          annual_target?: number
          apr?: number
          aug?: number
          created_at?: string
          created_by?: string | null
          dec?: number
          feb?: number
          id?: string
          jan?: number
          jul?: number
          jun?: number
          mar?: number
          may?: number
          notes?: string | null
          nov?: number
          oct?: number
          rep_id?: string
          sep?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      rep_territories: {
        Row: {
          rep_id: string
          territory_id: string
        }
        Insert: {
          rep_id: string
          territory_id: string
        }
        Update: {
          rep_id?: string
          territory_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rep_territories_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rep_territories_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_reps: {
        Row: {
          acctivate_id: string | null
          created_at: string
          email: string | null
          id: string
          kpi_score: number | null
          last_activity: string | null
          manager_id: string | null
          monday_id: string | null
          name: string
          phone: string | null
          quota: number | null
          revenue: number | null
          status: string
          tasks_completed: number | null
          tasks_overdue: number | null
          tasks_pending: number | null
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kpi_score?: number | null
          last_activity?: string | null
          manager_id?: string | null
          monday_id?: string | null
          name: string
          phone?: string | null
          quota?: number | null
          revenue?: number | null
          status?: string
          tasks_completed?: number | null
          tasks_overdue?: number | null
          tasks_pending?: number | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          kpi_score?: number | null
          last_activity?: string | null
          manager_id?: string | null
          monday_id?: string | null
          name?: string
          phone?: string | null
          quota?: number | null
          revenue?: number | null
          status?: string
          tasks_completed?: number | null
          tasks_overdue?: number | null
          tasks_pending?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_reps_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      sign_in_log: {
        Row: {
          id: string
          signed_in_at: string
          user_id: string
        }
        Insert: {
          id?: string
          signed_in_at?: string
          user_id: string
        }
        Update: {
          id?: string
          signed_in_at?: string
          user_id?: string
        }
        Relationships: []
      }
      sku_sales_history: {
        Row: {
          created_at: string
          forecast_units: number | null
          id: string
          month: number
          revenue: number
          sku: string
          units_sold: number
          year: number
        }
        Insert: {
          created_at?: string
          forecast_units?: number | null
          id?: string
          month: number
          revenue?: number
          sku: string
          units_sold?: number
          year: number
        }
        Update: {
          created_at?: string
          forecast_units?: number | null
          id?: string
          month?: number
          revenue?: number
          sku?: string
          units_sold?: number
          year?: number
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      task_assignment_notifications_sent: {
        Row: {
          sent_at: string
          task_id: string
          user_id: string
        }
        Insert: {
          sent_at?: string
          task_id: string
          user_id: string
        }
        Update: {
          sent_at?: string
          task_id?: string
          user_id?: string
        }
        Relationships: []
      }
      task_board_groups: {
        Row: {
          board_id: string
          color: string | null
          created_at: string
          id: string
          name: string
          position: number
          updated_at: string
        }
        Insert: {
          board_id: string
          color?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          updated_at?: string
        }
        Update: {
          board_id?: string
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_board_groups_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      task_board_members: {
        Row: {
          added_by: string
          board_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          added_by: string
          board_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          added_by?: string
          board_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_board_members_board_id_fkey"
            columns: ["board_id"]
            isOneToOne: false
            referencedRelation: "task_boards"
            referencedColumns: ["id"]
          },
        ]
      }
      task_boards: {
        Row: {
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      tasks: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          rep_id: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          rep_id?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          rep_id?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      territories: {
        Row: {
          acctivate_id: string | null
          created_at: string
          id: string
          kpi_score: number | null
          monday_id: string | null
          name: string
          quota: number | null
          region: string | null
          revenue: number | null
          state: string | null
          status: string
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          created_at?: string
          id?: string
          kpi_score?: number | null
          monday_id?: string | null
          name: string
          quota?: number | null
          region?: string | null
          revenue?: number | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          created_at?: string
          id?: string
          kpi_score?: number | null
          monday_id?: string | null
          name?: string
          quota?: number | null
          region?: string | null
          revenue?: number | null
          state?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      trade_show_leads: {
        Row: {
          additional_email: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          dealer: string | null
          email: string | null
          id: string
          lead_date: string | null
          market_id: string | null
          monday_item_id: string | null
          notes: string | null
          order_amount: number | null
          phone: string | null
          product_interest: string | null
          raw: Json | null
          rep_email: string | null
          sales_rep: string | null
          status: string | null
          trade_show: string | null
          updated_at: string
        }
        Insert: {
          additional_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          dealer?: string | null
          email?: string | null
          id?: string
          lead_date?: string | null
          market_id?: string | null
          monday_item_id?: string | null
          notes?: string | null
          order_amount?: number | null
          phone?: string | null
          product_interest?: string | null
          raw?: Json | null
          rep_email?: string | null
          sales_rep?: string | null
          status?: string | null
          trade_show?: string | null
          updated_at?: string
        }
        Update: {
          additional_email?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          dealer?: string | null
          email?: string | null
          id?: string
          lead_date?: string | null
          market_id?: string | null
          monday_item_id?: string | null
          notes?: string | null
          order_amount?: number | null
          phone?: string | null
          product_interest?: string | null
          raw?: Json | null
          rep_email?: string | null
          sales_rep?: string | null
          status?: string | null
          trade_show?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_show_leads_market_id_fkey"
            columns: ["market_id"]
            isOneToOne: false
            referencedRelation: "trade_show_markets"
            referencedColumns: ["id"]
          },
        ]
      }
      trade_show_markets: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          is_active: boolean
          location: string | null
          name: string
          season: string | null
          start_date: string | null
          updated_at: string
          year: number | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name: string
          season?: string | null
          start_date?: string | null
          updated_at?: string
          year?: number | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          is_active?: boolean
          location?: string | null
          name?: string
          season?: string | null
          start_date?: string | null
          updated_at?: string
          year?: number | null
        }
        Relationships: []
      }
      travel_log: {
        Row: {
          approval_status: string | null
          created_at: string
          id: string
          manager_id: string | null
          monday_id: string | null
          notes: string | null
          purpose: string | null
          rep_id: string | null
          salesperson_name: string | null
          territory_id: string | null
          travel_date: string
          travel_end_date: string | null
          updated_at: string
        }
        Insert: {
          approval_status?: string | null
          created_at?: string
          id?: string
          manager_id?: string | null
          monday_id?: string | null
          notes?: string | null
          purpose?: string | null
          rep_id?: string | null
          salesperson_name?: string | null
          territory_id?: string | null
          travel_date: string
          travel_end_date?: string | null
          updated_at?: string
        }
        Update: {
          approval_status?: string | null
          created_at?: string
          id?: string
          manager_id?: string | null
          monday_id?: string | null
          notes?: string | null
          purpose?: string | null
          rep_id?: string | null
          salesperson_name?: string | null
          territory_id?: string | null
          travel_date?: string
          travel_end_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "travel_log_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_log_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "travel_log_territory_id_fkey"
            columns: ["territory_id"]
            isOneToOne: false
            referencedRelation: "territories"
            referencedColumns: ["id"]
          },
        ]
      }
      user_dealers: {
        Row: {
          created_at: string
          dealer_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          dealer_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          dealer_id?: string
          user_id?: string
        }
        Relationships: []
      }
      user_managers: {
        Row: {
          created_at: string
          manager_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          manager_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          manager_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_managers_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reps: {
        Row: {
          created_at: string
          rep_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          rep_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          rep_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_reps_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
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
      _post_task_assigned_email: {
        Args: { _assigner_id: string; _task_id: string; _user_id: string }
        Returns: undefined
      }
      assignable_users: {
        Args: never
        Returns: {
          email: string
          full_name: string
          role: string
          user_id: string
        }[]
      }
      can_view_manager_task: { Args: { _task_id: string }; Returns: boolean }
      can_view_task_board: { Args: { _board_id: string }; Returns: boolean }
      current_dealer_id: { Args: never; Returns: string }
      current_manager_id: { Args: never; Returns: string }
      current_manager_rep_ids: { Args: never; Returns: string[] }
      current_rep_id: { Args: never; Returns: string }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_customer_quote_by_token: {
        Args: { _token: string }
        Returns: {
          company_name: string
          contact_address: string
          contact_email: string
          contact_phone: string
          created_at: string
          customer_company: string
          customer_email: string
          customer_name: string
          dealer_user_id: string
          footer_message: string
          id: string
          intro_message: string
          items: Json
          logo_url: string
          sent_at: string
          status: string
          total: number
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_admin: { Args: never; Returns: boolean }
      is_assigned_manager: { Args: { _manager_id: string }; Returns: boolean }
      is_manager_task_creator: { Args: { _task_id: string }; Returns: boolean }
      is_task_board_creator: { Args: { _board_id: string }; Returns: boolean }
      is_trade_show_task: { Args: { _task_id: string }; Returns: boolean }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
      user_id_for_manager: { Args: { _manager_id: string }; Returns: string }
      user_id_for_rep: { Args: { _rep_id: string }; Returns: string }
      user_id_for_rep_with_email_fallback: {
        Args: { _rep_id: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "manager" | "rep" | "dealer"
      manager_task_status: "todo" | "in_progress" | "blocked" | "done"
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
      app_role: ["admin", "manager", "rep", "dealer"],
      manager_task_status: ["todo", "in_progress", "blocked", "done"],
    },
  },
} as const
