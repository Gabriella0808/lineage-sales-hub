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
      dealers: {
        Row: {
          acctivate_id: string | null
          city: string | null
          created_at: string
          email: string | null
          engagement: string | null
          id: string
          last_contact: string | null
          name: string
          phone: string | null
          rep_id: string | null
          revenue: number | null
          state: string | null
          status: string
          territory_id: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          acctivate_id?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          engagement?: string | null
          id?: string
          last_contact?: string | null
          name: string
          phone?: string | null
          rep_id?: string | null
          revenue?: number | null
          state?: string | null
          status?: string
          territory_id?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          acctivate_id?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          engagement?: string | null
          id?: string
          last_contact?: string | null
          name?: string
          phone?: string | null
          rep_id?: string | null
          revenue?: number | null
          state?: string | null
          status?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
    Enums: {},
  },
} as const
