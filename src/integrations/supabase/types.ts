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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      _dealer_owner_staging: {
        Row: {
          dealer_id: string
          owner: string
        }
        Insert: {
          dealer_id: string
          owner: string
        }
        Update: {
          dealer_id?: string
          owner?: string
        }
        Relationships: []
      }
      acctivate_2026_invoice_line_facts: {
        Row: {
          customer_id: string | null
          description: string | null
          guid_invoice: string | null
          guid_invoice_detail: string | null
          id: number
          invoice_date: string | null
          invoice_number: string | null
          line_discount_pct: number | null
          order_number: string | null
          price: number | null
          product_id: string | null
          qty_invoiced: number | null
          sales_category: string | null
          salesperson_id: string | null
          synced_at: string | null
        }
        Insert: {
          customer_id?: string | null
          description?: string | null
          guid_invoice?: string | null
          guid_invoice_detail?: string | null
          id?: never
          invoice_date?: string | null
          invoice_number?: string | null
          line_discount_pct?: number | null
          order_number?: string | null
          price?: number | null
          product_id?: string | null
          qty_invoiced?: number | null
          sales_category?: string | null
          salesperson_id?: string | null
          synced_at?: string | null
        }
        Update: {
          customer_id?: string | null
          description?: string | null
          guid_invoice?: string | null
          guid_invoice_detail?: string | null
          id?: never
          invoice_date?: string | null
          invoice_number?: string | null
          line_discount_pct?: number | null
          order_number?: string | null
          price?: number | null
          product_id?: string | null
          qty_invoiced?: number | null
          sales_category?: string | null
          salesperson_id?: string | null
          synced_at?: string | null
        }
        Relationships: []
      }
      acctivate_company_monthly_actuals: {
        Row: {
          bookings_actual: number | null
          invoiced_actual: number | null
          month_number: number
          synced_at: string | null
          year: number
        }
        Insert: {
          bookings_actual?: number | null
          invoiced_actual?: number | null
          month_number: number
          synced_at?: string | null
          year: number
        }
        Update: {
          bookings_actual?: number | null
          invoiced_actual?: number | null
          month_number?: number
          synced_at?: string | null
          year?: number
        }
        Relationships: []
      }
      acctivate_inventory_value: {
        Row: {
          active: boolean
          avail_on_web: boolean | null
          available: number
          collection: string | null
          description: string | null
          discontinued: boolean
          list_price: number | null
          on_hand: number
          on_hand_value: number
          product_id: string
          synced_at: string
          warehouse: string
        }
        Insert: {
          active?: boolean
          avail_on_web?: boolean | null
          available?: number
          collection?: string | null
          description?: string | null
          discontinued?: boolean
          list_price?: number | null
          on_hand?: number
          on_hand_value?: number
          product_id: string
          synced_at?: string
          warehouse?: string
        }
        Update: {
          active?: boolean
          avail_on_web?: boolean | null
          available?: number
          collection?: string | null
          description?: string | null
          discontinued?: boolean
          list_price?: number | null
          on_hand?: number
          on_hand_value?: number
          product_id?: string
          synced_at?: string
          warehouse?: string
        }
        Relationships: []
      }
      acctivate_invoice_lines_2026_direct: {
        Row: {
          branch_id: string | null
          component_level: string | null
          customer_id: string | null
          description: string | null
          duplicate_row_ordinal: number | null
          formula_net_amount: number | null
          fulfillment_type: string | null
          guid_invoice: string | null
          guid_invoice_detail: string
          invoice_date: string | null
          invoice_detail_amount: number | null
          invoice_number: string | null
          invoice_type: string | null
          line_discount_pct: number | null
          line_number: string | null
          month_number: number | null
          natural_key: string | null
          order_number: string | null
          original_price: number | null
          price: number | null
          product_class: string | null
          product_id: string | null
          product_sales_category: string | null
          qty_invoiced: number | null
          sales_account_id: string | null
          sales_rep_id: string | null
          source: string | null
          source_synced_at: string | null
          sub_line_number: string | null
          transaction_date: string | null
          year: number | null
        }
        Insert: {
          branch_id?: string | null
          component_level?: string | null
          customer_id?: string | null
          description?: string | null
          duplicate_row_ordinal?: number | null
          formula_net_amount?: number | null
          fulfillment_type?: string | null
          guid_invoice?: string | null
          guid_invoice_detail: string
          invoice_date?: string | null
          invoice_detail_amount?: number | null
          invoice_number?: string | null
          invoice_type?: string | null
          line_discount_pct?: number | null
          line_number?: string | null
          month_number?: number | null
          natural_key?: string | null
          order_number?: string | null
          original_price?: number | null
          price?: number | null
          product_class?: string | null
          product_id?: string | null
          product_sales_category?: string | null
          qty_invoiced?: number | null
          sales_account_id?: string | null
          sales_rep_id?: string | null
          source?: string | null
          source_synced_at?: string | null
          sub_line_number?: string | null
          transaction_date?: string | null
          year?: number | null
        }
        Update: {
          branch_id?: string | null
          component_level?: string | null
          customer_id?: string | null
          description?: string | null
          duplicate_row_ordinal?: number | null
          formula_net_amount?: number | null
          fulfillment_type?: string | null
          guid_invoice?: string | null
          guid_invoice_detail?: string
          invoice_date?: string | null
          invoice_detail_amount?: number | null
          invoice_number?: string | null
          invoice_type?: string | null
          line_discount_pct?: number | null
          line_number?: string | null
          month_number?: number | null
          natural_key?: string | null
          order_number?: string | null
          original_price?: number | null
          price?: number | null
          product_class?: string | null
          product_id?: string | null
          product_sales_category?: string | null
          qty_invoiced?: number | null
          sales_account_id?: string | null
          sales_rep_id?: string | null
          source?: string | null
          source_synced_at?: string | null
          sub_line_number?: string | null
          transaction_date?: string | null
          year?: number | null
        }
        Relationships: []
      }
      acctivate_kpi_invoice_lines_2026: {
        Row: {
          description: string | null
          guid_invoice: string | null
          guid_invoice_detail: string
          invoice_date: string | null
          invoice_detail_amount: number | null
          invoice_number: string | null
          product_class: string | null
          product_id: string | null
          qty_invoiced: number | null
          source_synced_at: string | null
          transaction_date: string | null
        }
        Insert: {
          description?: string | null
          guid_invoice?: string | null
          guid_invoice_detail: string
          invoice_date?: string | null
          invoice_detail_amount?: number | null
          invoice_number?: string | null
          product_class?: string | null
          product_id?: string | null
          qty_invoiced?: number | null
          source_synced_at?: string | null
          transaction_date?: string | null
        }
        Update: {
          description?: string | null
          guid_invoice?: string | null
          guid_invoice_detail?: string
          invoice_date?: string | null
          invoice_detail_amount?: number | null
          invoice_number?: string | null
          product_class?: string | null
          product_id?: string | null
          qty_invoiced?: number | null
          source_synced_at?: string | null
          transaction_date?: string | null
        }
        Relationships: []
      }
      acctivate_kpi_monthly_invoiced_2026: {
        Row: {
          invoiced_actual: number
          month_key: string
          month_number: number
          source: string | null
          source_synced_at: string | null
          year: number
        }
        Insert: {
          invoiced_actual: number
          month_key: string
          month_number: number
          source?: string | null
          source_synced_at?: string | null
          year: number
        }
        Update: {
          invoiced_actual?: number
          month_key?: string
          month_number?: number
          source?: string | null
          source_synced_at?: string | null
          year?: number
        }
        Relationships: []
      }
      acctivate_open_purchase_order_lines: {
        Row: {
          container_number: string | null
          description: string | null
          eta_date: string | null
          expected_receipt_date: string | null
          guid_po: string
          guid_po_detail: string
          invoice_due_date: string | null
          open_amount: number | null
          po_number: string | null
          product_class: string | null
          product_id: string | null
          qty_open: number
          qty_ordered: number
          qty_received: number
          source: string
          source_synced_at: string
          total_amount: number | null
          unit_cost: number | null
          vendor_name: string | null
          warehouse: string | null
        }
        Insert: {
          container_number?: string | null
          description?: string | null
          eta_date?: string | null
          expected_receipt_date?: string | null
          guid_po: string
          guid_po_detail: string
          invoice_due_date?: string | null
          open_amount?: number | null
          po_number?: string | null
          product_class?: string | null
          product_id?: string | null
          qty_open?: number
          qty_ordered?: number
          qty_received?: number
          source?: string
          source_synced_at?: string
          total_amount?: number | null
          unit_cost?: number | null
          vendor_name?: string | null
          warehouse?: string | null
        }
        Update: {
          container_number?: string | null
          description?: string | null
          eta_date?: string | null
          expected_receipt_date?: string | null
          guid_po?: string
          guid_po_detail?: string
          invoice_due_date?: string | null
          open_amount?: number | null
          po_number?: string | null
          product_class?: string | null
          product_id?: string | null
          qty_open?: number
          qty_ordered?: number
          qty_received?: number
          source?: string
          source_synced_at?: string
          total_amount?: number | null
          unit_cost?: number | null
          vendor_name?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      acctivate_open_purchase_orders: {
        Row: {
          container_number: string | null
          eta_date: string | null
          expected_receipt_date: string | null
          expected_ship_date: string | null
          guid_po: string
          invoice_due_date: string | null
          open_amount: number | null
          po_date: string | null
          po_number: string | null
          po_status: string | null
          source: string
          source_synced_at: string
          total_amount: number | null
          vendor_id: string | null
          vendor_name: string | null
          warehouse: string | null
        }
        Insert: {
          container_number?: string | null
          eta_date?: string | null
          expected_receipt_date?: string | null
          expected_ship_date?: string | null
          guid_po: string
          invoice_due_date?: string | null
          open_amount?: number | null
          po_date?: string | null
          po_number?: string | null
          po_status?: string | null
          source?: string
          source_synced_at?: string
          total_amount?: number | null
          vendor_id?: string | null
          vendor_name?: string | null
          warehouse?: string | null
        }
        Update: {
          container_number?: string | null
          eta_date?: string | null
          expected_receipt_date?: string | null
          expected_ship_date?: string | null
          guid_po?: string
          invoice_due_date?: string | null
          open_amount?: number | null
          po_date?: string | null
          po_number?: string | null
          po_status?: string | null
          source?: string
          source_synced_at?: string
          total_amount?: number | null
          vendor_id?: string | null
          vendor_name?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      acctivate_open_sales_order_lines: {
        Row: {
          amount: number | null
          customer_id: string | null
          dealer_name: string | null
          description: string | null
          freight_amount: number | null
          guid_order: string
          guid_order_detail: string
          line_discount_pct: number | null
          net_open_amount: number | null
          order_date: string | null
          order_number: string | null
          order_status: string | null
          original_price: number | null
          product_class: string | null
          product_id: string | null
          qty_invoiced: number
          qty_open: number
          qty_ordered: number
          qty_shipped: number
          rep_name: string | null
          requested_ship_date: string | null
          sales_category: string | null
          source: string
          source_synced_at: string
          tariff_amount: number | null
          warehouse: string | null
        }
        Insert: {
          amount?: number | null
          customer_id?: string | null
          dealer_name?: string | null
          description?: string | null
          freight_amount?: number | null
          guid_order: string
          guid_order_detail: string
          line_discount_pct?: number | null
          net_open_amount?: number | null
          order_date?: string | null
          order_number?: string | null
          order_status?: string | null
          original_price?: number | null
          product_class?: string | null
          product_id?: string | null
          qty_invoiced?: number
          qty_open?: number
          qty_ordered?: number
          qty_shipped?: number
          rep_name?: string | null
          requested_ship_date?: string | null
          sales_category?: string | null
          source?: string
          source_synced_at?: string
          tariff_amount?: number | null
          warehouse?: string | null
        }
        Update: {
          amount?: number | null
          customer_id?: string | null
          dealer_name?: string | null
          description?: string | null
          freight_amount?: number | null
          guid_order?: string
          guid_order_detail?: string
          line_discount_pct?: number | null
          net_open_amount?: number | null
          order_date?: string | null
          order_number?: string | null
          order_status?: string | null
          original_price?: number | null
          product_class?: string | null
          product_id?: string | null
          qty_invoiced?: number
          qty_open?: number
          qty_ordered?: number
          qty_shipped?: number
          rep_name?: string | null
          requested_ship_date?: string | null
          sales_category?: string | null
          source?: string
          source_synced_at?: string
          tariff_amount?: number | null
          warehouse?: string | null
        }
        Relationships: []
      }
      acctivate_open_sales_orders: {
        Row: {
          branch_id: string | null
          customer_id: string | null
          dealer_name: string | null
          entry_date: string | null
          freight_amount: number | null
          guid_customer: string | null
          guid_order: string
          guid_salesperson: string | null
          net_open_amount: number | null
          order_date: string | null
          order_number: string | null
          order_status: string | null
          order_type: string | null
          rep_name: string | null
          requested_ship_date: string | null
          sales_rep_id: string | null
          scheduled_ship_date: string | null
          source: string
          source_synced_at: string
          subtotal: number | null
          tariff_amount: number | null
          warehouse: string | null
        }
        Insert: {
          branch_id?: string | null
          customer_id?: string | null
          dealer_name?: string | null
          entry_date?: string | null
          freight_amount?: number | null
          guid_customer?: string | null
          guid_order: string
          guid_salesperson?: string | null
          net_open_amount?: number | null
          order_date?: string | null
          order_number?: string | null
          order_status?: string | null
          order_type?: string | null
          rep_name?: string | null
          requested_ship_date?: string | null
          sales_rep_id?: string | null
          scheduled_ship_date?: string | null
          source?: string
          source_synced_at?: string
          subtotal?: number | null
          tariff_amount?: number | null
          warehouse?: string | null
        }
        Update: {
          branch_id?: string | null
          customer_id?: string | null
          dealer_name?: string | null
          entry_date?: string | null
          freight_amount?: number | null
          guid_customer?: string | null
          guid_order?: string
          guid_salesperson?: string | null
          net_open_amount?: number | null
          order_date?: string | null
          order_number?: string | null
          order_status?: string | null
          order_type?: string | null
          rep_name?: string | null
          requested_ship_date?: string | null
          sales_rep_id?: string | null
          scheduled_ship_date?: string | null
          source?: string
          source_synced_at?: string
          subtotal?: number | null
          tariff_amount?: number | null
          warehouse?: string | null
        }
        Relationships: []
      }
      acctivate_product_master: {
        Row: {
          active_status: string | null
          alternate_product_id: string | null
          description: string | null
          guid_product: string | null
          product_class_id: string | null
          product_id: string
          product_type: string | null
          sales_category: string | null
          source_synced_at: string | null
        }
        Insert: {
          active_status?: string | null
          alternate_product_id?: string | null
          description?: string | null
          guid_product?: string | null
          product_class_id?: string | null
          product_id: string
          product_type?: string | null
          sales_category?: string | null
          source_synced_at?: string | null
        }
        Update: {
          active_status?: string | null
          alternate_product_id?: string | null
          description?: string | null
          guid_product?: string | null
          product_class_id?: string | null
          product_id?: string
          product_type?: string | null
          sales_category?: string | null
          source_synced_at?: string | null
        }
        Relationships: []
      }
      acctivate_sales_managers: {
        Row: {
          acctivate_id: string
          active: boolean | null
          created_at: string
          email: string | null
          id: string
          job_title: string | null
          manager_code: string | null
          name: string
          phone: string | null
          synced_at: string | null
          updated_at: string
        }
        Insert: {
          acctivate_id: string
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          job_title?: string | null
          manager_code?: string | null
          name: string
          phone?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          job_title?: string | null
          manager_code?: string | null
          name?: string
          phone?: string | null
          synced_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      acctivate_sales_reps: {
        Row: {
          acctivate_id: string
          active: boolean | null
          created_at: string
          email: string | null
          id: string
          manager_acctivate_id: string | null
          manager_name: string | null
          name: string
          phone: string | null
          rep_code: string | null
          synced_at: string | null
          territory_acctivate_id: string | null
          territory_code: string | null
          territory_name: string | null
          updated_at: string
        }
        Insert: {
          acctivate_id: string
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          manager_acctivate_id?: string | null
          manager_name?: string | null
          name: string
          phone?: string | null
          rep_code?: string | null
          synced_at?: string | null
          territory_acctivate_id?: string | null
          territory_code?: string | null
          territory_name?: string | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string
          active?: boolean | null
          created_at?: string
          email?: string | null
          id?: string
          manager_acctivate_id?: string | null
          manager_name?: string | null
          name?: string
          phone?: string | null
          rep_code?: string | null
          synced_at?: string | null
          territory_acctivate_id?: string | null
          territory_code?: string | null
          territory_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      acctivate_territories: {
        Row: {
          acctivate_id: string
          active: boolean | null
          created_at: string
          description: string | null
          id: string
          manager_acctivate_id: string | null
          manager_name: string | null
          name: string
          synced_at: string | null
          territory_code: string | null
          updated_at: string
        }
        Insert: {
          acctivate_id: string
          active?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          manager_acctivate_id?: string | null
          manager_name?: string | null
          name: string
          synced_at?: string | null
          territory_code?: string | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string
          active?: boolean | null
          created_at?: string
          description?: string | null
          id?: string
          manager_acctivate_id?: string | null
          manager_name?: string | null
          name?: string
          synced_at?: string | null
          territory_code?: string | null
          updated_at?: string
        }
        Relationships: []
      }
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
      board_template_groups: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          position: number
          template_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          position?: number
          template_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          position?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_template_groups_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "board_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      board_template_tasks: {
        Row: {
          created_at: string
          description: string | null
          group_id: string | null
          id: string
          position: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          position?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          description?: string | null
          group_id?: string | null
          id?: string
          position?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_template_tasks_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "board_template_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_template_tasks_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "board_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      board_templates: {
        Row: {
          archived_at: string | null
          color: string | null
          created_at: string
          created_by: string
          description: string | null
          id: string
          is_builtin: boolean
          name: string
        }
        Insert: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          id?: string
          is_builtin?: boolean
          name: string
        }
        Update: {
          archived_at?: string | null
          color?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          id?: string
          is_builtin?: boolean
          name?: string
        }
        Relationships: []
      }
      booking_orders_sync: {
        Row: {
          branch_id: string | null
          customer_id: string | null
          guid_order: string
          order_date: string | null
          order_status: string | null
          sub_total: number | null
          synced_at: string
        }
        Insert: {
          branch_id?: string | null
          customer_id?: string | null
          guid_order: string
          order_date?: string | null
          order_status?: string | null
          sub_total?: number | null
          synced_at?: string
        }
        Update: {
          branch_id?: string | null
          customer_id?: string | null
          guid_order?: string
          order_date?: string | null
          order_status?: string | null
          sub_total?: number | null
          synced_at?: string
        }
        Relationships: []
      }
      clearance_weekly_sales: {
        Row: {
          created_at: string
          id: string
          import_filename: string | null
          import_id: string
          imported_by: string | null
          product_name: string | null
          qty_sold: number
          rep_name: string | null
          revenue: number | null
          sku: string
          week_start: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_filename?: string | null
          import_id: string
          imported_by?: string | null
          product_name?: string | null
          qty_sold?: number
          rep_name?: string | null
          revenue?: number | null
          sku: string
          week_start: string
        }
        Update: {
          created_at?: string
          id?: string
          import_filename?: string | null
          import_id?: string
          imported_by?: string | null
          product_name?: string | null
          qty_sold?: number
          rep_name?: string | null
          revenue?: number | null
          sku?: string
          week_start?: string
        }
        Relationships: []
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
      crm_account_events: {
        Row: {
          account_id: string | null
          company_name_snapshot: string | null
          created_by: string | null
          event_type: string
          from_value: string | null
          id: string
          manager_id: string | null
          occurred_at: string
          rep_id: string | null
          to_value: string | null
        }
        Insert: {
          account_id?: string | null
          company_name_snapshot?: string | null
          created_by?: string | null
          event_type: string
          from_value?: string | null
          id?: string
          manager_id?: string | null
          occurred_at?: string
          rep_id?: string | null
          to_value?: string | null
        }
        Update: {
          account_id?: string | null
          company_name_snapshot?: string | null
          created_by?: string | null
          event_type?: string
          from_value?: string | null
          id?: string
          manager_id?: string | null
          occurred_at?: string
          rep_id?: string | null
          to_value?: string | null
        }
        Relationships: []
      }
      crm_account_notes: {
        Row: {
          account_id: string
          body: string
          created_at: string
          created_by: string | null
          id: string
        }
        Insert: {
          account_id: string
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Update: {
          account_id?: string
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_account_notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_account_notes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_prospect_reporting_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_account_stage_history: {
        Row: {
          account_id: string
          changed_at: string
          changed_by: string | null
          from_stage: string | null
          id: string
          to_stage: string
        }
        Insert: {
          account_id: string
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          to_stage: string
        }
        Update: {
          account_id?: string
          changed_at?: string
          changed_by?: string | null
          from_stage?: string | null
          id?: string
          to_stage?: string
        }
        Relationships: [
          {
            foreignKeyName: "crm_account_stage_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_account_stage_history_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "v_prospect_reporting_overview"
            referencedColumns: ["id"]
          },
        ]
      }
      crm_accounts: {
        Row: {
          account_type: string
          assigned_manager_id: string | null
          assigned_rep_id: string | null
          brand: string
          brands: string[]
          buying_group: string | null
          city: string | null
          company_name: string
          contact_first_name: string | null
          contact_last_name: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          lifecycle_stage: string
          main_phone: string | null
          notes: string | null
          prospect_type: string | null
          prospect_types: string[]
          rep_owner: string | null
          state: string | null
          status: string
          street_1: string | null
          updated_at: string
          website: string | null
          zip: string | null
        }
        Insert: {
          account_type?: string
          assigned_manager_id?: string | null
          assigned_rep_id?: string | null
          brand?: string
          brands?: string[]
          buying_group?: string | null
          city?: string | null
          company_name: string
          contact_first_name?: string | null
          contact_last_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          lifecycle_stage?: string
          main_phone?: string | null
          notes?: string | null
          prospect_type?: string | null
          prospect_types?: string[]
          rep_owner?: string | null
          state?: string | null
          status?: string
          street_1?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Update: {
          account_type?: string
          assigned_manager_id?: string | null
          assigned_rep_id?: string | null
          brand?: string
          brands?: string[]
          buying_group?: string | null
          city?: string | null
          company_name?: string
          contact_first_name?: string | null
          contact_last_name?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          lifecycle_stage?: string
          main_phone?: string | null
          notes?: string | null
          prospect_type?: string | null
          prospect_types?: string[]
          rep_owner?: string | null
          state?: string | null
          status?: string
          street_1?: string | null
          updated_at?: string
          website?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_accounts_assigned_manager_id_fkey"
            columns: ["assigned_manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_accounts_assigned_rep_id_fkey"
            columns: ["assigned_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_accounts_assigned_rep_id_fkey"
            columns: ["assigned_rep_id"]
            isOneToOne: false
            referencedRelation: "v_companywide_reporting_actuals"
            referencedColumns: ["portal_rep_id"]
          },
        ]
      }
      crm_prospect_types: {
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
      dbo_Invoice: {
        Row: {
          _skyvia_sync: string | null
          AmtPaid: unknown
          ARAccountID: string | null
          BackorderCriteria: string | null
          Balance: unknown
          BankId: string | null
          BillToAddress: string | null
          BillToAddress1: string | null
          BillToAddress2: string | null
          BillToAddress3: string | null
          BillToAddress4: string | null
          BillToCity: string | null
          BillToCountry: string | null
          BillToName: string | null
          BillToState: string | null
          BillToZip: string | null
          BranchID: string | null
          Carrier: string | null
          CarrierAndService: string | null
          CarrierService: string | null
          CCAuthorizationCode: string | null
          CCAVSStreet: number | null
          CCAVSZip: number | null
          CCExpDate: string | null
          CCMerchAcctNumber: string | null
          CCNumber: string | null
          CCPaymentGroupingCode: number | null
          CCReconBatchID: string | null
          CCStatusCode: number | null
          CCStatusMessage: string | null
          CCTransID: string | null
          CCTxnAuthStamp: number | null
          CCTxnAuthTime: string | null
          CheckNo: string | null
          Class: string | null
          CollectionDays: number | null
          Comment: string | null
          CompanyTaxID: string | null
          Completed: boolean | null
          ContactEMailAddress: string | null
          ContactFAX: string | null
          ContactName: string | null
          ContactPhoneNumber: string | null
          ContractDate: string | null
          ContractID: string | null
          CreatedBy: string | null
          CreatedDate: string | null
          CreditApprovalDate: string | null
          CreditApprovedBy: string | null
          CurrencyCode: string | null
          CurrencyName: string | null
          CustomerID: string | null
          CustomerTaxID: string | null
          DateCompleted: string | null
          DatePosted: string | null
          DatePrinted: string | null
          DeliveredBy: string | null
          DeliveredTo: string | null
          DeliveryDate: string | null
          DeliveryMiles: number | null
          DiscountAmount: unknown
          DiscountAvailable: unknown
          DiscountDate: string | null
          DiscountType: string | null
          DoNotSync: boolean | null
          DueDate: string | null
          EnteredBy: string | null
          EntryDate: string | null
          ExchangeRate: number | null
          ExportDate: string | null
          Exported: boolean | null
          FOB: string | null
          ForeignAmtPaid: unknown
          ForeignBalance: unknown
          ForeignDiscountAmount: unknown
          ForeignDiscountAvailable: unknown
          ForeignPaymentDiscount: unknown
          ForeignSalesTax: unknown
          ForeignShippingCharge: unknown
          ForeignSubTotal: unknown
          ForeignTotalAmount: unknown
          ForeignTotalShippingCharges: unknown
          FromQB: boolean | null
          FrtTaxPct: number | null
          GUIDARAccount: string | null
          GUIDBranch: string | null
          GUIDClass: string | null
          GUIDCurrency: string | null
          GUIDCustomer: string | null
          GUIDInvoice: string
          GUIDInvoiceDiscountAccount: string | null
          GUIDLocation: string | null
          GUIDOrder: string | null
          GUIDPaymentMethod: string | null
          GUIDRetainageGLAccount: string | null
          GUIDRoute: string | null
          GUIDSalesperson: string | null
          GUIDShippingChargeAccount: string | null
          GUIDTaxCategory: string | null
          GUIDTaxCode: string | null
          GUIDTerms: string | null
          HoldReleasedBy: string | null
          HoldReleasedDate: string | null
          InDispute: boolean | null
          InvoiceDate: string | null
          InvoiceDetailReportID: number | null
          InvoiceDiscountAccountID: string | null
          InvoiceDiscountPct: number | null
          InvoiceFormat: string | null
          InvoiceFormatGUID: string | null
          InvoiceLink: string | null
          InvoiceNumber: string | null
          InvoiceNumberSort: string | null
          InvoiceReportID: number | null
          InvoiceStyle: string | null
          InvoiceText: string | null
          JobID: string | null
          JobNumber: string | null
          LastPaymentDate: string | null
          LastShipmentDate: string | null
          LocationID: string | null
          ManualHold: boolean | null
          MarketingCode: string | null
          MethodOfPayment: number | null
          Note: string | null
          NumberOfPackages: number | null
          NumberShipments: number | null
          OrderDate: string | null
          OrderNumber: string | null
          PackageWeight: number | null
          PaymentDiscount: unknown
          PaymentMethod: string | null
          PO: string | null
          PostedToAR: boolean | null
          PreviousAmount: unknown
          PreviousRetainage: unknown
          Printed: boolean | null
          ReadyToPrint: boolean | null
          Reference: string | null
          Reference2: string | null
          RequestedShipDate: string | null
          RetainageAmount: unknown
          RetainageBilled: boolean | null
          RetainageGLAccountID: string | null
          Route: string | null
          Routing: string | null
          SalespersonID: string | null
          SalespersonName: string | null
          SalesTax: unknown
          ScheduleOfValuesType: string | null
          ShipmentPromisedDate: string | null
          ShippingCharge: unknown
          ShippingChargeAccountID: string | null
          ShippingInstructions: string | null
          ShipToAddress: string | null
          ShipToAddress1: string | null
          ShipToAddress2: string | null
          ShipToAddress3: string | null
          ShipToAddress4: string | null
          ShipToAttn: string | null
          ShipToCity: string | null
          ShipToCountry: string | null
          ShipToOverride: boolean | null
          ShipToPhoneNumber: string | null
          ShipToState: string | null
          ShipToZip: string | null
          ShipVia: string | null
          SpecialInstructions: string | null
          StopNumber: number | null
          SubTotal: unknown
          Taxable: boolean | null
          TaxCode: string | null
          TaxCodeDescription: string | null
          TaxID: string | null
          TaxIncluded: boolean | null
          TaxPct: number | null
          TermsCode: string | null
          TermsDescription: string | null
          TotalAmount: string | null
          TotalShippingCharges: unknown
          TrackingNumber: string | null
          TransactionPeriod: number | null
          TransactionYear: number | null
          TxnID: string | null
          Type: string | null
          UpdatedBy: string | null
          UpdatedDate: string | null
        }
        Insert: {
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          ARAccountID?: string | null
          BackorderCriteria?: string | null
          Balance?: unknown
          BankId?: string | null
          BillToAddress?: string | null
          BillToAddress1?: string | null
          BillToAddress2?: string | null
          BillToAddress3?: string | null
          BillToAddress4?: string | null
          BillToCity?: string | null
          BillToCountry?: string | null
          BillToName?: string | null
          BillToState?: string | null
          BillToZip?: string | null
          BranchID?: string | null
          Carrier?: string | null
          CarrierAndService?: string | null
          CarrierService?: string | null
          CCAuthorizationCode?: string | null
          CCAVSStreet?: number | null
          CCAVSZip?: number | null
          CCExpDate?: string | null
          CCMerchAcctNumber?: string | null
          CCNumber?: string | null
          CCPaymentGroupingCode?: number | null
          CCReconBatchID?: string | null
          CCStatusCode?: number | null
          CCStatusMessage?: string | null
          CCTransID?: string | null
          CCTxnAuthStamp?: number | null
          CCTxnAuthTime?: string | null
          CheckNo?: string | null
          Class?: string | null
          CollectionDays?: number | null
          Comment?: string | null
          CompanyTaxID?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFAX?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractDate?: string | null
          ContractID?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          CurrencyCode?: string | null
          CurrencyName?: string | null
          CustomerID?: string | null
          CustomerTaxID?: string | null
          DateCompleted?: string | null
          DatePosted?: string | null
          DatePrinted?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscountAmount?: unknown
          DiscountAvailable?: unknown
          DiscountDate?: string | null
          DiscountType?: string | null
          DoNotSync?: boolean | null
          DueDate?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          ExportDate?: string | null
          Exported?: boolean | null
          FOB?: string | null
          ForeignAmtPaid?: unknown
          ForeignBalance?: unknown
          ForeignDiscountAmount?: unknown
          ForeignDiscountAvailable?: unknown
          ForeignPaymentDiscount?: unknown
          ForeignSalesTax?: unknown
          ForeignShippingCharge?: unknown
          ForeignSubTotal?: unknown
          ForeignTotalAmount?: unknown
          ForeignTotalShippingCharges?: unknown
          FromQB?: boolean | null
          FrtTaxPct?: number | null
          GUIDARAccount?: string | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string | null
          GUIDInvoice: string
          GUIDInvoiceDiscountAccount?: string | null
          GUIDLocation?: string | null
          GUIDOrder?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRetainageGLAccount?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDShippingChargeAccount?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InDispute?: boolean | null
          InvoiceDate?: string | null
          InvoiceDetailReportID?: number | null
          InvoiceDiscountAccountID?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormat?: string | null
          InvoiceFormatGUID?: string | null
          InvoiceLink?: string | null
          InvoiceNumber?: string | null
          InvoiceNumberSort?: string | null
          InvoiceReportID?: number | null
          InvoiceStyle?: string | null
          InvoiceText?: string | null
          JobID?: string | null
          JobNumber?: string | null
          LastPaymentDate?: string | null
          LastShipmentDate?: string | null
          LocationID?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          NumberShipments?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          PackageWeight?: number | null
          PaymentDiscount?: unknown
          PaymentMethod?: string | null
          PO?: string | null
          PostedToAR?: boolean | null
          PreviousAmount?: unknown
          PreviousRetainage?: unknown
          Printed?: boolean | null
          ReadyToPrint?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RequestedShipDate?: string | null
          RetainageAmount?: unknown
          RetainageBilled?: boolean | null
          RetainageGLAccountID?: string | null
          Route?: string | null
          Routing?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          SalesTax?: unknown
          ScheduleOfValuesType?: string | null
          ShipmentPromisedDate?: string | null
          ShippingCharge?: unknown
          ShippingChargeAccountID?: string | null
          ShippingInstructions?: string | null
          ShipToAddress?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToOverride?: boolean | null
          ShipToPhoneNumber?: string | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          SpecialInstructions?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          Taxable?: boolean | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          TaxID?: string | null
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TotalAmount?: string | null
          TotalShippingCharges?: unknown
          TrackingNumber?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          TxnID?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
        }
        Update: {
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          ARAccountID?: string | null
          BackorderCriteria?: string | null
          Balance?: unknown
          BankId?: string | null
          BillToAddress?: string | null
          BillToAddress1?: string | null
          BillToAddress2?: string | null
          BillToAddress3?: string | null
          BillToAddress4?: string | null
          BillToCity?: string | null
          BillToCountry?: string | null
          BillToName?: string | null
          BillToState?: string | null
          BillToZip?: string | null
          BranchID?: string | null
          Carrier?: string | null
          CarrierAndService?: string | null
          CarrierService?: string | null
          CCAuthorizationCode?: string | null
          CCAVSStreet?: number | null
          CCAVSZip?: number | null
          CCExpDate?: string | null
          CCMerchAcctNumber?: string | null
          CCNumber?: string | null
          CCPaymentGroupingCode?: number | null
          CCReconBatchID?: string | null
          CCStatusCode?: number | null
          CCStatusMessage?: string | null
          CCTransID?: string | null
          CCTxnAuthStamp?: number | null
          CCTxnAuthTime?: string | null
          CheckNo?: string | null
          Class?: string | null
          CollectionDays?: number | null
          Comment?: string | null
          CompanyTaxID?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFAX?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractDate?: string | null
          ContractID?: string | null
          CreatedBy?: string | null
          CreatedDate?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          CurrencyCode?: string | null
          CurrencyName?: string | null
          CustomerID?: string | null
          CustomerTaxID?: string | null
          DateCompleted?: string | null
          DatePosted?: string | null
          DatePrinted?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscountAmount?: unknown
          DiscountAvailable?: unknown
          DiscountDate?: string | null
          DiscountType?: string | null
          DoNotSync?: boolean | null
          DueDate?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          ExportDate?: string | null
          Exported?: boolean | null
          FOB?: string | null
          ForeignAmtPaid?: unknown
          ForeignBalance?: unknown
          ForeignDiscountAmount?: unknown
          ForeignDiscountAvailable?: unknown
          ForeignPaymentDiscount?: unknown
          ForeignSalesTax?: unknown
          ForeignShippingCharge?: unknown
          ForeignSubTotal?: unknown
          ForeignTotalAmount?: unknown
          ForeignTotalShippingCharges?: unknown
          FromQB?: boolean | null
          FrtTaxPct?: number | null
          GUIDARAccount?: string | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string | null
          GUIDInvoice?: string
          GUIDInvoiceDiscountAccount?: string | null
          GUIDLocation?: string | null
          GUIDOrder?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRetainageGLAccount?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDShippingChargeAccount?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InDispute?: boolean | null
          InvoiceDate?: string | null
          InvoiceDetailReportID?: number | null
          InvoiceDiscountAccountID?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormat?: string | null
          InvoiceFormatGUID?: string | null
          InvoiceLink?: string | null
          InvoiceNumber?: string | null
          InvoiceNumberSort?: string | null
          InvoiceReportID?: number | null
          InvoiceStyle?: string | null
          InvoiceText?: string | null
          JobID?: string | null
          JobNumber?: string | null
          LastPaymentDate?: string | null
          LastShipmentDate?: string | null
          LocationID?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          NumberShipments?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          PackageWeight?: number | null
          PaymentDiscount?: unknown
          PaymentMethod?: string | null
          PO?: string | null
          PostedToAR?: boolean | null
          PreviousAmount?: unknown
          PreviousRetainage?: unknown
          Printed?: boolean | null
          ReadyToPrint?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RequestedShipDate?: string | null
          RetainageAmount?: unknown
          RetainageBilled?: boolean | null
          RetainageGLAccountID?: string | null
          Route?: string | null
          Routing?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          SalesTax?: unknown
          ScheduleOfValuesType?: string | null
          ShipmentPromisedDate?: string | null
          ShippingCharge?: unknown
          ShippingChargeAccountID?: string | null
          ShippingInstructions?: string | null
          ShipToAddress?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToOverride?: boolean | null
          ShipToPhoneNumber?: string | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          SpecialInstructions?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          Taxable?: boolean | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          TaxID?: string | null
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TotalAmount?: string | null
          TotalShippingCharges?: unknown
          TrackingNumber?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          TxnID?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
        }
        Relationships: []
      }
      dbo_InvoiceDetail: {
        Row: {
          _CommissionOverride: number | null
          _FreightAmt: unknown
          _FreightPct: number | null
          _OriginalPrice: unknown
          _skyvia_sync: string | null
          _TariffAmt: unknown
          _TariffPct: number | null
          ActivityDate: string | null
          Amount: unknown
          AvgCost: number | null
          BillingType: string | null
          CGSAccountID: string | null
          CGSAmount: unknown
          CGSAmountPostedToGL: unknown
          CGSPostedToGL: boolean | null
          Class: string | null
          ComponentLevel: number | null
          ComponentQuantity: number | null
          CostUnit: string | null
          CurrentCGSAccountID: string | null
          CurrentChangeOrderAdditions: unknown
          CurrentChangeOrderDeductions: unknown
          CustomerProductID: string | null
          Description: string | null
          Discountable: boolean | null
          DisplayAmount: unknown
          DisplayPrice: number | null
          DisplayQtyBackOrdered: number | null
          DisplayQtyOrdered: number | null
          DisplayQtyShipped: number | null
          DisplayUnit: string | null
          DisplayUnitFactor: number | null
          EmployeeID: string | null
          ForeignAmount: unknown
          ForeignDisplayAmount: unknown
          ForeignDisplayPrice: number | null
          ForeignInvoiceDiscountAmount: unknown
          ForeignLineTaxAmount: unknown
          ForeignLineTaxPrice: number | null
          ForeignListPrice: number | null
          ForeignPrice: number | null
          ForeignSalesAmount: unknown
          Freight: boolean | null
          GLTransactionBatch: number | null
          GLTransactionLine: number | null
          GUIDCGSAccount: string | null
          GUIDClass: string | null
          GUIDEmployee: string | null
          GUIDInvoice: string | null
          GUIDInvoiceDetail: string
          GUIDIssue: string | null
          GUIDOrderDetail: string | null
          GUIDProduct: string | null
          GUIDProductClass: string | null
          GUIDSalesAccount: string | null
          GUIDTaxCode: string | null
          GUIDWarehouse: string | null
          InventoryControlType: string | null
          InvoiceComment: string | null
          InvoiceDate: string | null
          InvoiceDiscountAmount: unknown
          InvoiceNumber: string | null
          LineCancelled: boolean | null
          LineDiscountPct: number | null
          LineNumber: number | null
          LineTaxAmount: unknown
          LineTaxPrice: number | null
          LineType: string | null
          ListPrice: number | null
          ListPriceType: string | null
          MgmtCost: number | null
          MiscChargeType: string | null
          Note: string | null
          OrderNumber: string | null
          PercentCompleteLastBilling: number | null
          PercentCompleteThisBilling: number | null
          PreviousBilling: unknown
          PreviousChangeOrderAdditions: unknown
          PreviousChangeOrderDeductions: unknown
          PreviousRetainage: unknown
          Price: number | null
          PriceCode: string | null
          PriceUnit: string | null
          ProductClass: string | null
          ProductID: string | null
          ProductTaxID: string | null
          ProductTaxPct: number | null
          QtyBackOrdered: number | null
          QtyInvoiced: number | null
          QtyOrdered: number | null
          QtyShipped: number | null
          Reference: string | null
          RetainageAmount: unknown
          RetainagePercent: number | null
          SalesAccountID: string | null
          SalesAmount: unknown
          ScheduledValue: unknown
          ScheduleOfValuesCode: string | null
          ShortDescription: string | null
          SpecialInstructions: string | null
          StoredMaterials: unknown
          SubLineNumber: number | null
          Taxable: boolean | null
          TaxCode: string | null
          TaxCodeDescription: string | null
          TransactionDate: string | null
          TransactionPeriod: number | null
          TransactionYear: number | null
          Unit: string | null
          UnitCost: number | null
          Warehouse: string | null
        }
        Insert: {
          _CommissionOverride?: number | null
          _FreightAmt?: unknown
          _FreightPct?: number | null
          _OriginalPrice?: unknown
          _skyvia_sync?: string | null
          _TariffAmt?: unknown
          _TariffPct?: number | null
          ActivityDate?: string | null
          Amount?: unknown
          AvgCost?: number | null
          BillingType?: string | null
          CGSAccountID?: string | null
          CGSAmount?: unknown
          CGSAmountPostedToGL?: unknown
          CGSPostedToGL?: boolean | null
          Class?: string | null
          ComponentLevel?: number | null
          ComponentQuantity?: number | null
          CostUnit?: string | null
          CurrentCGSAccountID?: string | null
          CurrentChangeOrderAdditions?: unknown
          CurrentChangeOrderDeductions?: unknown
          CustomerProductID?: string | null
          Description?: string | null
          Discountable?: boolean | null
          DisplayAmount?: unknown
          DisplayPrice?: number | null
          DisplayQtyBackOrdered?: number | null
          DisplayQtyOrdered?: number | null
          DisplayQtyShipped?: number | null
          DisplayUnit?: string | null
          DisplayUnitFactor?: number | null
          EmployeeID?: string | null
          ForeignAmount?: unknown
          ForeignDisplayAmount?: unknown
          ForeignDisplayPrice?: number | null
          ForeignInvoiceDiscountAmount?: unknown
          ForeignLineTaxAmount?: unknown
          ForeignLineTaxPrice?: number | null
          ForeignListPrice?: number | null
          ForeignPrice?: number | null
          ForeignSalesAmount?: unknown
          Freight?: boolean | null
          GLTransactionBatch?: number | null
          GLTransactionLine?: number | null
          GUIDCGSAccount?: string | null
          GUIDClass?: string | null
          GUIDEmployee?: string | null
          GUIDInvoice?: string | null
          GUIDInvoiceDetail: string
          GUIDIssue?: string | null
          GUIDOrderDetail?: string | null
          GUIDProduct?: string | null
          GUIDProductClass?: string | null
          GUIDSalesAccount?: string | null
          GUIDTaxCode?: string | null
          GUIDWarehouse?: string | null
          InventoryControlType?: string | null
          InvoiceComment?: string | null
          InvoiceDate?: string | null
          InvoiceDiscountAmount?: unknown
          InvoiceNumber?: string | null
          LineCancelled?: boolean | null
          LineDiscountPct?: number | null
          LineNumber?: number | null
          LineTaxAmount?: unknown
          LineTaxPrice?: number | null
          LineType?: string | null
          ListPrice?: number | null
          ListPriceType?: string | null
          MgmtCost?: number | null
          MiscChargeType?: string | null
          Note?: string | null
          OrderNumber?: string | null
          PercentCompleteLastBilling?: number | null
          PercentCompleteThisBilling?: number | null
          PreviousBilling?: unknown
          PreviousChangeOrderAdditions?: unknown
          PreviousChangeOrderDeductions?: unknown
          PreviousRetainage?: unknown
          Price?: number | null
          PriceCode?: string | null
          PriceUnit?: string | null
          ProductClass?: string | null
          ProductID?: string | null
          ProductTaxID?: string | null
          ProductTaxPct?: number | null
          QtyBackOrdered?: number | null
          QtyInvoiced?: number | null
          QtyOrdered?: number | null
          QtyShipped?: number | null
          Reference?: string | null
          RetainageAmount?: unknown
          RetainagePercent?: number | null
          SalesAccountID?: string | null
          SalesAmount?: unknown
          ScheduledValue?: unknown
          ScheduleOfValuesCode?: string | null
          ShortDescription?: string | null
          SpecialInstructions?: string | null
          StoredMaterials?: unknown
          SubLineNumber?: number | null
          Taxable?: boolean | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          TransactionDate?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          Unit?: string | null
          UnitCost?: number | null
          Warehouse?: string | null
        }
        Update: {
          _CommissionOverride?: number | null
          _FreightAmt?: unknown
          _FreightPct?: number | null
          _OriginalPrice?: unknown
          _skyvia_sync?: string | null
          _TariffAmt?: unknown
          _TariffPct?: number | null
          ActivityDate?: string | null
          Amount?: unknown
          AvgCost?: number | null
          BillingType?: string | null
          CGSAccountID?: string | null
          CGSAmount?: unknown
          CGSAmountPostedToGL?: unknown
          CGSPostedToGL?: boolean | null
          Class?: string | null
          ComponentLevel?: number | null
          ComponentQuantity?: number | null
          CostUnit?: string | null
          CurrentCGSAccountID?: string | null
          CurrentChangeOrderAdditions?: unknown
          CurrentChangeOrderDeductions?: unknown
          CustomerProductID?: string | null
          Description?: string | null
          Discountable?: boolean | null
          DisplayAmount?: unknown
          DisplayPrice?: number | null
          DisplayQtyBackOrdered?: number | null
          DisplayQtyOrdered?: number | null
          DisplayQtyShipped?: number | null
          DisplayUnit?: string | null
          DisplayUnitFactor?: number | null
          EmployeeID?: string | null
          ForeignAmount?: unknown
          ForeignDisplayAmount?: unknown
          ForeignDisplayPrice?: number | null
          ForeignInvoiceDiscountAmount?: unknown
          ForeignLineTaxAmount?: unknown
          ForeignLineTaxPrice?: number | null
          ForeignListPrice?: number | null
          ForeignPrice?: number | null
          ForeignSalesAmount?: unknown
          Freight?: boolean | null
          GLTransactionBatch?: number | null
          GLTransactionLine?: number | null
          GUIDCGSAccount?: string | null
          GUIDClass?: string | null
          GUIDEmployee?: string | null
          GUIDInvoice?: string | null
          GUIDInvoiceDetail?: string
          GUIDIssue?: string | null
          GUIDOrderDetail?: string | null
          GUIDProduct?: string | null
          GUIDProductClass?: string | null
          GUIDSalesAccount?: string | null
          GUIDTaxCode?: string | null
          GUIDWarehouse?: string | null
          InventoryControlType?: string | null
          InvoiceComment?: string | null
          InvoiceDate?: string | null
          InvoiceDiscountAmount?: unknown
          InvoiceNumber?: string | null
          LineCancelled?: boolean | null
          LineDiscountPct?: number | null
          LineNumber?: number | null
          LineTaxAmount?: unknown
          LineTaxPrice?: number | null
          LineType?: string | null
          ListPrice?: number | null
          ListPriceType?: string | null
          MgmtCost?: number | null
          MiscChargeType?: string | null
          Note?: string | null
          OrderNumber?: string | null
          PercentCompleteLastBilling?: number | null
          PercentCompleteThisBilling?: number | null
          PreviousBilling?: unknown
          PreviousChangeOrderAdditions?: unknown
          PreviousChangeOrderDeductions?: unknown
          PreviousRetainage?: unknown
          Price?: number | null
          PriceCode?: string | null
          PriceUnit?: string | null
          ProductClass?: string | null
          ProductID?: string | null
          ProductTaxID?: string | null
          ProductTaxPct?: number | null
          QtyBackOrdered?: number | null
          QtyInvoiced?: number | null
          QtyOrdered?: number | null
          QtyShipped?: number | null
          Reference?: string | null
          RetainageAmount?: unknown
          RetainagePercent?: number | null
          SalesAccountID?: string | null
          SalesAmount?: unknown
          ScheduledValue?: unknown
          ScheduleOfValuesCode?: string | null
          ShortDescription?: string | null
          SpecialInstructions?: string | null
          StoredMaterials?: unknown
          SubLineNumber?: number | null
          Taxable?: boolean | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          TransactionDate?: string | null
          TransactionPeriod?: number | null
          TransactionYear?: number | null
          Unit?: string | null
          UnitCost?: number | null
          Warehouse?: string | null
        }
        Relationships: []
      }
      dbo_OrderDetail: {
        Row: {
          _CommissionOverride: number | null
          _FreightAmt: unknown
          _FreightPct: number | null
          _OriginalPrice: unknown
          _skyvia_sync: string | null
          _TariffAmt: unknown
          _TariffPct: number | null
          ActivityDate: string | null
          Amount: unknown
          BillingType: string | null
          Class: string | null
          Completed: boolean | null
          ComponentLevel: number | null
          ComponentQuantity: number | null
          CreatePO: boolean | null
          CurrentCGSAccountID: string | null
          CustomerProductID: string | null
          Description: string | null
          Discountable: boolean | null
          DisplayAmount: unknown
          DisplayPrice: number | null
          DisplayQtyBackOrdered: number | null
          DisplayQtyInvoiced: number | null
          DisplayQtyOrdered: number | null
          DisplayQtyOutstanding: number | null
          DisplayQtyPicked: number | null
          DisplayQtyScheduled: number | null
          DisplayQtyShipped: number | null
          DisplayUnit: string | null
          DisplayUnitFactor: number | null
          EmployeeID: string | null
          Exported940: boolean | null
          Exported940Date: string | null
          ForeignAmount: unknown
          ForeignDisplayAmount: unknown
          ForeignDisplayPrice: number | null
          ForeignInvoiceDiscountAmount: unknown
          ForeignLineTaxAmount: unknown
          ForeignLineTaxPrice: number | null
          ForeignPrice: number | null
          ForeignSchedAmount: unknown
          ForeignSchedInvoiceDiscountAmount: unknown
          ForeignSchedLineTaxAmount: unknown
          Freight: boolean | null
          GUIDClass: string | null
          GUIDEmployee: string | null
          GUIDIssue: string | null
          GUIDOrder: string | null
          GUIDOrderDetail: string
          GUIDParentOrderDetail: string | null
          GUIDPODetail: string | null
          GUIDProduct: string | null
          GUIDProductClass: string | null
          GUIDSubstituteForProduct: string | null
          GUIDTaxCode: string | null
          GUIDVendor: string | null
          GUIDWarehouse: string | null
          GUIDWHLocation: string | null
          InventoryControlType: string | null
          InvoiceComment: string | null
          InvoiceDiscountAmount: unknown
          LastShipmentDate: string | null
          Length: number | null
          LineCancelled: boolean | null
          LineDiscountPct: number | null
          LineNumber: number | null
          LineTaxAmount: unknown
          LineTaxPrice: number | null
          LineType: string | null
          Location: string | null
          MiscChargeType: string | null
          Note: string | null
          OrderNumber: string | null
          PackageUnit: string | null
          PackageUnitFactor: number | null
          POPrice: number | null
          POVendorID: string | null
          PrevInvoiceAmount: unknown
          Price: number | null
          PriceCode: string | null
          PriceUnit: string | null
          PriceUnitFactor: number | null
          PriceUnitFactorType: string | null
          ProductClass: string | null
          ProductID: string | null
          ProductTaxID: string | null
          ProductTaxPct: number | null
          QtyBackordered: number | null
          QtyInvoiced: number | null
          QtyLotSerial: number | null
          QtyOrdered: number | null
          QtyOutstanding: number | null
          QtyPicked: number | null
          QtyScheduled: number | null
          QtyShipped: number | null
          Reference: string | null
          SalesCategory: string | null
          SchedAmount: unknown
          SchedInvoiceDiscountAmount: unknown
          SchedLineTaxAmount: unknown
          ShortDescription: string | null
          SpecialInstructions: string | null
          Specification: string | null
          SubLineNumber: number | null
          SubstituteForProductID: string | null
          Taxable: boolean | null
          TaxCode: string | null
          TaxCodeDescription: string | null
          ToBeBilled: boolean | null
          Unit: string | null
          VariableLength: boolean | null
          VariableWeight: boolean | null
          VendorPO: string | null
          VendorPOLine: number | null
          Warehouse: string | null
          Weight: number | null
        }
        Insert: {
          _CommissionOverride?: number | null
          _FreightAmt?: unknown
          _FreightPct?: number | null
          _OriginalPrice?: unknown
          _skyvia_sync?: string | null
          _TariffAmt?: unknown
          _TariffPct?: number | null
          ActivityDate?: string | null
          Amount?: unknown
          BillingType?: string | null
          Class?: string | null
          Completed?: boolean | null
          ComponentLevel?: number | null
          ComponentQuantity?: number | null
          CreatePO?: boolean | null
          CurrentCGSAccountID?: string | null
          CustomerProductID?: string | null
          Description?: string | null
          Discountable?: boolean | null
          DisplayAmount?: unknown
          DisplayPrice?: number | null
          DisplayQtyBackOrdered?: number | null
          DisplayQtyInvoiced?: number | null
          DisplayQtyOrdered?: number | null
          DisplayQtyOutstanding?: number | null
          DisplayQtyPicked?: number | null
          DisplayQtyScheduled?: number | null
          DisplayQtyShipped?: number | null
          DisplayUnit?: string | null
          DisplayUnitFactor?: number | null
          EmployeeID?: string | null
          Exported940?: boolean | null
          Exported940Date?: string | null
          ForeignAmount?: unknown
          ForeignDisplayAmount?: unknown
          ForeignDisplayPrice?: number | null
          ForeignInvoiceDiscountAmount?: unknown
          ForeignLineTaxAmount?: unknown
          ForeignLineTaxPrice?: number | null
          ForeignPrice?: number | null
          ForeignSchedAmount?: unknown
          ForeignSchedInvoiceDiscountAmount?: unknown
          ForeignSchedLineTaxAmount?: unknown
          Freight?: boolean | null
          GUIDClass?: string | null
          GUIDEmployee?: string | null
          GUIDIssue?: string | null
          GUIDOrder?: string | null
          GUIDOrderDetail: string
          GUIDParentOrderDetail?: string | null
          GUIDPODetail?: string | null
          GUIDProduct?: string | null
          GUIDProductClass?: string | null
          GUIDSubstituteForProduct?: string | null
          GUIDTaxCode?: string | null
          GUIDVendor?: string | null
          GUIDWarehouse?: string | null
          GUIDWHLocation?: string | null
          InventoryControlType?: string | null
          InvoiceComment?: string | null
          InvoiceDiscountAmount?: unknown
          LastShipmentDate?: string | null
          Length?: number | null
          LineCancelled?: boolean | null
          LineDiscountPct?: number | null
          LineNumber?: number | null
          LineTaxAmount?: unknown
          LineTaxPrice?: number | null
          LineType?: string | null
          Location?: string | null
          MiscChargeType?: string | null
          Note?: string | null
          OrderNumber?: string | null
          PackageUnit?: string | null
          PackageUnitFactor?: number | null
          POPrice?: number | null
          POVendorID?: string | null
          PrevInvoiceAmount?: unknown
          Price?: number | null
          PriceCode?: string | null
          PriceUnit?: string | null
          PriceUnitFactor?: number | null
          PriceUnitFactorType?: string | null
          ProductClass?: string | null
          ProductID?: string | null
          ProductTaxID?: string | null
          ProductTaxPct?: number | null
          QtyBackordered?: number | null
          QtyInvoiced?: number | null
          QtyLotSerial?: number | null
          QtyOrdered?: number | null
          QtyOutstanding?: number | null
          QtyPicked?: number | null
          QtyScheduled?: number | null
          QtyShipped?: number | null
          Reference?: string | null
          SalesCategory?: string | null
          SchedAmount?: unknown
          SchedInvoiceDiscountAmount?: unknown
          SchedLineTaxAmount?: unknown
          ShortDescription?: string | null
          SpecialInstructions?: string | null
          Specification?: string | null
          SubLineNumber?: number | null
          SubstituteForProductID?: string | null
          Taxable?: boolean | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          ToBeBilled?: boolean | null
          Unit?: string | null
          VariableLength?: boolean | null
          VariableWeight?: boolean | null
          VendorPO?: string | null
          VendorPOLine?: number | null
          Warehouse?: string | null
          Weight?: number | null
        }
        Update: {
          _CommissionOverride?: number | null
          _FreightAmt?: unknown
          _FreightPct?: number | null
          _OriginalPrice?: unknown
          _skyvia_sync?: string | null
          _TariffAmt?: unknown
          _TariffPct?: number | null
          ActivityDate?: string | null
          Amount?: unknown
          BillingType?: string | null
          Class?: string | null
          Completed?: boolean | null
          ComponentLevel?: number | null
          ComponentQuantity?: number | null
          CreatePO?: boolean | null
          CurrentCGSAccountID?: string | null
          CustomerProductID?: string | null
          Description?: string | null
          Discountable?: boolean | null
          DisplayAmount?: unknown
          DisplayPrice?: number | null
          DisplayQtyBackOrdered?: number | null
          DisplayQtyInvoiced?: number | null
          DisplayQtyOrdered?: number | null
          DisplayQtyOutstanding?: number | null
          DisplayQtyPicked?: number | null
          DisplayQtyScheduled?: number | null
          DisplayQtyShipped?: number | null
          DisplayUnit?: string | null
          DisplayUnitFactor?: number | null
          EmployeeID?: string | null
          Exported940?: boolean | null
          Exported940Date?: string | null
          ForeignAmount?: unknown
          ForeignDisplayAmount?: unknown
          ForeignDisplayPrice?: number | null
          ForeignInvoiceDiscountAmount?: unknown
          ForeignLineTaxAmount?: unknown
          ForeignLineTaxPrice?: number | null
          ForeignPrice?: number | null
          ForeignSchedAmount?: unknown
          ForeignSchedInvoiceDiscountAmount?: unknown
          ForeignSchedLineTaxAmount?: unknown
          Freight?: boolean | null
          GUIDClass?: string | null
          GUIDEmployee?: string | null
          GUIDIssue?: string | null
          GUIDOrder?: string | null
          GUIDOrderDetail?: string
          GUIDParentOrderDetail?: string | null
          GUIDPODetail?: string | null
          GUIDProduct?: string | null
          GUIDProductClass?: string | null
          GUIDSubstituteForProduct?: string | null
          GUIDTaxCode?: string | null
          GUIDVendor?: string | null
          GUIDWarehouse?: string | null
          GUIDWHLocation?: string | null
          InventoryControlType?: string | null
          InvoiceComment?: string | null
          InvoiceDiscountAmount?: unknown
          LastShipmentDate?: string | null
          Length?: number | null
          LineCancelled?: boolean | null
          LineDiscountPct?: number | null
          LineNumber?: number | null
          LineTaxAmount?: unknown
          LineTaxPrice?: number | null
          LineType?: string | null
          Location?: string | null
          MiscChargeType?: string | null
          Note?: string | null
          OrderNumber?: string | null
          PackageUnit?: string | null
          PackageUnitFactor?: number | null
          POPrice?: number | null
          POVendorID?: string | null
          PrevInvoiceAmount?: unknown
          Price?: number | null
          PriceCode?: string | null
          PriceUnit?: string | null
          PriceUnitFactor?: number | null
          PriceUnitFactorType?: string | null
          ProductClass?: string | null
          ProductID?: string | null
          ProductTaxID?: string | null
          ProductTaxPct?: number | null
          QtyBackordered?: number | null
          QtyInvoiced?: number | null
          QtyLotSerial?: number | null
          QtyOrdered?: number | null
          QtyOutstanding?: number | null
          QtyPicked?: number | null
          QtyScheduled?: number | null
          QtyShipped?: number | null
          Reference?: string | null
          SalesCategory?: string | null
          SchedAmount?: unknown
          SchedInvoiceDiscountAmount?: unknown
          SchedLineTaxAmount?: unknown
          ShortDescription?: string | null
          SpecialInstructions?: string | null
          Specification?: string | null
          SubLineNumber?: number | null
          SubstituteForProductID?: string | null
          Taxable?: boolean | null
          TaxCode?: string | null
          TaxCodeDescription?: string | null
          ToBeBilled?: boolean | null
          Unit?: string | null
          VariableLength?: boolean | null
          VariableWeight?: boolean | null
          VendorPO?: string | null
          VendorPOLine?: number | null
          Warehouse?: string | null
          Weight?: number | null
        }
        Relationships: []
      }
      dbo_OrderManagementSummary: {
        Row: {
          _Rep1: string | null
          _Rep2: string | null
          _Rep2Pct: number | null
          _RepPct: number | null
          _skyvia_sync: string | null
          AmountPaid: unknown
          AuthorizedAmount: unknown
          Backordered: unknown
          BackorderedCount: number | null
          BranchID: string | null
          Carrier: string | null
          CarrierService: string | null
          Class: string | null
          Comment: string | null
          ContactEmailAddress: string | null
          ContactFax: string | null
          ContactName: string | null
          ContactPhoneNumber: string | null
          CreditWarningIcon: number | null
          CurrencyCode: string | null
          CustomerID: string | null
          CustomerType: string | null
          DontShipAfter: string | null
          DontShipBefore: string | null
          EnteredBy: string | null
          EntryDate: string | null
          FOB: string | null
          GUIDOrder: string
          GUIDOrderWorkFlowStatus: string | null
          HoldStatus: string | null
          LastShipmentDate: string | null
          LineCount: number | null
          LocationID: string | null
          MarketingCode: string | null
          Note: string | null
          OrderDate: string | null
          OrderNumber: string | null
          OrderNumberSort: string | null
          OrderStatus: string | null
          OriginID: string | null
          OriginType: string | null
          PaymentAuthorizationCount: number | null
          PaymentMethod: string | null
          PaymentWarningIcon: number | null
          PicklistInProgressCount: number | null
          PicklistInvoicedCount: number | null
          PicklistNotPickedCount: number | null
          PicklistOnHoldCount: number | null
          PicklistOpenCount: number | null
          PicklistReadyToInvoiceCount: number | null
          PicklistReadyToPackageCount: number | null
          PickTicketPrinted: boolean | null
          PO: string | null
          Printed: boolean | null
          Reference: string | null
          Reference2: string | null
          RequestedShipDate: string | null
          Route: string | null
          SalespersonName: string | null
          SchedSubTotal: unknown
          ScheduledCount: number | null
          ScheduledIcon: number | null
          ShipmentCreatedCount: number | null
          ShipmentDueDate: string | null
          ShipmentPackedCount: number | null
          ShipmentPromisedDate: string | null
          ShipmentShippedCount: number | null
          ShipmentWarningIcon: number | null
          ShippingDocumentPrinted: boolean | null
          ShippingInstructions: string | null
          ShipToAddress: string | null
          ShipToAddress1: string | null
          ShipToAddress2: string | null
          ShipToAddress3: string | null
          ShipToAddress4: string | null
          ShipToAttn: string | null
          ShipToCity: string | null
          ShipToCountry: string | null
          ShipToState: string | null
          ShipToZip: string | null
          ShipVia: string | null
          SoldToAddress: string | null
          SoldToAddress1: string | null
          SoldToAddress2: string | null
          SoldToAddress3: string | null
          SoldToAddress4: string | null
          SoldToCity: string | null
          SoldToCountry: string | null
          SoldToName: string | null
          SoldToState: string | null
          SoldToZip: string | null
          SpecialInstructions: string | null
          StatusBy: string | null
          StatusDate: string | null
          StopNumber: number | null
          SubTotal: unknown
          TermsCode: string | null
          TotalAmount: unknown
          Type: string | null
          UninvoicedPackageCount: number | null
          UpdatedBy: string | null
          UpdatedDate: string | null
          WarningIcon: number | null
          WebOrderNumber: string | null
          WorkflowBy: string | null
          WorkflowDate: string | null
          WorkflowStatus: string | null
        }
        Insert: {
          _Rep1?: string | null
          _Rep2?: string | null
          _Rep2Pct?: number | null
          _RepPct?: number | null
          _skyvia_sync?: string | null
          AmountPaid?: unknown
          AuthorizedAmount?: unknown
          Backordered?: unknown
          BackorderedCount?: number | null
          BranchID?: string | null
          Carrier?: string | null
          CarrierService?: string | null
          Class?: string | null
          Comment?: string | null
          ContactEmailAddress?: string | null
          ContactFax?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          CreditWarningIcon?: number | null
          CurrencyCode?: string | null
          CustomerID?: string | null
          CustomerType?: string | null
          DontShipAfter?: string | null
          DontShipBefore?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          FOB?: string | null
          GUIDOrder: string
          GUIDOrderWorkFlowStatus?: string | null
          HoldStatus?: string | null
          LastShipmentDate?: string | null
          LineCount?: number | null
          LocationID?: string | null
          MarketingCode?: string | null
          Note?: string | null
          OrderDate?: string | null
          OrderNumber?: string | null
          OrderNumberSort?: string | null
          OrderStatus?: string | null
          OriginID?: string | null
          OriginType?: string | null
          PaymentAuthorizationCount?: number | null
          PaymentMethod?: string | null
          PaymentWarningIcon?: number | null
          PicklistInProgressCount?: number | null
          PicklistInvoicedCount?: number | null
          PicklistNotPickedCount?: number | null
          PicklistOnHoldCount?: number | null
          PicklistOpenCount?: number | null
          PicklistReadyToInvoiceCount?: number | null
          PicklistReadyToPackageCount?: number | null
          PickTicketPrinted?: boolean | null
          PO?: string | null
          Printed?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RequestedShipDate?: string | null
          Route?: string | null
          SalespersonName?: string | null
          SchedSubTotal?: unknown
          ScheduledCount?: number | null
          ScheduledIcon?: number | null
          ShipmentCreatedCount?: number | null
          ShipmentDueDate?: string | null
          ShipmentPackedCount?: number | null
          ShipmentPromisedDate?: string | null
          ShipmentShippedCount?: number | null
          ShipmentWarningIcon?: number | null
          ShippingDocumentPrinted?: boolean | null
          ShippingInstructions?: string | null
          ShipToAddress?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          SoldToAddress?: string | null
          SoldToAddress1?: string | null
          SoldToAddress2?: string | null
          SoldToAddress3?: string | null
          SoldToAddress4?: string | null
          SoldToCity?: string | null
          SoldToCountry?: string | null
          SoldToName?: string | null
          SoldToState?: string | null
          SoldToZip?: string | null
          SpecialInstructions?: string | null
          StatusBy?: string | null
          StatusDate?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          TermsCode?: string | null
          TotalAmount?: unknown
          Type?: string | null
          UninvoicedPackageCount?: number | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          WarningIcon?: number | null
          WebOrderNumber?: string | null
          WorkflowBy?: string | null
          WorkflowDate?: string | null
          WorkflowStatus?: string | null
        }
        Update: {
          _Rep1?: string | null
          _Rep2?: string | null
          _Rep2Pct?: number | null
          _RepPct?: number | null
          _skyvia_sync?: string | null
          AmountPaid?: unknown
          AuthorizedAmount?: unknown
          Backordered?: unknown
          BackorderedCount?: number | null
          BranchID?: string | null
          Carrier?: string | null
          CarrierService?: string | null
          Class?: string | null
          Comment?: string | null
          ContactEmailAddress?: string | null
          ContactFax?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          CreditWarningIcon?: number | null
          CurrencyCode?: string | null
          CustomerID?: string | null
          CustomerType?: string | null
          DontShipAfter?: string | null
          DontShipBefore?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          FOB?: string | null
          GUIDOrder?: string
          GUIDOrderWorkFlowStatus?: string | null
          HoldStatus?: string | null
          LastShipmentDate?: string | null
          LineCount?: number | null
          LocationID?: string | null
          MarketingCode?: string | null
          Note?: string | null
          OrderDate?: string | null
          OrderNumber?: string | null
          OrderNumberSort?: string | null
          OrderStatus?: string | null
          OriginID?: string | null
          OriginType?: string | null
          PaymentAuthorizationCount?: number | null
          PaymentMethod?: string | null
          PaymentWarningIcon?: number | null
          PicklistInProgressCount?: number | null
          PicklistInvoicedCount?: number | null
          PicklistNotPickedCount?: number | null
          PicklistOnHoldCount?: number | null
          PicklistOpenCount?: number | null
          PicklistReadyToInvoiceCount?: number | null
          PicklistReadyToPackageCount?: number | null
          PickTicketPrinted?: boolean | null
          PO?: string | null
          Printed?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RequestedShipDate?: string | null
          Route?: string | null
          SalespersonName?: string | null
          SchedSubTotal?: unknown
          ScheduledCount?: number | null
          ScheduledIcon?: number | null
          ShipmentCreatedCount?: number | null
          ShipmentDueDate?: string | null
          ShipmentPackedCount?: number | null
          ShipmentPromisedDate?: string | null
          ShipmentShippedCount?: number | null
          ShipmentWarningIcon?: number | null
          ShippingDocumentPrinted?: boolean | null
          ShippingInstructions?: string | null
          ShipToAddress?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          SoldToAddress?: string | null
          SoldToAddress1?: string | null
          SoldToAddress2?: string | null
          SoldToAddress3?: string | null
          SoldToAddress4?: string | null
          SoldToCity?: string | null
          SoldToCountry?: string | null
          SoldToName?: string | null
          SoldToState?: string | null
          SoldToZip?: string | null
          SpecialInstructions?: string | null
          StatusBy?: string | null
          StatusDate?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          TermsCode?: string | null
          TotalAmount?: unknown
          Type?: string | null
          UninvoicedPackageCount?: number | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          WarningIcon?: number | null
          WebOrderNumber?: string | null
          WorkflowBy?: string | null
          WorkflowDate?: string | null
          WorkflowStatus?: string | null
        }
        Relationships: []
      }
      dbo_Orders: {
        Row: {
          _Rep1: string | null
          _Rep2: string | null
          _Rep2Pct: number | null
          _RepPct: number | null
          _skyvia_sync: string | null
          AmtPaid: unknown
          BackorderCriteria: string | null
          BankId: string | null
          BeingPickedBy: string | null
          BranchID: string | null
          BranchName: string | null
          Carrier: string | null
          CarrierAndService: string | null
          CarrierService: string | null
          CCAddress: string | null
          CCExpDate: string | null
          CCName: string | null
          CCNumber: string | null
          CCPostalCode: string | null
          CheckNo: string | null
          Class: string | null
          Comment: string | null
          CompanyName: string | null
          CompanyTaxID: string | null
          Completed: boolean | null
          ContactEMailAddress: string | null
          ContactFax: string | null
          ContactName: string | null
          ContactPhoneNumber: string | null
          ContractID: string | null
          CreditApprovalDate: string | null
          CreditApprovedBy: string | null
          CurrencyCode: string | null
          CurrencyName: string | null
          CustomerID: string | null
          CustomerTaxID: string | null
          DeliveredBy: string | null
          DeliveredTo: string | null
          DeliveryDate: string | null
          DeliveryMiles: number | null
          DiscAmt: unknown
          DiscountAmount: unknown
          DiscountType: string | null
          DontShipAfter: string | null
          DontShipBefore: string | null
          EnteredBy: string | null
          EntryDate: string | null
          ExchangeRate: number | null
          FOB: string | null
          ForeignAmtPaid: unknown
          ForeignDiscountAmount: unknown
          ForeignPendingShippingCharges: unknown
          ForeignSalesTax: unknown
          ForeignSchedDiscountAmount: unknown
          ForeignSchedSalesTax: unknown
          ForeignSchedShippingCharge: unknown
          ForeignSchedSubTotal: unknown
          ForeignSchedTermsDiscountAvailable: unknown
          ForeignSchedTotalAmount: unknown
          ForeignSubTotal: unknown
          ForeignTotalAmount: unknown
          ForeignTotalShippingCharges: unknown
          FromEDI: boolean | null
          FrtTaxPct: number | null
          GUIDBranch: string | null
          GUIDClass: string | null
          GUIDCurrency: string | null
          GUIDCustomer: string | null
          GUIDCustomerType: string | null
          GUIDLocation: string | null
          GUIDOrder: string
          GUIDOrderWorkFlowStatus: string | null
          GUIDPaymentMethod: string | null
          GUIDRelatedOrder: string | null
          GUIDRoute: string | null
          GUIDSalesperson: string | null
          GUIDTaxCategory: string | null
          GUIDTaxCode: string | null
          GUIDTemplate: string | null
          GUIDTerms: string | null
          HoldReleasedBy: string | null
          HoldReleasedDate: string | null
          InvoiceDiscountPct: number | null
          InvoiceFormat: string | null
          InvoiceFormatGUID: string | null
          InvoicingError: boolean | null
          InvoicingErrorMessage: string | null
          JobNumber: string | null
          LastShipmentDate: string | null
          LocationID: string | null
          LostBusinessCode: string | null
          LostBusinessComment: string | null
          ManualHold: boolean | null
          MarketingCode: string | null
          MethodOfPayment: number | null
          NextInvoiceNumber: string | null
          NextShipmentNumber: number | null
          Note: string | null
          NumberOfPackages: number | null
          OrderDate: string | null
          OrderNumber: string | null
          OrderNumberSort: string | null
          OrderStatus: string | null
          OrderStatusDescription: string | null
          OriginID: string | null
          OriginType: string | null
          PackageWeight: number | null
          PaymentMethod: string | null
          PendingShippingCharges: unknown
          PickTicketPrinted: boolean | null
          PickTicketReadyToPrint: boolean | null
          PO: string | null
          Printed: boolean | null
          QuotedDaysToShip: number | null
          ReadyToInvoice: boolean | null
          ReadyToPrint: boolean | null
          Reference: string | null
          Reference2: string | null
          RelatedOrderNumber: string | null
          RequestedShipDate: string | null
          Route: string | null
          SalespersonID: string | null
          SalespersonName: string | null
          SalesTax: unknown
          SchedDiscountAmount: unknown
          SchedSalesTax: unknown
          SchedShippingCharge: unknown
          SchedSubTotal: unknown
          SchedTermsDiscountAvailable: unknown
          SchedTotalAmount: unknown
          ScheduledWeight: number | null
          ShipmentPromisedDate: string | null
          ShippingDocumentPrinted: boolean | null
          ShippingDocumentReadyToPrint: boolean | null
          ShippingInstructions: string | null
          ShipQuoteDate: string | null
          ShipQuoteGUIDTemplate: string | null
          ShipQuoteID: string | null
          ShipToAddress: string | null
          ShipToAddress1: string | null
          ShipToAddress2: string | null
          ShipToAddress3: string | null
          ShipToAddress4: string | null
          ShipToAttn: string | null
          ShipToCity: string | null
          ShipToCountry: string | null
          ShipToDescription: string | null
          ShipToOverride: boolean | null
          ShipToState: string | null
          ShipToZip: string | null
          ShipVia: string | null
          ShipWorkstationExportDate: string | null
          ShipWorkstationShipmentID: string | null
          SoldToAddress: string | null
          SoldToAddress1: string | null
          SoldToAddress2: string | null
          SoldToAddress3: string | null
          SoldToAddress4: string | null
          SoldToCity: string | null
          SoldToCountry: string | null
          SoldToName: string | null
          SoldToOverride: boolean | null
          SoldToState: string | null
          SoldToZip: string | null
          SpecialInstructions: string | null
          StatusChangedBy: string | null
          StatusDate: string | null
          StopNumber: number | null
          SubTotal: unknown
          Taxable: boolean | null
          TaxCatID: string | null
          TaxIncluded: boolean | null
          TaxPct: number | null
          TaxPercentText: string | null
          TemplateID: string | null
          TermsCode: string | null
          TermsDescription: string | null
          TotalAmount: unknown
          TotalShippingCharges: number | null
          TrackingNumber: string | null
          Type: string | null
          UpdatedBy: string | null
          UpdatedDate: string | null
          WebOrder: boolean | null
          WebOrderID: string | null
          WebOrderNumber: string | null
          WorkFlowStatus: string | null
          WorkFlowStatusAbbreviation: string | null
          WorkFlowStatusChangedBy: string | null
          WorkFlowStatusDate: string | null
        }
        Insert: {
          _Rep1?: string | null
          _Rep2?: string | null
          _Rep2Pct?: number | null
          _RepPct?: number | null
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          BackorderCriteria?: string | null
          BankId?: string | null
          BeingPickedBy?: string | null
          BranchID?: string | null
          BranchName?: string | null
          Carrier?: string | null
          CarrierAndService?: string | null
          CarrierService?: string | null
          CCAddress?: string | null
          CCExpDate?: string | null
          CCName?: string | null
          CCNumber?: string | null
          CCPostalCode?: string | null
          CheckNo?: string | null
          Class?: string | null
          Comment?: string | null
          CompanyName?: string | null
          CompanyTaxID?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFax?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractID?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          CurrencyCode?: string | null
          CurrencyName?: string | null
          CustomerID?: string | null
          CustomerTaxID?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscAmt?: unknown
          DiscountAmount?: unknown
          DiscountType?: string | null
          DontShipAfter?: string | null
          DontShipBefore?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          FOB?: string | null
          ForeignAmtPaid?: unknown
          ForeignDiscountAmount?: unknown
          ForeignPendingShippingCharges?: unknown
          ForeignSalesTax?: unknown
          ForeignSchedDiscountAmount?: unknown
          ForeignSchedSalesTax?: unknown
          ForeignSchedShippingCharge?: unknown
          ForeignSchedSubTotal?: unknown
          ForeignSchedTermsDiscountAvailable?: unknown
          ForeignSchedTotalAmount?: unknown
          ForeignSubTotal?: unknown
          ForeignTotalAmount?: unknown
          ForeignTotalShippingCharges?: unknown
          FromEDI?: boolean | null
          FrtTaxPct?: number | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string | null
          GUIDCustomerType?: string | null
          GUIDLocation?: string | null
          GUIDOrder: string
          GUIDOrderWorkFlowStatus?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRelatedOrder?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTemplate?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormat?: string | null
          InvoiceFormatGUID?: string | null
          InvoicingError?: boolean | null
          InvoicingErrorMessage?: string | null
          JobNumber?: string | null
          LastShipmentDate?: string | null
          LocationID?: string | null
          LostBusinessCode?: string | null
          LostBusinessComment?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          NextInvoiceNumber?: string | null
          NextShipmentNumber?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          OrderNumberSort?: string | null
          OrderStatus?: string | null
          OrderStatusDescription?: string | null
          OriginID?: string | null
          OriginType?: string | null
          PackageWeight?: number | null
          PaymentMethod?: string | null
          PendingShippingCharges?: unknown
          PickTicketPrinted?: boolean | null
          PickTicketReadyToPrint?: boolean | null
          PO?: string | null
          Printed?: boolean | null
          QuotedDaysToShip?: number | null
          ReadyToInvoice?: boolean | null
          ReadyToPrint?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RelatedOrderNumber?: string | null
          RequestedShipDate?: string | null
          Route?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          SalesTax?: unknown
          SchedDiscountAmount?: unknown
          SchedSalesTax?: unknown
          SchedShippingCharge?: unknown
          SchedSubTotal?: unknown
          SchedTermsDiscountAvailable?: unknown
          SchedTotalAmount?: unknown
          ScheduledWeight?: number | null
          ShipmentPromisedDate?: string | null
          ShippingDocumentPrinted?: boolean | null
          ShippingDocumentReadyToPrint?: boolean | null
          ShippingInstructions?: string | null
          ShipQuoteDate?: string | null
          ShipQuoteGUIDTemplate?: string | null
          ShipQuoteID?: string | null
          ShipToAddress?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToDescription?: string | null
          ShipToOverride?: boolean | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          ShipWorkstationExportDate?: string | null
          ShipWorkstationShipmentID?: string | null
          SoldToAddress?: string | null
          SoldToAddress1?: string | null
          SoldToAddress2?: string | null
          SoldToAddress3?: string | null
          SoldToAddress4?: string | null
          SoldToCity?: string | null
          SoldToCountry?: string | null
          SoldToName?: string | null
          SoldToOverride?: boolean | null
          SoldToState?: string | null
          SoldToZip?: string | null
          SpecialInstructions?: string | null
          StatusChangedBy?: string | null
          StatusDate?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          Taxable?: boolean | null
          TaxCatID?: string | null
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TaxPercentText?: string | null
          TemplateID?: string | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TotalAmount?: unknown
          TotalShippingCharges?: number | null
          TrackingNumber?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          WebOrder?: boolean | null
          WebOrderID?: string | null
          WebOrderNumber?: string | null
          WorkFlowStatus?: string | null
          WorkFlowStatusAbbreviation?: string | null
          WorkFlowStatusChangedBy?: string | null
          WorkFlowStatusDate?: string | null
        }
        Update: {
          _Rep1?: string | null
          _Rep2?: string | null
          _Rep2Pct?: number | null
          _RepPct?: number | null
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          BackorderCriteria?: string | null
          BankId?: string | null
          BeingPickedBy?: string | null
          BranchID?: string | null
          BranchName?: string | null
          Carrier?: string | null
          CarrierAndService?: string | null
          CarrierService?: string | null
          CCAddress?: string | null
          CCExpDate?: string | null
          CCName?: string | null
          CCNumber?: string | null
          CCPostalCode?: string | null
          CheckNo?: string | null
          Class?: string | null
          Comment?: string | null
          CompanyName?: string | null
          CompanyTaxID?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFax?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractID?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          CurrencyCode?: string | null
          CurrencyName?: string | null
          CustomerID?: string | null
          CustomerTaxID?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscAmt?: unknown
          DiscountAmount?: unknown
          DiscountType?: string | null
          DontShipAfter?: string | null
          DontShipBefore?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          FOB?: string | null
          ForeignAmtPaid?: unknown
          ForeignDiscountAmount?: unknown
          ForeignPendingShippingCharges?: unknown
          ForeignSalesTax?: unknown
          ForeignSchedDiscountAmount?: unknown
          ForeignSchedSalesTax?: unknown
          ForeignSchedShippingCharge?: unknown
          ForeignSchedSubTotal?: unknown
          ForeignSchedTermsDiscountAvailable?: unknown
          ForeignSchedTotalAmount?: unknown
          ForeignSubTotal?: unknown
          ForeignTotalAmount?: unknown
          ForeignTotalShippingCharges?: unknown
          FromEDI?: boolean | null
          FrtTaxPct?: number | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCurrency?: string | null
          GUIDCustomer?: string | null
          GUIDCustomerType?: string | null
          GUIDLocation?: string | null
          GUIDOrder?: string
          GUIDOrderWorkFlowStatus?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRelatedOrder?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTemplate?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormat?: string | null
          InvoiceFormatGUID?: string | null
          InvoicingError?: boolean | null
          InvoicingErrorMessage?: string | null
          JobNumber?: string | null
          LastShipmentDate?: string | null
          LocationID?: string | null
          LostBusinessCode?: string | null
          LostBusinessComment?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          NextInvoiceNumber?: string | null
          NextShipmentNumber?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          OrderNumberSort?: string | null
          OrderStatus?: string | null
          OrderStatusDescription?: string | null
          OriginID?: string | null
          OriginType?: string | null
          PackageWeight?: number | null
          PaymentMethod?: string | null
          PendingShippingCharges?: unknown
          PickTicketPrinted?: boolean | null
          PickTicketReadyToPrint?: boolean | null
          PO?: string | null
          Printed?: boolean | null
          QuotedDaysToShip?: number | null
          ReadyToInvoice?: boolean | null
          ReadyToPrint?: boolean | null
          Reference?: string | null
          Reference2?: string | null
          RelatedOrderNumber?: string | null
          RequestedShipDate?: string | null
          Route?: string | null
          SalespersonID?: string | null
          SalespersonName?: string | null
          SalesTax?: unknown
          SchedDiscountAmount?: unknown
          SchedSalesTax?: unknown
          SchedShippingCharge?: unknown
          SchedSubTotal?: unknown
          SchedTermsDiscountAvailable?: unknown
          SchedTotalAmount?: unknown
          ScheduledWeight?: number | null
          ShipmentPromisedDate?: string | null
          ShippingDocumentPrinted?: boolean | null
          ShippingDocumentReadyToPrint?: boolean | null
          ShippingInstructions?: string | null
          ShipQuoteDate?: string | null
          ShipQuoteGUIDTemplate?: string | null
          ShipQuoteID?: string | null
          ShipToAddress?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToDescription?: string | null
          ShipToOverride?: boolean | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          ShipWorkstationExportDate?: string | null
          ShipWorkstationShipmentID?: string | null
          SoldToAddress?: string | null
          SoldToAddress1?: string | null
          SoldToAddress2?: string | null
          SoldToAddress3?: string | null
          SoldToAddress4?: string | null
          SoldToCity?: string | null
          SoldToCountry?: string | null
          SoldToName?: string | null
          SoldToOverride?: boolean | null
          SoldToState?: string | null
          SoldToZip?: string | null
          SpecialInstructions?: string | null
          StatusChangedBy?: string | null
          StatusDate?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          Taxable?: boolean | null
          TaxCatID?: string | null
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TaxPercentText?: string | null
          TemplateID?: string | null
          TermsCode?: string | null
          TermsDescription?: string | null
          TotalAmount?: unknown
          TotalShippingCharges?: number | null
          TrackingNumber?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          WebOrder?: boolean | null
          WebOrderID?: string | null
          WebOrderNumber?: string | null
          WorkFlowStatus?: string | null
          WorkFlowStatusAbbreviation?: string | null
          WorkFlowStatusChangedBy?: string | null
          WorkFlowStatusDate?: string | null
        }
        Relationships: []
      }
      dbo_tbOrder: {
        Row: {}
        Insert: {}
        Update: {}
        Relationships: []
      }
      dbo_tbOrders: {
        Row: {
          _Rep1: string | null
          _Rep2: string | null
          _Rep2Pct: number | null
          _RepPct: number | null
          _skyvia_sync: string | null
          AmtPaid: unknown
          BackorderCriteria: string | null
          BankId: string | null
          BeingPickedBy: string | null
          Carrier: string | null
          CarrierService: string | null
          CCAddress: string | null
          CCExpDate: string | null
          CCName: string | null
          CCNumber: string | null
          CCPostalCode: string | null
          CheckNo: string | null
          Comment: string | null
          Completed: boolean | null
          ContactEMailAddress: string | null
          ContactFax: string | null
          ContactName: string | null
          ContactPhoneNumber: string | null
          ContractID: string | null
          CreditApprovalDate: string | null
          CreditApprovedBy: string | null
          DeliveredBy: string | null
          DeliveredTo: string | null
          DeliveryDate: string | null
          DeliveryMiles: number | null
          DiscAmt: unknown
          DiscountAmount: unknown
          DiscountType: string | null
          DontShipAfter: string | null
          DontShipBefore: string | null
          EnteredBy: string | null
          EntryDate: string | null
          ExchangeRate: number | null
          FOB: string | null
          FrtTaxPct: number | null
          GUIDBranch: string | null
          GUIDClass: string | null
          GUIDCustomer: string | null
          GUIDCustomerType: string | null
          GUIDLocation: string | null
          GUIDOrder: string
          GUIDOrderWorkFlowStatus: string | null
          GUIDPaymentMethod: string | null
          GUIDRelatedOrder: string | null
          GUIDRoute: string | null
          GUIDSalesperson: string | null
          GUIDTaxCategory: string | null
          GUIDTaxCode: string | null
          GUIDTemplate: string | null
          GUIDTerms: string | null
          HoldReleasedBy: string | null
          HoldReleasedDate: string | null
          InvoiceDiscountPct: number | null
          InvoiceFormatGUID: string | null
          InvoicingError: boolean | null
          InvoicingErrorMessage: string | null
          JobNumber: string | null
          LastOrderStatusSyncDate: string | null
          LastShipmentDate: string | null
          LostBusinessCode: string | null
          LostBusinessComment: string | null
          ManualHold: boolean | null
          MarketingCode: string | null
          MethodOfPayment: number | null
          NextInvoiceNumber: string | null
          NextShipmentNumber: number | null
          Note: string | null
          NumberOfPackages: number | null
          OrderDate: string | null
          OrderNumber: string | null
          OrderStatus: string | null
          OriginID: string | null
          OriginType: string | null
          PackageWeight: number | null
          PendingShippingCharges: unknown
          PickTicketPrinted: boolean | null
          PickTicketReadyToPrint: boolean | null
          PO: string | null
          Printed: boolean | null
          QuotedDaysToShip: number | null
          ReadyToInvoice: boolean | null
          ReadyToPrint: boolean | null
          RedactionStatus: string | null
          Reference: string | null
          Reference2: string | null
          RequestedShipDate: string | null
          SalesTax: unknown
          SchedDiscountAmount: unknown
          SchedSalesTax: unknown
          SchedShippingCharge: unknown
          SchedSubTotal: unknown
          SchedTermsDiscountAvailable: unknown
          SchedTotalAmount: unknown
          ShipmentPromisedDate: string | null
          ShippingDocumentPrinted: boolean | null
          ShippingDocumentReadyToPrint: boolean | null
          ShippingInstructions: string | null
          ShipQuoteDate: string | null
          ShipQuoteGUIDTemplate: string | null
          ShipQuoteID: string | null
          ShipToAddress1: string | null
          ShipToAddress2: string | null
          ShipToAddress3: string | null
          ShipToAddress4: string | null
          ShipToAttn: string | null
          ShipToCity: string | null
          ShipToCountry: string | null
          ShipToDescription: string | null
          ShipToOverride: boolean | null
          ShipToState: string | null
          ShipToZip: string | null
          ShipVia: string | null
          ShipWorkstationExportDate: string | null
          ShipWorkstationShipmentID: string | null
          SoldToAddress1: string | null
          SoldToAddress2: string | null
          SoldToAddress3: string | null
          SoldToAddress4: string | null
          SoldToCity: string | null
          SoldToCountry: string | null
          SoldToName: string | null
          SoldToOverride: boolean | null
          SoldToState: string | null
          SoldToZip: string | null
          SpecialInstructions: string | null
          StatusChangedBy: string | null
          StatusDate: string | null
          StopNumber: number | null
          SubTotal: unknown
          TaxIncluded: boolean | null
          TaxPct: number | null
          TaxPercentText: string | null
          TermsDescription: string | null
          TotalAmount: unknown
          TrackingNumber: string | null
          Type: string | null
          UpdatedBy: string | null
          UpdatedDate: string | null
          WebCustomerID: string | null
          WebOrderID: string | null
          WebOrderNumber: string | null
          WorkFlowStatusChangedBy: string | null
          WorkFlowStatusDate: string | null
        }
        Insert: {
          _Rep1?: string | null
          _Rep2?: string | null
          _Rep2Pct?: number | null
          _RepPct?: number | null
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          BackorderCriteria?: string | null
          BankId?: string | null
          BeingPickedBy?: string | null
          Carrier?: string | null
          CarrierService?: string | null
          CCAddress?: string | null
          CCExpDate?: string | null
          CCName?: string | null
          CCNumber?: string | null
          CCPostalCode?: string | null
          CheckNo?: string | null
          Comment?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFax?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractID?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscAmt?: unknown
          DiscountAmount?: unknown
          DiscountType?: string | null
          DontShipAfter?: string | null
          DontShipBefore?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          FOB?: string | null
          FrtTaxPct?: number | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCustomer?: string | null
          GUIDCustomerType?: string | null
          GUIDLocation?: string | null
          GUIDOrder: string
          GUIDOrderWorkFlowStatus?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRelatedOrder?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTemplate?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormatGUID?: string | null
          InvoicingError?: boolean | null
          InvoicingErrorMessage?: string | null
          JobNumber?: string | null
          LastOrderStatusSyncDate?: string | null
          LastShipmentDate?: string | null
          LostBusinessCode?: string | null
          LostBusinessComment?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          NextInvoiceNumber?: string | null
          NextShipmentNumber?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          OrderStatus?: string | null
          OriginID?: string | null
          OriginType?: string | null
          PackageWeight?: number | null
          PendingShippingCharges?: unknown
          PickTicketPrinted?: boolean | null
          PickTicketReadyToPrint?: boolean | null
          PO?: string | null
          Printed?: boolean | null
          QuotedDaysToShip?: number | null
          ReadyToInvoice?: boolean | null
          ReadyToPrint?: boolean | null
          RedactionStatus?: string | null
          Reference?: string | null
          Reference2?: string | null
          RequestedShipDate?: string | null
          SalesTax?: unknown
          SchedDiscountAmount?: unknown
          SchedSalesTax?: unknown
          SchedShippingCharge?: unknown
          SchedSubTotal?: unknown
          SchedTermsDiscountAvailable?: unknown
          SchedTotalAmount?: unknown
          ShipmentPromisedDate?: string | null
          ShippingDocumentPrinted?: boolean | null
          ShippingDocumentReadyToPrint?: boolean | null
          ShippingInstructions?: string | null
          ShipQuoteDate?: string | null
          ShipQuoteGUIDTemplate?: string | null
          ShipQuoteID?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToDescription?: string | null
          ShipToOverride?: boolean | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          ShipWorkstationExportDate?: string | null
          ShipWorkstationShipmentID?: string | null
          SoldToAddress1?: string | null
          SoldToAddress2?: string | null
          SoldToAddress3?: string | null
          SoldToAddress4?: string | null
          SoldToCity?: string | null
          SoldToCountry?: string | null
          SoldToName?: string | null
          SoldToOverride?: boolean | null
          SoldToState?: string | null
          SoldToZip?: string | null
          SpecialInstructions?: string | null
          StatusChangedBy?: string | null
          StatusDate?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TaxPercentText?: string | null
          TermsDescription?: string | null
          TotalAmount?: unknown
          TrackingNumber?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          WebCustomerID?: string | null
          WebOrderID?: string | null
          WebOrderNumber?: string | null
          WorkFlowStatusChangedBy?: string | null
          WorkFlowStatusDate?: string | null
        }
        Update: {
          _Rep1?: string | null
          _Rep2?: string | null
          _Rep2Pct?: number | null
          _RepPct?: number | null
          _skyvia_sync?: string | null
          AmtPaid?: unknown
          BackorderCriteria?: string | null
          BankId?: string | null
          BeingPickedBy?: string | null
          Carrier?: string | null
          CarrierService?: string | null
          CCAddress?: string | null
          CCExpDate?: string | null
          CCName?: string | null
          CCNumber?: string | null
          CCPostalCode?: string | null
          CheckNo?: string | null
          Comment?: string | null
          Completed?: boolean | null
          ContactEMailAddress?: string | null
          ContactFax?: string | null
          ContactName?: string | null
          ContactPhoneNumber?: string | null
          ContractID?: string | null
          CreditApprovalDate?: string | null
          CreditApprovedBy?: string | null
          DeliveredBy?: string | null
          DeliveredTo?: string | null
          DeliveryDate?: string | null
          DeliveryMiles?: number | null
          DiscAmt?: unknown
          DiscountAmount?: unknown
          DiscountType?: string | null
          DontShipAfter?: string | null
          DontShipBefore?: string | null
          EnteredBy?: string | null
          EntryDate?: string | null
          ExchangeRate?: number | null
          FOB?: string | null
          FrtTaxPct?: number | null
          GUIDBranch?: string | null
          GUIDClass?: string | null
          GUIDCustomer?: string | null
          GUIDCustomerType?: string | null
          GUIDLocation?: string | null
          GUIDOrder?: string
          GUIDOrderWorkFlowStatus?: string | null
          GUIDPaymentMethod?: string | null
          GUIDRelatedOrder?: string | null
          GUIDRoute?: string | null
          GUIDSalesperson?: string | null
          GUIDTaxCategory?: string | null
          GUIDTaxCode?: string | null
          GUIDTemplate?: string | null
          GUIDTerms?: string | null
          HoldReleasedBy?: string | null
          HoldReleasedDate?: string | null
          InvoiceDiscountPct?: number | null
          InvoiceFormatGUID?: string | null
          InvoicingError?: boolean | null
          InvoicingErrorMessage?: string | null
          JobNumber?: string | null
          LastOrderStatusSyncDate?: string | null
          LastShipmentDate?: string | null
          LostBusinessCode?: string | null
          LostBusinessComment?: string | null
          ManualHold?: boolean | null
          MarketingCode?: string | null
          MethodOfPayment?: number | null
          NextInvoiceNumber?: string | null
          NextShipmentNumber?: number | null
          Note?: string | null
          NumberOfPackages?: number | null
          OrderDate?: string | null
          OrderNumber?: string | null
          OrderStatus?: string | null
          OriginID?: string | null
          OriginType?: string | null
          PackageWeight?: number | null
          PendingShippingCharges?: unknown
          PickTicketPrinted?: boolean | null
          PickTicketReadyToPrint?: boolean | null
          PO?: string | null
          Printed?: boolean | null
          QuotedDaysToShip?: number | null
          ReadyToInvoice?: boolean | null
          ReadyToPrint?: boolean | null
          RedactionStatus?: string | null
          Reference?: string | null
          Reference2?: string | null
          RequestedShipDate?: string | null
          SalesTax?: unknown
          SchedDiscountAmount?: unknown
          SchedSalesTax?: unknown
          SchedShippingCharge?: unknown
          SchedSubTotal?: unknown
          SchedTermsDiscountAvailable?: unknown
          SchedTotalAmount?: unknown
          ShipmentPromisedDate?: string | null
          ShippingDocumentPrinted?: boolean | null
          ShippingDocumentReadyToPrint?: boolean | null
          ShippingInstructions?: string | null
          ShipQuoteDate?: string | null
          ShipQuoteGUIDTemplate?: string | null
          ShipQuoteID?: string | null
          ShipToAddress1?: string | null
          ShipToAddress2?: string | null
          ShipToAddress3?: string | null
          ShipToAddress4?: string | null
          ShipToAttn?: string | null
          ShipToCity?: string | null
          ShipToCountry?: string | null
          ShipToDescription?: string | null
          ShipToOverride?: boolean | null
          ShipToState?: string | null
          ShipToZip?: string | null
          ShipVia?: string | null
          ShipWorkstationExportDate?: string | null
          ShipWorkstationShipmentID?: string | null
          SoldToAddress1?: string | null
          SoldToAddress2?: string | null
          SoldToAddress3?: string | null
          SoldToAddress4?: string | null
          SoldToCity?: string | null
          SoldToCountry?: string | null
          SoldToName?: string | null
          SoldToOverride?: boolean | null
          SoldToState?: string | null
          SoldToZip?: string | null
          SpecialInstructions?: string | null
          StatusChangedBy?: string | null
          StatusDate?: string | null
          StopNumber?: number | null
          SubTotal?: unknown
          TaxIncluded?: boolean | null
          TaxPct?: number | null
          TaxPercentText?: string | null
          TermsDescription?: string | null
          TotalAmount?: unknown
          TrackingNumber?: string | null
          Type?: string | null
          UpdatedBy?: string | null
          UpdatedDate?: string | null
          WebCustomerID?: string | null
          WebOrderID?: string | null
          WebOrderNumber?: string | null
          WorkFlowStatusChangedBy?: string | null
          WorkFlowStatusDate?: string | null
        }
        Relationships: []
      }
      dealer_acctivate_uuids: {
        Row: {
          acctivate_uuid: string
          created_at: string
          dealer_id: string
        }
        Insert: {
          acctivate_uuid: string
          created_at?: string
          dealer_id: string
        }
        Update: {
          acctivate_uuid?: string
          created_at?: string
          dealer_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_acctivate_uuids_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
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
      dealer_invoice_lines: {
        Row: {
          acctivate_id: string
          created_at: string
          dealer_acctivate_id: string | null
          dealer_id: string | null
          extended_price: number | null
          id: string
          invoice_acctivate_id: string | null
          invoice_date: string | null
          invoice_id: string | null
          product_id: string | null
          product_name: string | null
          qty: number | null
          sku: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          acctivate_id: string
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          extended_price?: number | null
          id?: string
          invoice_acctivate_id?: string | null
          invoice_date?: string | null
          invoice_id?: string | null
          product_id?: string | null
          product_name?: string | null
          qty?: number | null
          sku?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          extended_price?: number | null
          id?: string
          invoice_acctivate_id?: string | null
          invoice_date?: string | null
          invoice_id?: string | null
          product_id?: string | null
          product_name?: string | null
          qty?: number | null
          sku?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      dealer_invoices: {
        Row: {
          acctivate_id: string
          balance: number | null
          branch: string | null
          created_at: string
          dealer_acctivate_id: string | null
          dealer_id: string | null
          due_date: string | null
          freight: number | null
          id: string
          invoice_date: string | null
          invoice_number: string | null
          po_number: string | null
          salesperson: string | null
          status: string | null
          subtotal: number | null
          tax: number | null
          terms: string | null
          total: number | null
          updated_at: string
        }
        Insert: {
          acctivate_id: string
          balance?: number | null
          branch?: string | null
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          due_date?: string | null
          freight?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          po_number?: string | null
          salesperson?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          terms?: string | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          acctivate_id?: string
          balance?: number | null
          branch?: string | null
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          due_date?: string | null
          freight?: number | null
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          po_number?: string | null
          salesperson?: string | null
          status?: string | null
          subtotal?: number | null
          tax?: number | null
          terms?: string | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_invoices_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
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
          crm_account_id: string | null
          email: string | null
          engagement: string | null
          first_name: string | null
          id: string
          last_contact: string | null
          last_name: string | null
          lat: number | null
          lng: number | null
          manager_id: string | null
          name: string
          notes: string | null
          phone: string | null
          rep_id: string | null
          rep_owner: string | null
          revenue: number | null
          sales_manager: string | null
          salesperson: string | null
          source: string
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
          crm_account_id?: string | null
          email?: string | null
          engagement?: string | null
          first_name?: string | null
          id?: string
          last_contact?: string | null
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          manager_id?: string | null
          name: string
          notes?: string | null
          phone?: string | null
          rep_id?: string | null
          rep_owner?: string | null
          revenue?: number | null
          sales_manager?: string | null
          salesperson?: string | null
          source?: string
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
          crm_account_id?: string | null
          email?: string | null
          engagement?: string | null
          first_name?: string | null
          id?: string
          last_contact?: string | null
          last_name?: string | null
          lat?: number | null
          lng?: number | null
          manager_id?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          rep_id?: string | null
          rep_owner?: string | null
          revenue?: number | null
          sales_manager?: string | null
          salesperson?: string | null
          source?: string
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
            foreignKeyName: "dealers_crm_account_id_fkey"
            columns: ["crm_account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealers_crm_account_id_fkey"
            columns: ["crm_account_id"]
            isOneToOne: false
            referencedRelation: "v_prospect_reporting_overview"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealers_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealers_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealers_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "v_companywide_reporting_actuals"
            referencedColumns: ["portal_rep_id"]
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
          idempotency_key: string | null
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
          idempotency_key?: string | null
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
          idempotency_key?: string | null
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
          {
            foreignKeyName: "kpi_records_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "v_companywide_reporting_actuals"
            referencedColumns: ["portal_rep_id"]
          },
        ]
      }
      labor_day_2026_participants: {
        Row: {
          active: boolean
          company_name: string | null
          created_at: string
          cust_id: string
          dealer_name: string | null
          id: string
          promo_slug: string
          sales_manager: string | null
          salesperson_id: string
          salesperson_name: string | null
          territory: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          company_name?: string | null
          created_at?: string
          cust_id: string
          dealer_name?: string | null
          id?: string
          promo_slug?: string
          sales_manager?: string | null
          salesperson_id: string
          salesperson_name?: string | null
          territory?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          company_name?: string | null
          created_at?: string
          cust_id?: string
          dealer_name?: string | null
          id?: string
          promo_slug?: string
          sales_manager?: string | null
          salesperson_id?: string
          salesperson_name?: string | null
          territory?: string | null
          updated_at?: string
        }
        Relationships: []
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
      manager_task_attachments: {
        Row: {
          content_type: string | null
          created_at: string
          file_name: string
          id: string
          size_bytes: number | null
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Insert: {
          content_type?: string | null
          created_at?: string
          file_name: string
          id?: string
          size_bytes?: number | null
          storage_path: string
          task_id: string
          uploaded_by: string
        }
        Update: {
          content_type?: string | null
          created_at?: string
          file_name?: string
          id?: string
          size_bytes?: number | null
          storage_path?: string
          task_id?: string
          uploaded_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_task_attachments_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "manager_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      manager_task_updates: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          mentions: string[]
          task_id: string
          updated_at: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          mentions?: string[]
          task_id: string
          updated_at?: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          mentions?: string[]
          task_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_task_updates_task_id_fkey"
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
          is_sop: boolean
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
          is_sop?: boolean
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
          is_sop?: boolean
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
      manager_weekly_reviews: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          manager_id: string
          responses: Json
          updated_at: string
          updated_by: string | null
          week_start: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          manager_id: string
          responses?: Json
          updated_at?: string
          updated_by?: string | null
          week_start: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          manager_id?: string
          responses?: Json
          updated_at?: string
          updated_by?: string | null
          week_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "manager_weekly_reviews_manager_id_fkey"
            columns: ["manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
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
      market_appointment_events: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          id: string
          location: string | null
          name: string
          start_date: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name: string
          start_date?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          name?: string
          start_date?: string | null
        }
        Relationships: []
      }
      market_appointments: {
        Row: {
          appointment_day: string | null
          appointment_time: string | null
          buyer_email: string | null
          buyer_name: string | null
          created_at: string
          created_by: string | null
          dealer: string | null
          event_id: string | null
          id: string
          notes: string | null
          phase: string
          rep_id: string
          status: string
          updated_at: string
        }
        Insert: {
          appointment_day?: string | null
          appointment_time?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by?: string | null
          dealer?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          phase?: string
          rep_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          appointment_day?: string | null
          appointment_time?: string | null
          buyer_email?: string | null
          buyer_name?: string | null
          created_at?: string
          created_by?: string | null
          dealer?: string | null
          event_id?: string | null
          id?: string
          notes?: string | null
          phase?: string
          rep_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_appointments_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "market_appointment_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_appointments_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_appointments_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "v_companywide_reporting_actuals"
            referencedColumns: ["portal_rep_id"]
          },
        ]
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
          dealer_acctivate_id: string | null
          dealer_id: string | null
          dealer_name: string | null
          extended_value: number
          id: string
          last_synced_at: string | null
          order_date: string | null
          order_number: string | null
          promised_date: string | null
          qty_open: number
          rep: string | null
          sku: string
          stock_class: string | null
          stock_class_description: string | null
          unit_price: number
          updated_at: string
        }
        Insert: {
          acctivate_id?: string | null
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          dealer_name?: string | null
          extended_value?: number
          id?: string
          last_synced_at?: string | null
          order_date?: string | null
          order_number?: string | null
          promised_date?: string | null
          qty_open?: number
          rep?: string | null
          sku: string
          stock_class?: string | null
          stock_class_description?: string | null
          unit_price?: number
          updated_at?: string
        }
        Update: {
          acctivate_id?: string | null
          created_at?: string
          dealer_acctivate_id?: string | null
          dealer_id?: string | null
          dealer_name?: string | null
          extended_value?: number
          id?: string
          last_synced_at?: string | null
          order_date?: string | null
          order_number?: string | null
          promised_date?: string | null
          qty_open?: number
          rep?: string | null
          sku?: string
          stock_class?: string | null
          stock_class_description?: string | null
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
      portal_acctivate_discontinued_inventory: {
        Row: {
          active_product: string | null
          avail_on_web: string | null
          available: string | null
          description: string | null
          discontinued: string | null
          guid_product: string | null
          guid_product_warehouse: string
          item_type: string | null
          list_price: string | null
          list_price_type: string | null
          list_price_unit: string | null
          on_hand: string | null
          on_hand_value: string | null
          product_class: string | null
          product_id: string | null
          stock_unit: string | null
          synced_at: string | null
          warehouse: string | null
        }
        Insert: {
          active_product?: string | null
          avail_on_web?: string | null
          available?: string | null
          description?: string | null
          discontinued?: string | null
          guid_product?: string | null
          guid_product_warehouse: string
          item_type?: string | null
          list_price?: string | null
          list_price_type?: string | null
          list_price_unit?: string | null
          on_hand?: string | null
          on_hand_value?: string | null
          product_class?: string | null
          product_id?: string | null
          stock_unit?: string | null
          synced_at?: string | null
          warehouse?: string | null
        }
        Update: {
          active_product?: string | null
          avail_on_web?: string | null
          available?: string | null
          description?: string | null
          discontinued?: string | null
          guid_product?: string | null
          guid_product_warehouse?: string
          item_type?: string | null
          list_price?: string | null
          list_price_type?: string | null
          list_price_unit?: string | null
          on_hand?: string | null
          on_hand_value?: string | null
          product_class?: string | null
          product_id?: string | null
          stock_unit?: string | null
          synced_at?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      portal_acctivate_discontinued_sales: {
        Row: {
          guid_invoice_detail: string
          invoice_number: string | null
          product: string | null
          product_class: string | null
          quantity: string | null
          rep_id: string | null
          rep_name: string | null
          sale_date: string | null
          sales_amount: string | null
          sku: string | null
          synced_at: string | null
          week_end: string | null
          week_start: string | null
        }
        Insert: {
          guid_invoice_detail: string
          invoice_number?: string | null
          product?: string | null
          product_class?: string | null
          quantity?: string | null
          rep_id?: string | null
          rep_name?: string | null
          sale_date?: string | null
          sales_amount?: string | null
          sku?: string | null
          synced_at?: string | null
          week_end?: string | null
          week_start?: string | null
        }
        Update: {
          guid_invoice_detail?: string
          invoice_number?: string | null
          product?: string | null
          product_class?: string | null
          quantity?: string | null
          rep_id?: string | null
          rep_name?: string | null
          sale_date?: string | null
          sales_amount?: string | null
          sku?: string | null
          synced_at?: string | null
          week_end?: string | null
          week_start?: string | null
        }
        Relationships: []
      }
      portal_acctivate_inventory_summary: {
        Row: {
          active_product: string | null
          active_warehouse: string | null
          avail_on_web: string | null
          available: string | null
          description: string | null
          discontinued: string | null
          guid_product: string | null
          guid_product_warehouse: string
          item_type: string | null
          on_hand: string | null
          on_hand_value: string | null
          product_class: string | null
          product_id: string | null
          stock_unit: string | null
          synced_at: string | null
          warehouse: string | null
        }
        Insert: {
          active_product?: string | null
          active_warehouse?: string | null
          avail_on_web?: string | null
          available?: string | null
          description?: string | null
          discontinued?: string | null
          guid_product?: string | null
          guid_product_warehouse: string
          item_type?: string | null
          on_hand?: string | null
          on_hand_value?: string | null
          product_class?: string | null
          product_id?: string | null
          stock_unit?: string | null
          synced_at?: string | null
          warehouse?: string | null
        }
        Update: {
          active_product?: string | null
          active_warehouse?: string | null
          avail_on_web?: string | null
          available?: string | null
          description?: string | null
          discontinued?: string | null
          guid_product?: string | null
          guid_product_warehouse?: string
          item_type?: string | null
          on_hand?: string | null
          on_hand_value?: string | null
          product_class?: string | null
          product_id?: string | null
          stock_unit?: string | null
          synced_at?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      portal_acctivate_invoice_lines: {
        Row: {
          description: string | null
          freight: boolean | null
          freight_amount: string | null
          guid_invoice: string | null
          guid_invoice_detail: string
          guid_sales_account: string | null
          invoice_date: string | null
          invoice_detail_amount: string | null
          invoice_number: string | null
          line_amount: string | null
          line_number: number | null
          line_type: string | null
          product_class: string | null
          product_id: string | null
          quantity: string | null
          sales_account_id: string | null
          synced_at: string | null
          tariff_amount: string | null
          transaction_date: string | null
          transaction_period: number | null
          transaction_year: number | null
          unit_price: string | null
          warehouse: string | null
        }
        Insert: {
          description?: string | null
          freight?: boolean | null
          freight_amount?: string | null
          guid_invoice?: string | null
          guid_invoice_detail: string
          guid_sales_account?: string | null
          invoice_date?: string | null
          invoice_detail_amount?: string | null
          invoice_number?: string | null
          line_amount?: string | null
          line_number?: number | null
          line_type?: string | null
          product_class?: string | null
          product_id?: string | null
          quantity?: string | null
          sales_account_id?: string | null
          synced_at?: string | null
          tariff_amount?: string | null
          transaction_date?: string | null
          transaction_period?: number | null
          transaction_year?: number | null
          unit_price?: string | null
          warehouse?: string | null
        }
        Update: {
          description?: string | null
          freight?: boolean | null
          freight_amount?: string | null
          guid_invoice?: string | null
          guid_invoice_detail?: string
          guid_sales_account?: string | null
          invoice_date?: string | null
          invoice_detail_amount?: string | null
          invoice_number?: string | null
          line_amount?: string | null
          line_number?: number | null
          line_type?: string | null
          product_class?: string | null
          product_id?: string | null
          quantity?: string | null
          sales_account_id?: string | null
          synced_at?: string | null
          tariff_amount?: string | null
          transaction_date?: string | null
          transaction_period?: number | null
          transaction_year?: number | null
          unit_price?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      portal_acctivate_invoices: {
        Row: {
          branch_id: string | null
          completed: boolean | null
          customer_id: string | null
          customer_name: string | null
          fob: string | null
          guid_customer: string | null
          guid_invoice: string
          invoice_date: string | null
          invoice_number: string | null
          invoice_type: string | null
          posted_to_ar: boolean | null
          sales_rep_id: string | null
          sales_rep_name: string | null
          ship_via: string | null
          shipping_charge: string | null
          synced_at: string | null
          territory: string | null
          total_amount: string | null
        }
        Insert: {
          branch_id?: string | null
          completed?: boolean | null
          customer_id?: string | null
          customer_name?: string | null
          fob?: string | null
          guid_customer?: string | null
          guid_invoice: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: string | null
          posted_to_ar?: boolean | null
          sales_rep_id?: string | null
          sales_rep_name?: string | null
          ship_via?: string | null
          shipping_charge?: string | null
          synced_at?: string | null
          territory?: string | null
          total_amount?: string | null
        }
        Update: {
          branch_id?: string | null
          completed?: boolean | null
          customer_id?: string | null
          customer_name?: string | null
          fob?: string | null
          guid_customer?: string | null
          guid_invoice?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: string | null
          posted_to_ar?: boolean | null
          sales_rep_id?: string | null
          sales_rep_name?: string | null
          ship_via?: string | null
          shipping_charge?: string | null
          synced_at?: string | null
          territory?: string | null
          total_amount?: string | null
        }
        Relationships: []
      }
      portal_acctivate_order_lines: {
        Row: {
          amount: string | null
          completed: boolean | null
          component_level: string | null
          description: string | null
          discount_code: string | null
          duplicate_row_ordinal: number | null
          freight: boolean | null
          freight_amount: string | null
          guid_order: string | null
          guid_order_detail: string
          invoice_discount_amount: string | null
          line_cancelled: boolean | null
          line_discount_pct: string | null
          line_number: number | null
          line_type: string | null
          natural_key: string | null
          order_date: string | null
          original_price: string | null
          price: number | null
          product_class: string | null
          product_id: string | null
          qty_backordered: string | null
          qty_invoiced: string | null
          qty_ordered: string | null
          qty_outstanding: number | null
          qty_shipped: string | null
          sales_category: string | null
          sched_amount: string | null
          source: string | null
          source_guid_order_detail: string | null
          sub_line_number: string | null
          synced_at: string | null
          tariff_amount: string | null
        }
        Insert: {
          amount?: string | null
          completed?: boolean | null
          component_level?: string | null
          description?: string | null
          discount_code?: string | null
          duplicate_row_ordinal?: number | null
          freight?: boolean | null
          freight_amount?: string | null
          guid_order?: string | null
          guid_order_detail: string
          invoice_discount_amount?: string | null
          line_cancelled?: boolean | null
          line_discount_pct?: string | null
          line_number?: number | null
          line_type?: string | null
          natural_key?: string | null
          order_date?: string | null
          original_price?: string | null
          price?: number | null
          product_class?: string | null
          product_id?: string | null
          qty_backordered?: string | null
          qty_invoiced?: string | null
          qty_ordered?: string | null
          qty_outstanding?: number | null
          qty_shipped?: string | null
          sales_category?: string | null
          sched_amount?: string | null
          source?: string | null
          source_guid_order_detail?: string | null
          sub_line_number?: string | null
          synced_at?: string | null
          tariff_amount?: string | null
        }
        Update: {
          amount?: string | null
          completed?: boolean | null
          component_level?: string | null
          description?: string | null
          discount_code?: string | null
          duplicate_row_ordinal?: number | null
          freight?: boolean | null
          freight_amount?: string | null
          guid_order?: string | null
          guid_order_detail?: string
          invoice_discount_amount?: string | null
          line_cancelled?: boolean | null
          line_discount_pct?: string | null
          line_number?: number | null
          line_type?: string | null
          natural_key?: string | null
          order_date?: string | null
          original_price?: string | null
          price?: number | null
          product_class?: string | null
          product_id?: string | null
          qty_backordered?: string | null
          qty_invoiced?: string | null
          qty_ordered?: string | null
          qty_outstanding?: number | null
          qty_shipped?: string | null
          sales_category?: string | null
          sched_amount?: string | null
          source?: string | null
          source_guid_order_detail?: string | null
          sub_line_number?: string | null
          synced_at?: string | null
          tariff_amount?: string | null
        }
        Relationships: []
      }
      portal_acctivate_orders: {
        Row: {
          branch_id: string | null
          completed: boolean | null
          customer_id: string | null
          discount_amount: string | null
          entry_date: string | null
          fob: string | null
          guid_customer: string | null
          guid_order: string
          guid_salesperson: string | null
          order_date: string | null
          order_number: string | null
          order_status: string | null
          order_type: string | null
          po: string | null
          rep1: string | null
          rep2: string | null
          requested_ship_date: string | null
          sales_tax: string | null
          sched_subtotal: string | null
          sched_total_amount: string | null
          ship_to_description: string | null
          ship_via: string | null
          sold_to_name: string | null
          subtotal: string | null
          synced_at: string | null
          total_amount: string | null
          updated_date: string | null
          workflow_status: string | null
        }
        Insert: {
          branch_id?: string | null
          completed?: boolean | null
          customer_id?: string | null
          discount_amount?: string | null
          entry_date?: string | null
          fob?: string | null
          guid_customer?: string | null
          guid_order: string
          guid_salesperson?: string | null
          order_date?: string | null
          order_number?: string | null
          order_status?: string | null
          order_type?: string | null
          po?: string | null
          rep1?: string | null
          rep2?: string | null
          requested_ship_date?: string | null
          sales_tax?: string | null
          sched_subtotal?: string | null
          sched_total_amount?: string | null
          ship_to_description?: string | null
          ship_via?: string | null
          sold_to_name?: string | null
          subtotal?: string | null
          synced_at?: string | null
          total_amount?: string | null
          updated_date?: string | null
          workflow_status?: string | null
        }
        Update: {
          branch_id?: string | null
          completed?: boolean | null
          customer_id?: string | null
          discount_amount?: string | null
          entry_date?: string | null
          fob?: string | null
          guid_customer?: string | null
          guid_order?: string
          guid_salesperson?: string | null
          order_date?: string | null
          order_number?: string | null
          order_status?: string | null
          order_type?: string | null
          po?: string | null
          rep1?: string | null
          rep2?: string | null
          requested_ship_date?: string | null
          sales_tax?: string | null
          sched_subtotal?: string | null
          sched_total_amount?: string | null
          ship_to_description?: string | null
          ship_via?: string | null
          sold_to_name?: string | null
          subtotal?: string | null
          synced_at?: string | null
          total_amount?: string | null
          updated_date?: string | null
          workflow_status?: string | null
        }
        Relationships: []
      }
      portal_acctivate_po_lines: {
        Row: {
          amount_open: string | null
          amount_received: string | null
          complete: string | null
          description: string | null
          guid_po: string | null
          guid_po_detail: string
          line_amount: string | null
          line_number: string | null
          line_type: string | null
          po_number: string | null
          po_status: string | null
          po_type: string | null
          price_requested: string | null
          product_id: string | null
          quantity_invoiced: string | null
          quantity_ordered: string | null
          quantity_outstanding: string | null
          quantity_received: string | null
          sales_order_number: string | null
          supplier_product_id: string | null
          synced_at: string | null
          unit: string | null
          warehouse: string | null
        }
        Insert: {
          amount_open?: string | null
          amount_received?: string | null
          complete?: string | null
          description?: string | null
          guid_po?: string | null
          guid_po_detail: string
          line_amount?: string | null
          line_number?: string | null
          line_type?: string | null
          po_number?: string | null
          po_status?: string | null
          po_type?: string | null
          price_requested?: string | null
          product_id?: string | null
          quantity_invoiced?: string | null
          quantity_ordered?: string | null
          quantity_outstanding?: string | null
          quantity_received?: string | null
          sales_order_number?: string | null
          supplier_product_id?: string | null
          synced_at?: string | null
          unit?: string | null
          warehouse?: string | null
        }
        Update: {
          amount_open?: string | null
          amount_received?: string | null
          complete?: string | null
          description?: string | null
          guid_po?: string | null
          guid_po_detail?: string
          line_amount?: string | null
          line_number?: string | null
          line_type?: string | null
          po_number?: string | null
          po_status?: string | null
          po_type?: string | null
          price_requested?: string | null
          product_id?: string | null
          quantity_invoiced?: string | null
          quantity_ordered?: string | null
          quantity_outstanding?: string | null
          quantity_received?: string | null
          sales_order_number?: string | null
          supplier_product_id?: string | null
          synced_at?: string | null
          unit?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      portal_acctivate_po_summary: {
        Row: {
          cargo_ready_date: string | null
          container_num: string | null
          currency: string | null
          customs_broker: string | null
          date_completed: string | null
          dc: string | null
          dc_inv_rec: string | null
          drayage: string | null
          drayage_paid: string | null
          drayage_quote: string | null
          due_date: string | null
          due_in_port: string | null
          email: string | null
          entered_date: string | null
          fob: string | null
          forwarder: string | null
          guid_po: string
          invoiced_amount: string | null
          invoiced_qty: string | null
          issued_date: string | null
          line_count: string | null
          notes: string | null
          ocean_freight_paid: string | null
          ocean_freight_quote: string | null
          ordered_qty: string | null
          orig_eta: string | null
          orig_etd: string | null
          outstanding_amount: string | null
          outstanding_qty: string | null
          percent_invoiced: string | null
          percent_received: string | null
          phone: string | null
          pi_factory_date: string | null
          po_number: string | null
          po_status: string | null
          poa: string | null
          promised_delivery_date: string | null
          received_amount: string | null
          received_qty: string | null
          reference: string | null
          related_doc: string | null
          requested_delivery_date: string | null
          sales_order: string | null
          ship_via: string | null
          short_product_description: string | null
          special_instructions: string | null
          ssl: string | null
          status_date: string | null
          synced_at: string | null
          tariff_paid: string | null
          terms_code: string | null
          total_amount: string | null
          type: string | null
          vendor_contact: string | null
          vendor_id: string | null
          vendor_type: string | null
          vessel: string | null
          warehouse: string | null
        }
        Insert: {
          cargo_ready_date?: string | null
          container_num?: string | null
          currency?: string | null
          customs_broker?: string | null
          date_completed?: string | null
          dc?: string | null
          dc_inv_rec?: string | null
          drayage?: string | null
          drayage_paid?: string | null
          drayage_quote?: string | null
          due_date?: string | null
          due_in_port?: string | null
          email?: string | null
          entered_date?: string | null
          fob?: string | null
          forwarder?: string | null
          guid_po: string
          invoiced_amount?: string | null
          invoiced_qty?: string | null
          issued_date?: string | null
          line_count?: string | null
          notes?: string | null
          ocean_freight_paid?: string | null
          ocean_freight_quote?: string | null
          ordered_qty?: string | null
          orig_eta?: string | null
          orig_etd?: string | null
          outstanding_amount?: string | null
          outstanding_qty?: string | null
          percent_invoiced?: string | null
          percent_received?: string | null
          phone?: string | null
          pi_factory_date?: string | null
          po_number?: string | null
          po_status?: string | null
          poa?: string | null
          promised_delivery_date?: string | null
          received_amount?: string | null
          received_qty?: string | null
          reference?: string | null
          related_doc?: string | null
          requested_delivery_date?: string | null
          sales_order?: string | null
          ship_via?: string | null
          short_product_description?: string | null
          special_instructions?: string | null
          ssl?: string | null
          status_date?: string | null
          synced_at?: string | null
          tariff_paid?: string | null
          terms_code?: string | null
          total_amount?: string | null
          type?: string | null
          vendor_contact?: string | null
          vendor_id?: string | null
          vendor_type?: string | null
          vessel?: string | null
          warehouse?: string | null
        }
        Update: {
          cargo_ready_date?: string | null
          container_num?: string | null
          currency?: string | null
          customs_broker?: string | null
          date_completed?: string | null
          dc?: string | null
          dc_inv_rec?: string | null
          drayage?: string | null
          drayage_paid?: string | null
          drayage_quote?: string | null
          due_date?: string | null
          due_in_port?: string | null
          email?: string | null
          entered_date?: string | null
          fob?: string | null
          forwarder?: string | null
          guid_po?: string
          invoiced_amount?: string | null
          invoiced_qty?: string | null
          issued_date?: string | null
          line_count?: string | null
          notes?: string | null
          ocean_freight_paid?: string | null
          ocean_freight_quote?: string | null
          ordered_qty?: string | null
          orig_eta?: string | null
          orig_etd?: string | null
          outstanding_amount?: string | null
          outstanding_qty?: string | null
          percent_invoiced?: string | null
          percent_received?: string | null
          phone?: string | null
          pi_factory_date?: string | null
          po_number?: string | null
          po_status?: string | null
          poa?: string | null
          promised_delivery_date?: string | null
          received_amount?: string | null
          received_qty?: string | null
          reference?: string | null
          related_doc?: string | null
          requested_delivery_date?: string | null
          sales_order?: string | null
          ship_via?: string | null
          short_product_description?: string | null
          special_instructions?: string | null
          ssl?: string | null
          status_date?: string | null
          synced_at?: string | null
          tariff_paid?: string | null
          terms_code?: string | null
          total_amount?: string | null
          type?: string | null
          vendor_contact?: string | null
          vendor_id?: string | null
          vendor_type?: string | null
          vessel?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      portal_acctivate_product_prices: {
        Row: {
          effective_date: string | null
          expiration_date: string | null
          guid_product_price: string
          high_qty: string | null
          low_qty: string | null
          price: string | null
          price_code: string | null
          price_unit: string | null
          product_id: string | null
          synced_at: string | null
        }
        Insert: {
          effective_date?: string | null
          expiration_date?: string | null
          guid_product_price: string
          high_qty?: string | null
          low_qty?: string | null
          price?: string | null
          price_code?: string | null
          price_unit?: string | null
          product_id?: string | null
          synced_at?: string | null
        }
        Update: {
          effective_date?: string | null
          expiration_date?: string | null
          guid_product_price?: string
          high_qty?: string | null
          low_qty?: string | null
          price?: string | null
          price_code?: string | null
          price_unit?: string | null
          product_id?: string | null
          synced_at?: string | null
        }
        Relationships: []
      }
      portal_qbo_monthly_invoicing_actuals: {
        Row: {
          discounts: number | null
          ecommerce_allowance: number | null
          invoiced_actual: number
          month_number: number
          qbo_end_date: string | null
          qbo_report_basis: string | null
          qbo_start_date: string | null
          qc_factory_defect: number | null
          qc_freight_damage: number | null
          qc_internal_oversight: number | null
          qc_returns: number | null
          sales: number | null
          source: string | null
          synced_at: string | null
          year: number
        }
        Insert: {
          discounts?: number | null
          ecommerce_allowance?: number | null
          invoiced_actual?: number
          month_number: number
          qbo_end_date?: string | null
          qbo_report_basis?: string | null
          qbo_start_date?: string | null
          qc_factory_defect?: number | null
          qc_freight_damage?: number | null
          qc_internal_oversight?: number | null
          qc_returns?: number | null
          sales?: number | null
          source?: string | null
          synced_at?: string | null
          year: number
        }
        Update: {
          discounts?: number | null
          ecommerce_allowance?: number | null
          invoiced_actual?: number
          month_number?: number
          qbo_end_date?: string | null
          qbo_report_basis?: string | null
          qbo_start_date?: string | null
          qc_factory_defect?: number | null
          qc_freight_damage?: number | null
          qc_internal_oversight?: number | null
          qc_returns?: number | null
          sales?: number | null
          source?: string | null
          synced_at?: string | null
          year?: number
        }
        Relationships: []
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
      promotion_products: {
        Row: {
          active: boolean
          created_at: string
          discount_percent: number | null
          id: string
          product_id: string | null
          product_name: string | null
          promo_price: number | null
          promotion_id: string
          sku: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          discount_percent?: number | null
          id?: string
          product_id?: string | null
          product_name?: string | null
          promo_price?: number | null
          promotion_id: string
          sku?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          discount_percent?: number | null
          id?: string
          product_id?: string | null
          product_name?: string | null
          promo_price?: number | null
          promotion_id?: string
          sku?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "promotion_products_promotion_id_fkey"
            columns: ["promotion_id"]
            isOneToOne: false
            referencedRelation: "promotions"
            referencedColumns: ["id"]
          },
        ]
      }
      promotions: {
        Row: {
          active: boolean
          created_at: string
          dealer_goal_amount: number
          end_date: string | null
          id: string
          name: string
          slug: string
          start_date: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          dealer_goal_amount?: number
          end_date?: string | null
          id?: string
          name: string
          slug: string
          start_date?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          dealer_goal_amount?: number
          end_date?: string | null
          id?: string
          name?: string
          slug?: string
          start_date?: string | null
          updated_at?: string
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
      qb_customers: {
        Row: {
          balance: number | null
          bill_address: string | null
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          is_active: boolean | null
          last_synced_at: string | null
          list_id: string
          name: string
          phone: string | null
          ship_address: string | null
          updated_at: string
        }
        Insert: {
          balance?: number | null
          bill_address?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          list_id: string
          name: string
          phone?: string | null
          ship_address?: string | null
          updated_at?: string
        }
        Update: {
          balance?: number | null
          bill_address?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          is_active?: boolean | null
          last_synced_at?: string | null
          list_id?: string
          name?: string
          phone?: string | null
          ship_address?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      qb_invoice_lines: {
        Row: {
          amount: number | null
          created_at: string
          description: string | null
          id: string
          invoice_txn_id: string
          item_name: string | null
          line_number: number | null
          quantity: number | null
          rate: number | null
        }
        Insert: {
          amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_txn_id: string
          item_name?: string | null
          line_number?: number | null
          quantity?: number | null
          rate?: number | null
        }
        Update: {
          amount?: number | null
          created_at?: string
          description?: string | null
          id?: string
          invoice_txn_id?: string
          item_name?: string | null
          line_number?: number | null
          quantity?: number | null
          rate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "qb_invoice_lines_invoice_txn_id_fkey"
            columns: ["invoice_txn_id"]
            isOneToOne: false
            referencedRelation: "qb_invoices"
            referencedColumns: ["txn_id"]
          },
        ]
      }
      qb_invoices: {
        Row: {
          balance_remaining: number | null
          created_at: string
          customer_list_id: string | null
          customer_name: string | null
          due_date: string | null
          id: string
          is_paid: boolean | null
          last_synced_at: string | null
          memo: string | null
          ref_number: string | null
          subtotal: number | null
          tax: number | null
          total: number | null
          txn_date: string | null
          txn_id: string
          updated_at: string
        }
        Insert: {
          balance_remaining?: number | null
          created_at?: string
          customer_list_id?: string | null
          customer_name?: string | null
          due_date?: string | null
          id?: string
          is_paid?: boolean | null
          last_synced_at?: string | null
          memo?: string | null
          ref_number?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          txn_date?: string | null
          txn_id: string
          updated_at?: string
        }
        Update: {
          balance_remaining?: number | null
          created_at?: string
          customer_list_id?: string | null
          customer_name?: string | null
          due_date?: string | null
          id?: string
          is_paid?: boolean | null
          last_synced_at?: string | null
          memo?: string | null
          ref_number?: string | null
          subtotal?: number | null
          tax?: number | null
          total?: number | null
          txn_date?: string | null
          txn_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "qb_invoices_customer_list_id_fkey"
            columns: ["customer_list_id"]
            isOneToOne: false
            referencedRelation: "qb_customers"
            referencedColumns: ["list_id"]
          },
        ]
      }
      qbo_connections: {
        Row: {
          access_token: string
          access_token_expires_at: string | null
          company_name: string | null
          connected_at: string | null
          id: string
          realm_id: string
          refresh_token: string
          refresh_token_expires_at: string | null
          updated_at: string | null
        }
        Insert: {
          access_token: string
          access_token_expires_at?: string | null
          company_name?: string | null
          connected_at?: string | null
          id?: string
          realm_id: string
          refresh_token: string
          refresh_token_expires_at?: string | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string
          access_token_expires_at?: string | null
          company_name?: string | null
          connected_at?: string | null
          id?: string
          realm_id?: string
          refresh_token?: string
          refresh_token_expires_at?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      qbo_oauth_states: {
        Row: {
          created_at: string | null
          state: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          state: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          state?: string
          used_at?: string | null
        }
        Relationships: []
      }
      qbo_sync_logs: {
        Row: {
          created_at: string | null
          error_code: string | null
          error_message: string | null
          function_name: string | null
          id: string
          intuit_tid: string | null
          qbo_endpoint: string | null
          raw_response: Json | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          function_name?: string | null
          id?: string
          intuit_tid?: string | null
          qbo_endpoint?: string | null
          raw_response?: Json | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          error_code?: string | null
          error_message?: string | null
          function_name?: string | null
          id?: string
          intuit_tid?: string | null
          qbo_endpoint?: string | null
          raw_response?: Json | null
          status?: string | null
        }
        Relationships: []
      }
      qbwc_sync_log: {
        Row: {
          action: string | null
          finished_at: string | null
          id: string
          message: string | null
          rows_processed: number | null
          started_at: string
          status: string | null
          ticket: string | null
        }
        Insert: {
          action?: string | null
          finished_at?: string | null
          id?: string
          message?: string | null
          rows_processed?: number | null
          started_at?: string
          status?: string | null
          ticket?: string | null
        }
        Update: {
          action?: string | null
          finished_at?: string | null
          id?: string
          message?: string | null
          rows_processed?: number | null
          started_at?: string
          status?: string | null
          ticket?: string | null
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
            foreignKeyName: "rep_territories_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "v_companywide_reporting_actuals"
            referencedColumns: ["portal_rep_id"]
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
      sop_template_items: {
        Row: {
          created_at: string
          id: string
          position: number
          template_id: string
          title: string
        }
        Insert: {
          created_at?: string
          id?: string
          position?: number
          template_id: string
          title: string
        }
        Update: {
          created_at?: string
          id?: string
          position?: number
          template_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "sop_template_items_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "sop_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      sop_templates: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_builtin: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_builtin?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_builtin?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      stg_acctivate_discontinued_inventory: {
        Row: {
          active_product: string | null
          avail_on_web: string | null
          available: string | null
          description: string | null
          discontinued: string | null
          guid_product: string | null
          guid_product_warehouse: string | null
          item_type: string | null
          list_price: string | null
          list_price_type: string | null
          list_price_unit: string | null
          on_hand: string | null
          on_hand_value: string | null
          product_class: string | null
          product_id: string | null
          stock_unit: string | null
          synced_at: string | null
          warehouse: string | null
        }
        Insert: {
          active_product?: string | null
          avail_on_web?: string | null
          available?: string | null
          description?: string | null
          discontinued?: string | null
          guid_product?: string | null
          guid_product_warehouse?: string | null
          item_type?: string | null
          list_price?: string | null
          list_price_type?: string | null
          list_price_unit?: string | null
          on_hand?: string | null
          on_hand_value?: string | null
          product_class?: string | null
          product_id?: string | null
          stock_unit?: string | null
          synced_at?: string | null
          warehouse?: string | null
        }
        Update: {
          active_product?: string | null
          avail_on_web?: string | null
          available?: string | null
          description?: string | null
          discontinued?: string | null
          guid_product?: string | null
          guid_product_warehouse?: string | null
          item_type?: string | null
          list_price?: string | null
          list_price_type?: string | null
          list_price_unit?: string | null
          on_hand?: string | null
          on_hand_value?: string | null
          product_class?: string | null
          product_id?: string | null
          stock_unit?: string | null
          synced_at?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      stg_acctivate_discontinued_sales: {
        Row: {
          guid_invoice_detail: string | null
          invoice_number: string | null
          product: string | null
          product_class: string | null
          quantity: string | null
          rep_id: string | null
          rep_name: string | null
          sale_date: string | null
          sales_amount: string | null
          sku: string | null
          synced_at: string | null
          week_end: string | null
          week_start: string | null
        }
        Insert: {
          guid_invoice_detail?: string | null
          invoice_number?: string | null
          product?: string | null
          product_class?: string | null
          quantity?: string | null
          rep_id?: string | null
          rep_name?: string | null
          sale_date?: string | null
          sales_amount?: string | null
          sku?: string | null
          synced_at?: string | null
          week_end?: string | null
          week_start?: string | null
        }
        Update: {
          guid_invoice_detail?: string | null
          invoice_number?: string | null
          product?: string | null
          product_class?: string | null
          quantity?: string | null
          rep_id?: string | null
          rep_name?: string | null
          sale_date?: string | null
          sales_amount?: string | null
          sku?: string | null
          synced_at?: string | null
          week_end?: string | null
          week_start?: string | null
        }
        Relationships: []
      }
      stg_acctivate_inventory_summary: {
        Row: {
          active_product: string | null
          active_warehouse: string | null
          avail_on_web: string | null
          available: string | null
          description: string | null
          discontinued: string | null
          guid_product: string | null
          guid_product_warehouse: string | null
          item_type: string | null
          on_hand: string | null
          on_hand_value: string | null
          product_class: string | null
          product_id: string | null
          stock_unit: string | null
          synced_at: string | null
          warehouse: string | null
        }
        Insert: {
          active_product?: string | null
          active_warehouse?: string | null
          avail_on_web?: string | null
          available?: string | null
          description?: string | null
          discontinued?: string | null
          guid_product?: string | null
          guid_product_warehouse?: string | null
          item_type?: string | null
          on_hand?: string | null
          on_hand_value?: string | null
          product_class?: string | null
          product_id?: string | null
          stock_unit?: string | null
          synced_at?: string | null
          warehouse?: string | null
        }
        Update: {
          active_product?: string | null
          active_warehouse?: string | null
          avail_on_web?: string | null
          available?: string | null
          description?: string | null
          discontinued?: string | null
          guid_product?: string | null
          guid_product_warehouse?: string | null
          item_type?: string | null
          on_hand?: string | null
          on_hand_value?: string | null
          product_class?: string | null
          product_id?: string | null
          stock_unit?: string | null
          synced_at?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      stg_acctivate_invoice_headers_sync: {
        Row: {
          branch_id: string | null
          completed: boolean | null
          customer_id: string | null
          customer_name: string | null
          fob: string | null
          guid_customer: string | null
          guid_invoice: string | null
          invoice_date: string | null
          invoice_number: string | null
          invoice_type: string | null
          posted_to_ar: boolean | null
          sales_rep_id: string | null
          sales_rep_name: string | null
          ship_via: string | null
          shipping_charge: string | null
          territory: string | null
          total_amount: string | null
        }
        Insert: {
          branch_id?: string | null
          completed?: boolean | null
          customer_id?: string | null
          customer_name?: string | null
          fob?: string | null
          guid_customer?: string | null
          guid_invoice?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: string | null
          posted_to_ar?: boolean | null
          sales_rep_id?: string | null
          sales_rep_name?: string | null
          ship_via?: string | null
          shipping_charge?: string | null
          territory?: string | null
          total_amount?: string | null
        }
        Update: {
          branch_id?: string | null
          completed?: boolean | null
          customer_id?: string | null
          customer_name?: string | null
          fob?: string | null
          guid_customer?: string | null
          guid_invoice?: string | null
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_type?: string | null
          posted_to_ar?: boolean | null
          sales_rep_id?: string | null
          sales_rep_name?: string | null
          ship_via?: string | null
          shipping_charge?: string | null
          territory?: string | null
          total_amount?: string | null
        }
        Relationships: []
      }
      stg_acctivate_order_lines_backfill: {
        Row: {
          amount: string | null
          completed: boolean | null
          description: string | null
          freight: boolean | null
          freight_amount: string | null
          guid_order: string | null
          guid_order_detail: string | null
          invoice_discount_amount: string | null
          line_cancelled: boolean | null
          line_discount_pct: string | null
          line_number: number | null
          line_type: string | null
          original_price: string | null
          product_id: string | null
          qty_backordered: string | null
          qty_invoiced: string | null
          qty_ordered: string | null
          qty_shipped: string | null
          sales_category: string | null
          sched_amount: string | null
          tariff_amount: string | null
        }
        Insert: {
          amount?: string | null
          completed?: boolean | null
          description?: string | null
          freight?: boolean | null
          freight_amount?: string | null
          guid_order?: string | null
          guid_order_detail?: string | null
          invoice_discount_amount?: string | null
          line_cancelled?: boolean | null
          line_discount_pct?: string | null
          line_number?: number | null
          line_type?: string | null
          original_price?: string | null
          product_id?: string | null
          qty_backordered?: string | null
          qty_invoiced?: string | null
          qty_ordered?: string | null
          qty_shipped?: string | null
          sales_category?: string | null
          sched_amount?: string | null
          tariff_amount?: string | null
        }
        Update: {
          amount?: string | null
          completed?: boolean | null
          description?: string | null
          freight?: boolean | null
          freight_amount?: string | null
          guid_order?: string | null
          guid_order_detail?: string | null
          invoice_discount_amount?: string | null
          line_cancelled?: boolean | null
          line_discount_pct?: string | null
          line_number?: number | null
          line_type?: string | null
          original_price?: string | null
          product_id?: string | null
          qty_backordered?: string | null
          qty_invoiced?: string | null
          qty_ordered?: string | null
          qty_shipped?: string | null
          sales_category?: string | null
          sched_amount?: string | null
          tariff_amount?: string | null
        }
        Relationships: []
      }
      stg_acctivate_orders_backfill: {
        Row: {
          completed: boolean | null
          discount_amount: string | null
          entry_date: string | null
          fob: string | null
          guid_customer: string | null
          guid_order: string | null
          guid_salesperson: string | null
          order_date: string | null
          order_number: string | null
          order_status: string | null
          order_type: string | null
          po: string | null
          rep1: string | null
          rep2: string | null
          requested_ship_date: string | null
          sales_tax: string | null
          sched_subtotal: string | null
          sched_total_amount: string | null
          ship_to_description: string | null
          ship_via: string | null
          sold_to_name: string | null
          subtotal: string | null
          total_amount: string | null
          updated_date: string | null
        }
        Insert: {
          completed?: boolean | null
          discount_amount?: string | null
          entry_date?: string | null
          fob?: string | null
          guid_customer?: string | null
          guid_order?: string | null
          guid_salesperson?: string | null
          order_date?: string | null
          order_number?: string | null
          order_status?: string | null
          order_type?: string | null
          po?: string | null
          rep1?: string | null
          rep2?: string | null
          requested_ship_date?: string | null
          sales_tax?: string | null
          sched_subtotal?: string | null
          sched_total_amount?: string | null
          ship_to_description?: string | null
          ship_via?: string | null
          sold_to_name?: string | null
          subtotal?: string | null
          total_amount?: string | null
          updated_date?: string | null
        }
        Update: {
          completed?: boolean | null
          discount_amount?: string | null
          entry_date?: string | null
          fob?: string | null
          guid_customer?: string | null
          guid_order?: string | null
          guid_salesperson?: string | null
          order_date?: string | null
          order_number?: string | null
          order_status?: string | null
          order_type?: string | null
          po?: string | null
          rep1?: string | null
          rep2?: string | null
          requested_ship_date?: string | null
          sales_tax?: string | null
          sched_subtotal?: string | null
          sched_total_amount?: string | null
          ship_to_description?: string | null
          ship_via?: string | null
          sold_to_name?: string | null
          subtotal?: string | null
          total_amount?: string | null
          updated_date?: string | null
        }
        Relationships: []
      }
      stg_acctivate_po_lines: {
        Row: {
          amount_open: string | null
          amount_received: string | null
          complete: string | null
          description: string | null
          guid_po: string | null
          guid_po_detail: string | null
          line_amount: string | null
          line_number: string | null
          line_type: string | null
          po_number: string | null
          po_status: string | null
          po_type: string | null
          price_requested: string | null
          product_id: string | null
          quantity_invoiced: string | null
          quantity_ordered: string | null
          quantity_outstanding: string | null
          quantity_received: string | null
          sales_order_number: string | null
          supplier_product_id: string | null
          synced_at: string | null
          unit: string | null
          warehouse: string | null
        }
        Insert: {
          amount_open?: string | null
          amount_received?: string | null
          complete?: string | null
          description?: string | null
          guid_po?: string | null
          guid_po_detail?: string | null
          line_amount?: string | null
          line_number?: string | null
          line_type?: string | null
          po_number?: string | null
          po_status?: string | null
          po_type?: string | null
          price_requested?: string | null
          product_id?: string | null
          quantity_invoiced?: string | null
          quantity_ordered?: string | null
          quantity_outstanding?: string | null
          quantity_received?: string | null
          sales_order_number?: string | null
          supplier_product_id?: string | null
          synced_at?: string | null
          unit?: string | null
          warehouse?: string | null
        }
        Update: {
          amount_open?: string | null
          amount_received?: string | null
          complete?: string | null
          description?: string | null
          guid_po?: string | null
          guid_po_detail?: string | null
          line_amount?: string | null
          line_number?: string | null
          line_type?: string | null
          po_number?: string | null
          po_status?: string | null
          po_type?: string | null
          price_requested?: string | null
          product_id?: string | null
          quantity_invoiced?: string | null
          quantity_ordered?: string | null
          quantity_outstanding?: string | null
          quantity_received?: string | null
          sales_order_number?: string | null
          supplier_product_id?: string | null
          synced_at?: string | null
          unit?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      stg_acctivate_po_summary: {
        Row: {
          cargo_ready_date: string | null
          container_num: string | null
          currency: string | null
          customs_broker: string | null
          date_completed: string | null
          dc: string | null
          dc_inv_rec: string | null
          drayage: string | null
          drayage_paid: string | null
          drayage_quote: string | null
          due_date: string | null
          due_in_port: string | null
          email: string | null
          entered_date: string | null
          fob: string | null
          forwarder: string | null
          guid_po: string | null
          invoiced_amount: string | null
          invoiced_qty: string | null
          issued_date: string | null
          line_count: string | null
          notes: string | null
          ocean_freight_paid: string | null
          ocean_freight_quote: string | null
          ordered_qty: string | null
          orig_eta: string | null
          orig_etd: string | null
          outstanding_amount: string | null
          outstanding_qty: string | null
          percent_invoiced: string | null
          percent_received: string | null
          phone: string | null
          pi_factory_date: string | null
          po_number: string | null
          po_status: string | null
          poa: string | null
          promised_delivery_date: string | null
          received_amount: string | null
          received_qty: string | null
          reference: string | null
          related_doc: string | null
          requested_delivery_date: string | null
          sales_order: string | null
          ship_via: string | null
          short_product_description: string | null
          special_instructions: string | null
          ssl: string | null
          status_date: string | null
          synced_at: string | null
          tariff_paid: string | null
          terms_code: string | null
          total_amount: string | null
          type: string | null
          vendor_contact: string | null
          vendor_id: string | null
          vendor_type: string | null
          vessel: string | null
          warehouse: string | null
        }
        Insert: {
          cargo_ready_date?: string | null
          container_num?: string | null
          currency?: string | null
          customs_broker?: string | null
          date_completed?: string | null
          dc?: string | null
          dc_inv_rec?: string | null
          drayage?: string | null
          drayage_paid?: string | null
          drayage_quote?: string | null
          due_date?: string | null
          due_in_port?: string | null
          email?: string | null
          entered_date?: string | null
          fob?: string | null
          forwarder?: string | null
          guid_po?: string | null
          invoiced_amount?: string | null
          invoiced_qty?: string | null
          issued_date?: string | null
          line_count?: string | null
          notes?: string | null
          ocean_freight_paid?: string | null
          ocean_freight_quote?: string | null
          ordered_qty?: string | null
          orig_eta?: string | null
          orig_etd?: string | null
          outstanding_amount?: string | null
          outstanding_qty?: string | null
          percent_invoiced?: string | null
          percent_received?: string | null
          phone?: string | null
          pi_factory_date?: string | null
          po_number?: string | null
          po_status?: string | null
          poa?: string | null
          promised_delivery_date?: string | null
          received_amount?: string | null
          received_qty?: string | null
          reference?: string | null
          related_doc?: string | null
          requested_delivery_date?: string | null
          sales_order?: string | null
          ship_via?: string | null
          short_product_description?: string | null
          special_instructions?: string | null
          ssl?: string | null
          status_date?: string | null
          synced_at?: string | null
          tariff_paid?: string | null
          terms_code?: string | null
          total_amount?: string | null
          type?: string | null
          vendor_contact?: string | null
          vendor_id?: string | null
          vendor_type?: string | null
          vessel?: string | null
          warehouse?: string | null
        }
        Update: {
          cargo_ready_date?: string | null
          container_num?: string | null
          currency?: string | null
          customs_broker?: string | null
          date_completed?: string | null
          dc?: string | null
          dc_inv_rec?: string | null
          drayage?: string | null
          drayage_paid?: string | null
          drayage_quote?: string | null
          due_date?: string | null
          due_in_port?: string | null
          email?: string | null
          entered_date?: string | null
          fob?: string | null
          forwarder?: string | null
          guid_po?: string | null
          invoiced_amount?: string | null
          invoiced_qty?: string | null
          issued_date?: string | null
          line_count?: string | null
          notes?: string | null
          ocean_freight_paid?: string | null
          ocean_freight_quote?: string | null
          ordered_qty?: string | null
          orig_eta?: string | null
          orig_etd?: string | null
          outstanding_amount?: string | null
          outstanding_qty?: string | null
          percent_invoiced?: string | null
          percent_received?: string | null
          phone?: string | null
          pi_factory_date?: string | null
          po_number?: string | null
          po_status?: string | null
          poa?: string | null
          promised_delivery_date?: string | null
          received_amount?: string | null
          received_qty?: string | null
          reference?: string | null
          related_doc?: string | null
          requested_delivery_date?: string | null
          sales_order?: string | null
          ship_via?: string | null
          short_product_description?: string | null
          special_instructions?: string | null
          ssl?: string | null
          status_date?: string | null
          synced_at?: string | null
          tariff_paid?: string | null
          terms_code?: string | null
          total_amount?: string | null
          type?: string | null
          vendor_contact?: string | null
          vendor_id?: string | null
          vendor_type?: string | null
          vessel?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      stg_acctivate_product_prices: {
        Row: {
          effective_date: string | null
          expiration_date: string | null
          guid_product_price: string | null
          high_qty: string | null
          low_qty: string | null
          price: string | null
          price_code: string | null
          price_unit: string | null
          product_id: string | null
          synced_at: string | null
        }
        Insert: {
          effective_date?: string | null
          expiration_date?: string | null
          guid_product_price?: string | null
          high_qty?: string | null
          low_qty?: string | null
          price?: string | null
          price_code?: string | null
          price_unit?: string | null
          product_id?: string | null
          synced_at?: string | null
        }
        Update: {
          effective_date?: string | null
          expiration_date?: string | null
          guid_product_price?: string | null
          high_qty?: string | null
          low_qty?: string | null
          price?: string | null
          price_code?: string | null
          price_unit?: string | null
          product_id?: string | null
          synced_at?: string | null
        }
        Relationships: []
      }
      stg_invoice_detail_pnl_backfill: {
        Row: {
          description: string | null
          freight: boolean | null
          freight_amount: string | null
          guid_invoice: string | null
          guid_invoice_detail: string | null
          invoice_date: string | null
          invoice_detail_amount: string | null
          invoice_number: string | null
          line_amount: string | null
          line_number: number | null
          line_type: string | null
          product_class: string | null
          product_id: string | null
          quantity: string | null
          sales_account_id: string | null
          tariff_amount: string | null
          transaction_date: string | null
          transaction_period: number | null
          transaction_year: number | null
          warehouse: string | null
        }
        Insert: {
          description?: string | null
          freight?: boolean | null
          freight_amount?: string | null
          guid_invoice?: string | null
          guid_invoice_detail?: string | null
          invoice_date?: string | null
          invoice_detail_amount?: string | null
          invoice_number?: string | null
          line_amount?: string | null
          line_number?: number | null
          line_type?: string | null
          product_class?: string | null
          product_id?: string | null
          quantity?: string | null
          sales_account_id?: string | null
          tariff_amount?: string | null
          transaction_date?: string | null
          transaction_period?: number | null
          transaction_year?: number | null
          warehouse?: string | null
        }
        Update: {
          description?: string | null
          freight?: boolean | null
          freight_amount?: string | null
          guid_invoice?: string | null
          guid_invoice_detail?: string | null
          invoice_date?: string | null
          invoice_detail_amount?: string | null
          invoice_number?: string | null
          line_amount?: string | null
          line_number?: number | null
          line_type?: string | null
          product_class?: string | null
          product_id?: string | null
          quantity?: string | null
          sales_account_id?: string | null
          tariff_amount?: string | null
          transaction_date?: string | null
          transaction_period?: number | null
          transaction_year?: number | null
          warehouse?: string | null
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
          {
            foreignKeyName: "tasks_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "v_companywide_reporting_actuals"
            referencedColumns: ["portal_rep_id"]
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
          address: string | null
          contact_name: string | null
          created_at: string
          created_by: string | null
          crm_account_id: string | null
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
          prospect_types: string[]
          raw: Json | null
          rep_email: string | null
          sales_rep: string | null
          status: string | null
          trade_show: string | null
          updated_at: string
        }
        Insert: {
          additional_email?: string | null
          address?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          crm_account_id?: string | null
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
          prospect_types?: string[]
          raw?: Json | null
          rep_email?: string | null
          sales_rep?: string | null
          status?: string | null
          trade_show?: string | null
          updated_at?: string
        }
        Update: {
          additional_email?: string | null
          address?: string | null
          contact_name?: string | null
          created_at?: string
          created_by?: string | null
          crm_account_id?: string | null
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
          prospect_types?: string[]
          raw?: Json | null
          rep_email?: string | null
          sales_rep?: string | null
          status?: string | null
          trade_show?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "trade_show_leads_crm_account_id_fkey"
            columns: ["crm_account_id"]
            isOneToOne: false
            referencedRelation: "crm_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trade_show_leads_crm_account_id_fkey"
            columns: ["crm_account_id"]
            isOneToOne: false
            referencedRelation: "v_prospect_reporting_overview"
            referencedColumns: ["id"]
          },
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
            foreignKeyName: "travel_log_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "v_companywide_reporting_actuals"
            referencedColumns: ["portal_rep_id"]
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
          {
            foreignKeyName: "user_reps_rep_id_fkey"
            columns: ["rep_id"]
            isOneToOne: false
            referencedRelation: "v_companywide_reporting_actuals"
            referencedColumns: ["portal_rep_id"]
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
      dealer_monthly_invoice_totals: {
        Row: {
          dealer_id: string | null
          invoiced: number | null
          invoiced_container: number | null
          invoiced_warehouse: number | null
          month: number | null
          year: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dealer_invoices_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
        ]
      }
      mv_portal_monthly_invoiced_actuals: {
        Row: {
          invoice_count: number | null
          invoiced_actual: number | null
          invoiced_container: number | null
          invoiced_unclassified: number | null
          invoiced_warehouse: number | null
          month_number: number | null
          year: number | null
        }
        Relationships: []
      }
      mv_portal_monthly_net_bookings_actuals: {
        Row: {
          container_bookings_actual: number | null
          month_number: number | null
          net_bookings_actual: number | null
          warehouse_bookings_actual: number | null
          year: number | null
        }
        Relationships: []
      }
      v_acctivate_sales_reps: {
        Row: {
          acctivate_id: string | null
          active: boolean | null
          email: string | null
          id: string | null
          is_active: boolean | null
          manager_acctivate_id: string | null
          manager_name: string | null
          name: string | null
          phone: string | null
          rep_code: string | null
          rep_id: string | null
          rep_name: string | null
          sales_manager: string | null
          salesperson_id: string | null
          status: string | null
          synced_at: string | null
          territory: string | null
          territory_acctivate_id: string | null
          territory_code: string | null
          territory_name: string | null
        }
        Insert: {
          acctivate_id?: string | null
          active?: boolean | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          manager_acctivate_id?: string | null
          manager_name?: string | null
          name?: string | null
          phone?: string | null
          rep_code?: string | null
          rep_id?: string | null
          rep_name?: string | null
          sales_manager?: string | null
          salesperson_id?: string | null
          status?: never
          synced_at?: string | null
          territory?: string | null
          territory_acctivate_id?: string | null
          territory_code?: string | null
          territory_name?: string | null
        }
        Update: {
          acctivate_id?: string | null
          active?: boolean | null
          email?: string | null
          id?: string | null
          is_active?: boolean | null
          manager_acctivate_id?: string | null
          manager_name?: string | null
          name?: string | null
          phone?: string | null
          rep_code?: string | null
          rep_id?: string | null
          rep_name?: string | null
          sales_manager?: string | null
          salesperson_id?: string | null
          status?: never
          synced_at?: string | null
          territory?: string | null
          territory_acctivate_id?: string | null
          territory_code?: string | null
          territory_name?: string | null
        }
        Relationships: []
      }
      v_companywide_reporting_actuals: {
        Row: {
          amount: number | null
          brand_category: string | null
          canonical_rep_key: string | null
          canonical_rep_name: string | null
          customer_id: string | null
          dealer_name: string | null
          description: string | null
          discount_code: string | null
          fulfillment_type: string | null
          invoice_number: string | null
          invoice_type: string | null
          manager_id: string | null
          manager_name: string | null
          metric_type: string | null
          month_number: number | null
          portal_rep_id: string | null
          product_class: string | null
          rep_id: string | null
          rep_name: string | null
          sku: string | null
          transaction_date: string | null
          year: number | null
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
      v_daily_invoiced_actuals: {
        Row: {
          amount: number | null
          brand_category: string | null
          manager_id: string | null
          metric_type: string | null
          rep_id: string | null
          transaction_date: string | null
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
      v_invoice_lines_2026_classified: {
        Row: {
          customer_id: string | null
          formula_net_amount: number | null
          fulfillment_type: string | null
          invoice_branch_id: string | null
          invoice_date: string | null
          invoice_number: string | null
          order_number: string | null
          product_sales_category: string | null
          resolved_branch_id: string | null
        }
        Relationships: []
      }
      v_portal_bookings_line_facts: {
        Row: {
          booking_date: string | null
          branch_id: string | null
          brand_category: string | null
          customer_id: string | null
          dealer_name: string | null
          description: string | null
          discount_code: string | null
          fulfillment_type: string | null
          guid_customer: string | null
          guid_order: string | null
          guid_salesperson: string | null
          net_booking_amount: number | null
          product_class: string | null
          rep1: string | null
          rep2: string | null
          sku: string | null
        }
        Relationships: []
      }
      v_portal_clearance_products: {
        Row: {
          available: number | null
          collection: string | null
          id: string | null
          inventory_value: number | null
          list_price: number | null
          on_hand: number | null
          product: string | null
          retail_value: number | null
          retail_value_price_source: string | null
          sku: string | null
          status: string | null
          warehouse: string | null
        }
        Insert: {
          available?: never
          collection?: string | null
          id?: never
          inventory_value?: never
          list_price?: never
          on_hand?: never
          product?: string | null
          retail_value?: never
          retail_value_price_source?: never
          sku?: string | null
          status?: string | null
          warehouse?: string | null
        }
        Update: {
          available?: never
          collection?: string | null
          id?: never
          inventory_value?: never
          list_price?: never
          on_hand?: never
          product?: string | null
          retail_value?: never
          retail_value_price_source?: never
          sku?: string | null
          status?: string | null
          warehouse?: string | null
        }
        Relationships: []
      }
      v_portal_clearance_sales_analytics: {
        Row: {
          invoice_number: string | null
          product: string | null
          product_class: string | null
          quantity_sold: number | null
          rep_id: string | null
          rep_name: string | null
          sale_date: string | null
          sales_amount: number | null
          sku: string | null
          synced_at: string | null
          week_end: string | null
          week_start: string | null
        }
        Relationships: []
      }
      v_portal_closeout_inventory: {
        Row: {
          active_product: boolean | null
          avail_on_web: boolean | null
          available: number | null
          collection: string | null
          discontinued: boolean | null
          guid_product_warehouse: string | null
          inventory_value: number | null
          is_closeout: boolean | null
          on_hand: number | null
          product: string | null
          sku: string | null
          unit_cost: number | null
          warehouse: string | null
        }
        Insert: {
          active_product?: never
          avail_on_web?: never
          available?: never
          collection?: string | null
          discontinued?: never
          guid_product_warehouse?: string | null
          inventory_value?: never
          is_closeout?: never
          on_hand?: never
          product?: string | null
          sku?: string | null
          unit_cost?: never
          warehouse?: string | null
        }
        Update: {
          active_product?: never
          avail_on_web?: never
          available?: never
          collection?: string | null
          discontinued?: never
          guid_product_warehouse?: string | null
          inventory_value?: never
          is_closeout?: never
          on_hand?: never
          product?: string | null
          sku?: string | null
          unit_cost?: never
          warehouse?: string | null
        }
        Relationships: []
      }
      v_portal_dealer_rep_reporting_lines: {
        Row: {
          amount: number | null
          brand_category: string | null
          customer_id: string | null
          dealer_name: string | null
          description: string | null
          discount_code: string | null
          fulfillment_type: string | null
          invoice_number: string | null
          invoice_type: string | null
          metric_type: string | null
          month_number: number | null
          product_class: string | null
          rep_id: string | null
          rep_name: string | null
          sku: string | null
          transaction_date: string | null
          year: number | null
        }
        Relationships: []
      }
      v_portal_inventory_calendar_events: {
        Row: {
          amount: number | null
          container_number: string | null
          customer_id: string | null
          dealer_name: string | null
          description: string | null
          detail_json: Json | null
          event_date: string | null
          event_type: string | null
          month: number | null
          qty: number | null
          rep_name: string | null
          sku: string | null
          source_doc_number: string | null
          status: string | null
          vendor_name: string | null
          warehouse: string | null
          year: number | null
        }
        Relationships: []
      }
      v_portal_inventory_summary: {
        Row: {
          active: boolean | null
          available: number | null
          collection: string | null
          discontinued: boolean | null
          guid_product_warehouse: string | null
          inventory_value: number | null
          on_hand: number | null
          product: string | null
          sku: string | null
          unit_cost: number | null
          warehouse: string | null
        }
        Insert: {
          active?: boolean | null
          available?: number | null
          collection?: string | null
          discontinued?: boolean | null
          guid_product_warehouse?: never
          inventory_value?: number | null
          on_hand?: number | null
          product?: string | null
          sku?: string | null
          unit_cost?: never
          warehouse?: string | null
        }
        Update: {
          active?: boolean | null
          available?: number | null
          collection?: string | null
          discontinued?: boolean | null
          guid_product_warehouse?: never
          inventory_value?: number | null
          on_hand?: number | null
          product?: string | null
          sku?: string | null
          unit_cost?: never
          warehouse?: string | null
        }
        Relationships: []
      }
      v_portal_invoice_category_diagnostic: {
        Row: {
          apm_agrees: boolean | null
          cat_apm: string | null
          cat_final_000600: string | null
          cat_resolver: string | null
          cat_sol: string | null
          description: string | null
          invoice_number: string | null
          month: string | null
          net_invoice_amount: number | null
          product_id: string | null
          product_id_norm: string | null
        }
        Relationships: []
      }
      v_portal_invoice_line_facts: {
        Row: {
          customer_id: string | null
          dealer_name: string | null
          description: string | null
          display_category: string | null
          fulfillment_type: string | null
          invoice_date: string | null
          invoice_number: string | null
          invoice_type: string | null
          invoice_type_label: string | null
          line_discount_pct: number | null
          net_invoice_amount: number | null
          price: number | null
          product_class: string | null
          product_id: string | null
          qty_invoiced: number | null
          sales_category: string | null
          salesperson_id: string | null
          salesperson_name: string | null
        }
        Relationships: []
      }
      v_portal_monthly_invoiced_actuals: {
        Row: {
          container_invoiced_actual: number | null
          container_percent: number | null
          excluded_charges_actual: number | null
          gross_invoiced_actual: number | null
          invoice_count: number | null
          invoiced_actual: number | null
          month_number: number | null
          unknown_invoiced_actual: number | null
          warehouse_invoiced_actual: number | null
          warehouse_percent: number | null
          year: number | null
        }
        Relationships: []
      }
      v_portal_open_po_lines: {
        Row: {
          amount_open: number | null
          container_num: string | null
          days_late: number | null
          description: string | null
          due_date: string | null
          estimated_arrival: string | null
          forwarder: string | null
          guid_po: string | null
          guid_po_detail: string | null
          line_number: string | null
          line_type: string | null
          po_number: string | null
          po_status: string | null
          po_type: string | null
          quantity_ordered: number | null
          quantity_outstanding: number | null
          quantity_received: number | null
          sales_order_number: string | null
          ship_via: string | null
          shipment_status: string | null
          sku: string | null
          synced_at: string | null
          vendor_id: string | null
          vessel: string | null
          warehouse: string | null
        }
        Relationships: []
      }
      v_portal_open_po_summary: {
        Row: {
          container_number: string | null
          description: string | null
          eta_date: string | null
          expected_receipt_date: string | null
          guid_po: string | null
          guid_po_detail: string | null
          invoice_due_date: string | null
          open_amount: number | null
          po_date: string | null
          po_number: string | null
          po_status: string | null
          product_class: string | null
          qty_open: number | null
          qty_ordered: number | null
          qty_received: number | null
          sku: string | null
          source_synced_at: string | null
          total_amount: number | null
          unit_cost: number | null
          vendor_name: string | null
          warehouse: string | null
        }
        Relationships: []
      }
      v_portal_open_pos: {
        Row: {
          cargo_ready_date: string | null
          container_num: string | null
          customs_broker: string | null
          days_late: number | null
          dc: string | null
          dc_inv_rec: string | null
          due_date: string | null
          due_in_port: string | null
          entered_date: string | null
          estimated_arrival: string | null
          factory_days_late: number | null
          factory_late_status: string | null
          forwarder: string | null
          guid_po: string | null
          issued_date: string | null
          orig_eta: string | null
          orig_etd: string | null
          outstanding_amount: number | null
          outstanding_qty: number | null
          percent_invoiced: number | null
          percent_received: number | null
          pi_factory_date: string | null
          po_number: string | null
          po_status: string | null
          poa: string | null
          promised_delivery_date: string | null
          reference: string | null
          related_doc: string | null
          requested_delivery_date: string | null
          ship_via: string | null
          shipment_status: string | null
          short_product_description: string | null
          ssl: string | null
          synced_at: string | null
          total_amount: number | null
          type: string | null
          vendor_id: string | null
          vessel: string | null
          warehouse: string | null
        }
        Relationships: []
      }
      v_portal_open_sales_order_line_facts: {
        Row: {
          branch_id: string | null
          brand_category: string | null
          customer_id: string | null
          dealer_name: string | null
          description: string | null
          fulfillment_type: string | null
          guid_order: string | null
          line_discount_pct: number | null
          manager_id: string | null
          open_so_amount: number | null
          open_so_discount_amount: number | null
          open_so_gross_amount: number | null
          order_date: string | null
          order_number: string | null
          product_class: string | null
          qty_open: number | null
          qty_ordered: number | null
          qty_shipped: number | null
          rep_id: string | null
          rep_name: string | null
          requested_ship_date: string | null
          sales_category: string | null
          sku: string | null
          unit_price: number | null
          warehouse: string | null
          workflow_status: string | null
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
      v_portal_open_so_backlog: {
        Row: {
          amount: number | null
          customer_id: string | null
          days_until_ship: number | null
          dealer_name: string | null
          description: string | null
          guid_order: string | null
          guid_order_detail: string | null
          line_discount_pct: number | null
          net_open_amount: number | null
          order_date: string | null
          order_number: string | null
          order_status: string | null
          original_price: number | null
          product_class: string | null
          qty_invoiced: number | null
          qty_open: number | null
          qty_ordered: number | null
          qty_shipped: number | null
          rep_name: string | null
          sales_category: string | null
          ship_date: string | null
          ship_status: string | null
          sku: string | null
          source_synced_at: string | null
          warehouse: string | null
        }
        Relationships: []
      }
      v_prospect_reporting_overview: {
        Row: {
          account_type: string | null
          assigned_manager_id: string | null
          assigned_rep_id: string | null
          company_name: string | null
          contact_health: string | null
          contacts_last_60d: number | null
          contacts_last_6mo: number | null
          converted_at: string | null
          converted_at_is_exact: boolean | null
          created_at: string | null
          days_since_contact: number | null
          id: string | null
          is_unassigned: boolean | null
          last_contact_at: string | null
          last_note_preview: string | null
          lifecycle_stage: string | null
          status: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crm_accounts_assigned_manager_id_fkey"
            columns: ["assigned_manager_id"]
            isOneToOne: false
            referencedRelation: "managers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_accounts_assigned_rep_id_fkey"
            columns: ["assigned_rep_id"]
            isOneToOne: false
            referencedRelation: "sales_reps"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crm_accounts_assigned_rep_id_fkey"
            columns: ["assigned_rep_id"]
            isOneToOne: false
            referencedRelation: "v_companywide_reporting_actuals"
            referencedColumns: ["portal_rep_id"]
          },
        ]
      }
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
      backfill_july_2026_invoice_original_price: {
        Args: { p_rows: Json }
        Returns: number
      }
      can_view_manager_task: { Args: { _task_id: string }; Returns: boolean }
      can_view_task_board: { Args: { _board_id: string }; Returns: boolean }
      clear_inventory_staging: { Args: never; Returns: undefined }
      clear_open_pos_staging: { Args: never; Returns: undefined }
      clear_portal_bookings_staging: { Args: never; Returns: undefined }
      create_board_from_template: {
        Args: { p_board_name: string; p_template_id: string }
        Returns: string
      }
      current_dealer_id: { Args: never; Returns: string }
      current_manager_id: { Args: never; Returns: string }
      current_manager_rep_ids: { Args: never; Returns: string[] }
      current_rep_acctivate_ids: { Args: never; Returns: string[] }
      current_rep_id: { Args: never; Returns: string }
      current_rep_ids: { Args: never; Returns: string[] }
      dealer_daily_invoice_net: {
        Args: { p_from: string; p_to: string }
        Returns: {
          dealer_id: string
          invoice_date: string
          net_total: number
        }[]
      }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      get_boards_by_ids: {
        Args: { p_board_ids: string[] }
        Returns: {
          color: string
          id: string
          name: string
        }[]
      }
      get_clearance_analytics: {
        Args: { p_from?: string; p_to?: string }
        Returns: {
          invoice_number: string
          product: string
          product_class: string
          quantity_sold: number
          rep_id: string
          rep_name: string
          sale_date: string
          sales_amount: number
          sku: string
          synced_at: string
          week_end: string
          week_start: string
        }[]
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
      get_distinct_rep_identifiers: {
        Args: never
        Returns: {
          rep_id: string
          rep_name: string
        }[]
      }
      get_manager_reporting_monthly: {
        Args: {
          p_manager_id?: string
          p_rep_ac_ids?: string[]
          p_years?: number[]
        }
        Returns: {
          metric_type: string
          month_number: number
          row_count: number
          total_amount: number
          year: number
        }[]
      }
      get_open_sales_order_lines: {
        Args: {
          p_brand_cats?: string[]
          p_customer_ids?: string[]
          p_entity_key: string
          p_group_by: string
          p_limit?: number
          p_manager_id?: string
          p_offset?: number
          p_rep_ids?: string[]
          p_skus?: string[]
        }
        Returns: {
          brand_category: string
          customer_id: string
          dealer_name: string
          description: string
          fulfillment_type: string
          guid_order: string
          line_discount_pct: number
          net_open_amount: number
          order_date: string
          order_number: string
          product_class: string
          qty_open: number
          qty_ordered: number
          qty_shipped: number
          rep_id: string
          rep_name: string
          requested_ship_date: string
          sku: string
          unit_price: number
          warehouse: string
        }[]
      }
      get_portal_dealer_rep_reporting_lines: {
        Args: {
          p_discount_code?: string
          p_from?: string
          p_limit?: number
          p_metric: string
          p_offset?: number
          p_to?: string
        }
        Returns: {
          amount: number
          brand_category: string
          customer_id: string
          dealer_name: string
          description: string
          fulfillment_type: string
          invoice_number: string
          metric_type: string
          month_number: number
          product_class: string
          rep_id: string
          rep_name: string
          sku: string
          transaction_date: string
          year: number
        }[]
      }
      get_portal_invoiced_lines: {
        Args: never
        Returns: {
          amount: number
          brand_category: string
          customer_id: string
          dealer_name: string
          description: string
          discount_code: string
          fulfillment_type: string
          invoice_number: string
          invoice_type: string
          metric_type: string
          month_number: number
          product_class: string
          rep_id: string
          rep_name: string
          sku: string
          transaction_date: string
          year: number
        }[]
      }
      get_sales_reporting_detail_lines: {
        Args: {
          p_brand_cats?: string[]
          p_collections?: string[]
          p_customer_ids?: string[]
          p_entity_key: string
          p_from: string
          p_group_by: string
          p_limit?: number
          p_manager_id?: string
          p_metric: string
          p_offset?: number
          p_rep_ids?: string[]
          p_skus?: string[]
          p_to: string
        }
        Returns: {
          amount: number
          brand_category: string
          customer_id: string
          dealer_name: string
          description: string
          fulfillment_type: string
          invoice_number: string
          invoice_type: string
          product_class: string
          rep_id: string
          rep_name: string
          sku: string
          transaction_date: string
        }[]
      }
      get_sales_reporting_grouped_rows: {
        Args: {
          p_brand_cats?: string[]
          p_collections?: string[]
          p_comp_from?: string
          p_comp_to?: string
          p_customer_ids?: string[]
          p_from: string
          p_group_by: string
          p_manager_id?: string
          p_metric: string
          p_rep_ids?: string[]
          p_skus?: string[]
          p_to: string
        }
        Returns: {
          comp_amt: number
          comp_lines: number
          container_amt: number
          customer_id: string
          entity_key: string
          entity_label: string
          manager_name: string
          open_so_value: number
          primary_amt: number
          primary_lines: number
          rep_name: string
          territory_name: string
          warehouse_amt: number
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
      is_portal_invoice_category: {
        Args: { product_class: string }
        Returns: boolean
      }
      is_portal_invoice_line: {
        Args: {
          p_description?: string
          p_product_class: string
          p_product_id: string
        }
        Returns: boolean
      }
      is_staff_user: { Args: never; Returns: boolean }
      is_task_board_creator: { Args: { _board_id: string }; Returns: boolean }
      is_trade_show_task: { Args: { _task_id: string }; Returns: boolean }
      kpi_dealer_monthly_invoiced: {
        Args: { p_years: number[] }
        Returns: {
          dealer_id: string
          invoiced: number
          month: number
          year: number
        }[]
      }
      kpi_monthly_booking_rollup: {
        Args: { p_dealer_ids?: string[]; p_years: number[] }
        Returns: {
          booking_count: number
          bookings: number
          bookings_container: number
          bookings_warehouse: number
          month: number
          year: number
        }[]
      }
      kpi_monthly_invoice_rollup: {
        Args: { p_dealer_ids?: string[]; p_years: number[] }
        Returns: {
          invoice_count: number
          invoiced: number
          invoiced_container: number
          invoiced_warehouse: number
          month: number
          year: number
        }[]
      }
      kpi_monthly_portal_invoice_rollup: {
        Args: { p_years: number[] }
        Returns: {
          invoiced: number
          invoiced_container: number
          invoiced_warehouse: number
          month: number
          year: number
        }[]
      }
      log_field_check_in: {
        Args: {
          p_brand?: string
          p_city?: string
          p_crm_account_id?: string
          p_dealer_id: string
          p_dealer_name: string
          p_email?: string
          p_lat?: number
          p_lng?: number
          p_log_type: string
          p_manager_id?: string
          p_new_placement?: string
          p_notes?: string
          p_phone?: string
          p_rep_id?: string
          p_source?: string
          p_state?: string
          p_street_address?: string
          p_visit_date: string
          p_website?: string
        }
        Returns: {
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
        SetofOptions: {
          from: "*"
          to: "dealer_check_ins"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      merge_portal_bookings_from_staging: { Args: never; Returns: undefined }
      merge_portal_discontinued_inventory_from_staging: {
        Args: never
        Returns: undefined
      }
      merge_portal_discontinued_sales_from_staging: {
        Args: never
        Returns: undefined
      }
      merge_portal_inventory_summary_from_staging: {
        Args: never
        Returns: undefined
      }
      merge_portal_invoices_from_staging: { Args: never; Returns: undefined }
      merge_portal_open_pos_from_staging: { Args: never; Returns: undefined }
      merge_portal_product_prices_from_staging: {
        Args: never
        Returns: undefined
      }
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
      reconcile_dealers_source_of_truth: { Args: never; Returns: Json }
      refresh_dealer_monthly_invoice_totals: { Args: never; Returns: undefined }
      refresh_mv_portal_bookings: { Args: never; Returns: undefined }
      refresh_mv_portal_invoiced: { Args: never; Returns: undefined }
      refresh_portal_monthly_invoiced_actuals: {
        Args: never
        Returns: undefined
      }
      refresh_portal_monthly_net_bookings_actuals: {
        Args: never
        Returns: undefined
      }
      refresh_portal_reporting_views: { Args: never; Returns: undefined }
      resolve_invoice_sales_category: {
        Args: { p_product_class: string; p_product_id: string }
        Returns: string
      }
      run_daily_clearance_sync: { Args: never; Returns: undefined }
      run_daily_inventory_sync: { Args: never; Returns: undefined }
      run_daily_open_pos_sync: { Args: never; Returns: undefined }
      run_daily_portal_bookings_sync: { Args: never; Returns: undefined }
      run_daily_portal_reporting_refresh: { Args: never; Returns: undefined }
      sync_invoice_line_quantities_from_staging: {
        Args: never
        Returns: number
      }
      sync_labor_day_participants: {
        Args: never
        Returns: {
          added_cust_id: string
          added_dealer_name: string
          added_rep_id: string
          added_rep_name: string
        }[]
      }
      trigger_clearance_weekly_report: { Args: never; Returns: undefined }
      trigger_notify_weekly_checkins: { Args: never; Returns: undefined }
      trigger_send_daily_performance_email: { Args: never; Returns: undefined }
      trigger_send_labor_day_promo_email: { Args: never; Returns: undefined }
      trigger_send_weekly_review_digest: { Args: never; Returns: undefined }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      app_role: ["admin", "manager", "rep", "dealer"],
      manager_task_status: ["todo", "in_progress", "blocked", "done"],
    },
  },
} as const
