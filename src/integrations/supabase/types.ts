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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      accounts: {
        Row: {
          closing_day: number | null
          created_at: string
          credit_limit: number | null
          current_balance: number
          due_day: number | null
          id: string
          include_in_net_worth: boolean
          initial_balance: number
          institution: string | null
          is_active: boolean
          name: string
          scope: Database["public"]["Enums"]["account_scope"]
          type: Database["public"]["Enums"]["account_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          closing_day?: number | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number
          due_day?: number | null
          id?: string
          include_in_net_worth?: boolean
          initial_balance?: number
          institution?: string | null
          is_active?: boolean
          name: string
          scope?: Database["public"]["Enums"]["account_scope"]
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          closing_day?: number | null
          created_at?: string
          credit_limit?: number | null
          current_balance?: number
          due_day?: number | null
          id?: string
          include_in_net_worth?: boolean
          initial_balance?: number
          institution?: string | null
          is_active?: boolean
          name?: string
          scope?: Database["public"]["Enums"]["account_scope"]
          type?: Database["public"]["Enums"]["account_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      attachments: {
        Row: {
          created_at: string
          file_name: string
          file_path: string
          file_size: number | null
          id: string
          mime_type: string | null
          transaction_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          file_name: string
          file_path: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          transaction_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          file_name?: string
          file_path?: string
          file_size?: number | null
          id?: string
          mime_type?: string | null
          transaction_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "attachments_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      budgets: {
        Row: {
          alert_threshold_pct: number
          category_id: string | null
          created_at: string
          id: string
          limit_amount: number
          ref_month: string
          user_id: string
        }
        Insert: {
          alert_threshold_pct?: number
          category_id?: string | null
          created_at?: string
          id?: string
          limit_amount: number
          ref_month: string
          user_id: string
        }
        Update: {
          alert_threshold_pct?: number
          category_id?: string | null
          created_at?: string
          id?: string
          limit_amount?: number
          ref_month?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "budgets_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      cards: {
        Row: {
          brand: string | null
          color: string | null
          created_at: string
          default_due_day: number | null
          id: string
          name: string
          user_id: string
        }
        Insert: {
          brand?: string | null
          color?: string | null
          created_at?: string
          default_due_day?: number | null
          id?: string
          name: string
          user_id: string
        }
        Update: {
          brand?: string | null
          color?: string | null
          created_at?: string
          default_due_day?: number | null
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          color: string | null
          created_at: string
          icon: string | null
          id: string
          is_system: boolean
          kind: Database["public"]["Enums"]["category_kind"]
          name: string
          normalized_name: string | null
          parent_id: string | null
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name: string
          normalized_name?: string | null
          parent_id?: string | null
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          icon?: string | null
          id?: string
          is_system?: boolean
          kind?: Database["public"]["Enums"]["category_kind"]
          name?: string
          normalized_name?: string | null
          parent_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      goal_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          goal_id: string
          id: string
          type: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          goal_id: string
          id?: string
          type?: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          goal_id?: string
          id?: string
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "goal_transactions_goal_id_fkey"
            columns: ["goal_id"]
            isOneToOne: false
            referencedRelation: "goals"
            referencedColumns: ["id"]
          },
        ]
      }
      goals: {
        Row: {
          created_at: string
          current_amount: number
          deadline: string | null
          id: string
          is_completed: boolean
          name: string
          target_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          current_amount?: number
          deadline?: string | null
          id?: string
          is_completed?: boolean
          name: string
          target_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          current_amount?: number
          deadline?: string | null
          id?: string
          is_completed?: boolean
          name?: string
          target_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      installments: {
        Row: {
          amount: number
          card_id: string
          created_at: string
          due_day: number
          id: string
          installment_number: number
          installments_count: number
          paid_at: string | null
          purchase_id: string
          ref_month: string
          status: string
          user_id: string
        }
        Insert: {
          amount: number
          card_id: string
          created_at?: string
          due_day: number
          id?: string
          installment_number: number
          installments_count: number
          paid_at?: string | null
          purchase_id: string
          ref_month: string
          status?: string
          user_id: string
        }
        Update: {
          amount?: number
          card_id?: string
          created_at?: string
          due_day?: number
          id?: string
          installment_number?: number
          installments_count?: number
          paid_at?: string | null
          purchase_id?: string
          ref_month?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "installments_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "installments_purchase_id_fkey"
            columns: ["purchase_id"]
            isOneToOne: false
            referencedRelation: "purchases"
            referencedColumns: ["id"]
          },
        ]
      }
      payees: {
        Row: {
          created_at: string
          default_category_id: string | null
          id: string
          name: string
          notes: string | null
          type: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          default_category_id?: string | null
          id?: string
          name: string
          notes?: string | null
          type?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          default_category_id?: string | null
          id?: string
          name?: string
          notes?: string | null
          type?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payees_default_category_id_fkey"
            columns: ["default_category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_id: string | null
          created_at: string
          email: string | null
          id: string
          name: string
          updated_at: string
          user_id: string
          username: string | null
        }
        Insert: {
          avatar_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id: string
          username?: string | null
        }
        Update: {
          avatar_id?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
          username?: string | null
        }
        Relationships: []
      }
      purchases: {
        Row: {
          card_id: string
          created_at: string
          description: string
          due_day: number
          id: string
          installments_count: number
          notes: string | null
          person: string | null
          start_month: string
          total_amount: number
          user_id: string
        }
        Insert: {
          card_id: string
          created_at?: string
          description: string
          due_day: number
          id?: string
          installments_count: number
          notes?: string | null
          person?: string | null
          start_month: string
          total_amount: number
          user_id: string
        }
        Update: {
          card_id?: string
          created_at?: string
          description?: string
          due_day?: number
          id?: string
          installments_count?: number
          notes?: string | null
          person?: string | null
          start_month?: string
          total_amount?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchases_card_id_fkey"
            columns: ["card_id"]
            isOneToOne: false
            referencedRelation: "cards"
            referencedColumns: ["id"]
          },
        ]
      }
      recurrences: {
        Row: {
          auto_create: boolean
          created_at: string
          frequency: Database["public"]["Enums"]["recurrence_frequency"]
          id: string
          is_active: boolean
          next_date: string | null
          template_payload: Json | null
          user_id: string
        }
        Insert: {
          auto_create?: boolean
          created_at?: string
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          is_active?: boolean
          next_date?: string | null
          template_payload?: Json | null
          user_id: string
        }
        Update: {
          auto_create?: boolean
          created_at?: string
          frequency?: Database["public"]["Enums"]["recurrence_frequency"]
          id?: string
          is_active?: boolean
          next_date?: string | null
          template_payload?: Json | null
          user_id?: string
        }
        Relationships: []
      }
      tags: {
        Row: {
          color: string | null
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      transaction_tags: {
        Row: {
          tag_id: string
          transaction_id: string
        }
        Insert: {
          tag_id: string
          transaction_id: string
        }
        Update: {
          tag_id?: string
          transaction_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transaction_tags_tag_id_fkey"
            columns: ["tag_id"]
            isOneToOne: false
            referencedRelation: "tags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transaction_tags_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      transactions: {
        Row: {
          account_id: string
          amount: number
          category_id: string | null
          counterpart_account_id: string | null
          created_at: string
          deleted_at: string | null
          due_date: string | null
          id: string
          is_reconciled: boolean
          is_reviewed: boolean
          notes: string | null
          payee_id: string | null
          payment_method: string | null
          recurrence_id: string | null
          source: string | null
          status: Database["public"]["Enums"]["transaction_status"]
          transaction_date: string
          type: Database["public"]["Enums"]["transaction_type"]
          updated_at: string
          user_id: string
        }
        Insert: {
          account_id: string
          amount: number
          category_id?: string | null
          counterpart_account_id?: string | null
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          is_reconciled?: boolean
          is_reviewed?: boolean
          notes?: string | null
          payee_id?: string | null
          payment_method?: string | null
          recurrence_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_date?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id: string
        }
        Update: {
          account_id?: string
          amount?: number
          category_id?: string | null
          counterpart_account_id?: string | null
          created_at?: string
          deleted_at?: string | null
          due_date?: string | null
          id?: string
          is_reconciled?: boolean
          is_reviewed?: boolean
          notes?: string | null
          payee_id?: string | null
          payment_method?: string | null
          recurrence_id?: string | null
          source?: string | null
          status?: Database["public"]["Enums"]["transaction_status"]
          transaction_date?: string
          type?: Database["public"]["Enums"]["transaction_type"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "transactions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_counterpart_account_id_fkey"
            columns: ["counterpart_account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_payee_id_fkey"
            columns: ["payee_id"]
            isOneToOne: false
            referencedRelation: "payees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_recurrence_fk"
            columns: ["recurrence_id"]
            isOneToOne: false
            referencedRelation: "recurrences"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_default_accounts_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      create_default_categories_for_user: {
        Args: { p_user_id: string }
        Returns: undefined
      }
      get_login_email_by_username: {
        Args: { p_username: string }
        Returns: string
      }
    }
    Enums: {
      account_scope: "personal" | "business"
      account_type:
        | "cash"
        | "checking"
        | "savings"
        | "credit_card"
        | "investment"
        | "loan"
      category_kind: "income" | "expense" | "transfer"
      recurrence_frequency: "weekly" | "monthly" | "yearly"
      transaction_status: "pending" | "paid" | "overdue" | "canceled"
      transaction_type: "income" | "expense" | "transfer"
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
      account_scope: ["personal", "business"],
      account_type: [
        "cash",
        "checking",
        "savings",
        "credit_card",
        "investment",
        "loan",
      ],
      category_kind: ["income", "expense", "transfer"],
      recurrence_frequency: ["weekly", "monthly", "yearly"],
      transaction_status: ["pending", "paid", "overdue", "canceled"],
      transaction_type: ["income", "expense", "transfer"],
    },
  },
} as const
