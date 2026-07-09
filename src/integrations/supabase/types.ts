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
      account_details: {
        Row: {
          account_name: string
          account_number: string
          bank: string
          contact_id: string
          created_at: string
          id: string
        }
        Insert: {
          account_name: string
          account_number: string
          bank: string
          contact_id: string
          created_at?: string
          id?: string
        }
        Update: {
          account_name?: string
          account_number?: string
          bank?: string
          contact_id?: string
          created_at?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_details_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      app_templates: {
        Row: {
          body: string
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      apps: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_labels: {
        Row: {
          chat_id: string
          created_at: string
          id: string
          label_id: string
          user_id: string
        }
        Insert: {
          chat_id: string
          created_at?: string
          id?: string
          label_id: string
          user_id: string
        }
        Update: {
          chat_id?: string
          created_at?: string
          id?: string
          label_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_labels_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chat_labels_label_id_fkey"
            columns: ["label_id"]
            isOneToOne: false
            referencedRelation: "labels"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          amount: number | null
          app_type: string | null
          assigned_user_id: string | null
          avatar_url: string | null
          created_at: string
          day_type: number | null
          deleted_at: string | null
          id: string
          is_archived: boolean | null
          is_blocked: boolean | null
          is_deleted: boolean | null
          is_muted: boolean | null
          is_online: boolean | null
          is_pinned: boolean | null
          last_seen: string | null
          loan_id: string | null
          name: string
          phone: string
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number | null
          app_type?: string | null
          assigned_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          day_type?: number | null
          deleted_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_blocked?: boolean | null
          is_deleted?: boolean | null
          is_muted?: boolean | null
          is_online?: boolean | null
          is_pinned?: boolean | null
          last_seen?: string | null
          loan_id?: string | null
          name: string
          phone: string
          updated_at?: string
          user_id: string
        }
        Update: {
          amount?: number | null
          app_type?: string | null
          assigned_user_id?: string | null
          avatar_url?: string | null
          created_at?: string
          day_type?: number | null
          deleted_at?: string | null
          id?: string
          is_archived?: boolean | null
          is_blocked?: boolean | null
          is_deleted?: boolean | null
          is_muted?: boolean | null
          is_online?: boolean | null
          is_pinned?: boolean | null
          last_seen?: string | null
          loan_id?: string | null
          name?: string
          phone?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      labels: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          user_id: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          user_id: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          user_id?: string
        }
        Relationships: []
      }
      messages: {
        Row: {
          contact_id: string
          content: string
          created_at: string
          deleted_at: string | null
          id: string
          is_deleted: boolean | null
          is_outgoing: boolean
          media_url: string | null
          reactions: Json
          reply_snapshot: Json | null
          reply_to_message_id: string | null
          reply_to_wamid: string | null
          status: string
          template_name: string | null
          template_params: Json | null
          type: string
          user_id: string
          whatsapp_message_id: string | null
        }
        Insert: {
          contact_id: string
          content: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_outgoing?: boolean
          media_url?: string | null
          reactions?: Json
          reply_snapshot?: Json | null
          reply_to_message_id?: string | null
          reply_to_wamid?: string | null
          status?: string
          template_name?: string | null
          template_params?: Json | null
          type?: string
          user_id: string
          whatsapp_message_id?: string | null
        }
        Update: {
          contact_id?: string
          content?: string
          created_at?: string
          deleted_at?: string | null
          id?: string
          is_deleted?: boolean | null
          is_outgoing?: boolean
          media_url?: string | null
          reactions?: Json
          reply_snapshot?: Json | null
          reply_to_message_id?: string | null
          reply_to_wamid?: string | null
          status?: string
          template_name?: string | null
          template_params?: Json | null
          type?: string
          user_id?: string
          whatsapp_message_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_message_id_fkey"
            columns: ["reply_to_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          id: string
          name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_tokens: {
        Row: {
          created_at: string
          device_info: string | null
          id: string
          platform: string | null
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          device_info?: string | null
          id?: string
          platform?: string | null
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          device_info?: string | null
          id?: string
          platform?: string | null
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_messages: {
        Row: {
          contact_id: string | null
          content: string
          created_at: string
          error: string | null
          id: string
          scheduled_at: string
          status: string
          template_language: string | null
          template_name: string | null
          template_params: Json | null
          type: string
          updated_at: string
          user_id: string
        }
        Insert: {
          contact_id?: string | null
          content: string
          created_at?: string
          error?: string | null
          id?: string
          scheduled_at: string
          status?: string
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          type?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          contact_id?: string | null
          content?: string
          created_at?: string
          error?: string | null
          id?: string
          scheduled_at?: string
          status?: string
          template_language?: string | null
          template_name?: string | null
          template_params?: Json | null
          type?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
        ]
      }
      shared_inbox_users: {
        Row: {
          balance: number
          created_at: string
          id: string
          shared_user_id: string
          status: string
          super_user_id: string
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          id?: string
          shared_user_id: string
          status?: string
          super_user_id: string
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          id?: string
          shared_user_id?: string
          status?: string
          super_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      stickers: {
        Row: {
          created_at: string
          id: string
          media_url: string
          mime_type: string
          name: string | null
          source: string
          source_message_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          media_url: string
          mime_type?: string
          name?: string | null
          source?: string
          source_message_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          media_url?: string
          mime_type?: string
          name?: string | null
          source?: string
          source_message_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stickers_source_message_id_fkey"
            columns: ["source_message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      template_mappings: {
        Row: {
          created_at: string
          id: string
          mapped_field: string
          template_name: string
          user_id: string
          variable_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          mapped_field: string
          template_name: string
          user_id: string
          variable_number: number
        }
        Update: {
          created_at?: string
          id?: string
          mapped_field?: string
          template_name?: string
          user_id?: string
          variable_number?: number
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          created_at: string
          direction: string
          error: string | null
          event_type: string
          id: string
          message_type: string | null
          payload: Json | null
          phone_number: string | null
          status: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          direction?: string
          error?: string | null
          event_type: string
          id?: string
          message_type?: string | null
          payload?: Json | null
          phone_number?: string | null
          status?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          direction?: string
          error?: string | null
          event_type?: string
          id?: string
          message_type?: string | null
          payload?: Json | null
          phone_number?: string | null
          status?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      whatsapp_settings: {
        Row: {
          api_token: string | null
          app_id: string | null
          business_account_id: string | null
          created_at: string
          id: string
          is_connected: boolean | null
          last_mapping_failure_reason: string | null
          last_matched_phone_number_id: string | null
          last_real_message_at: string | null
          last_webhook_hit_at: string | null
          phone_number_id: string | null
          updated_at: string
          user_id: string
          verify_token: string | null
          webhook_config_warning: string | null
          webhook_subscription_health: string | null
          webhook_url: string | null
        }
        Insert: {
          api_token?: string | null
          app_id?: string | null
          business_account_id?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean | null
          last_mapping_failure_reason?: string | null
          last_matched_phone_number_id?: string | null
          last_real_message_at?: string | null
          last_webhook_hit_at?: string | null
          phone_number_id?: string | null
          updated_at?: string
          user_id: string
          verify_token?: string | null
          webhook_config_warning?: string | null
          webhook_subscription_health?: string | null
          webhook_url?: string | null
        }
        Update: {
          api_token?: string | null
          app_id?: string | null
          business_account_id?: string | null
          created_at?: string
          id?: string
          is_connected?: boolean | null
          last_mapping_failure_reason?: string | null
          last_matched_phone_number_id?: string | null
          last_real_message_at?: string | null
          last_webhook_hit_at?: string | null
          phone_number_id?: string | null
          updated_at?: string
          user_id?: string
          verify_token?: string | null
          webhook_config_warning?: string | null
          webhook_subscription_health?: string | null
          webhook_url?: string | null
        }
        Relationships: []
      }
      whatsapp_templates: {
        Row: {
          category: string | null
          components: Json | null
          created_at: string
          id: string
          language: string | null
          name: string
          status: string | null
          template_id: string
          user_id: string
        }
        Insert: {
          category?: string | null
          components?: Json | null
          created_at?: string
          id?: string
          language?: string | null
          name: string
          status?: string | null
          template_id: string
          user_id: string
        }
        Update: {
          category?: string | null
          components?: Json | null
          created_at?: string
          id?: string
          language?: string | null
          name?: string
          status?: string | null
          template_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      check_phone_conflict: {
        Args: { _phone: string; _user_id: string }
        Returns: {
          owner_name: string
        }[]
      }
      copy_super_user_credentials: {
        Args: { _shared_user_id: string; _super_user_id: string }
        Returns: undefined
      }
      deduct_shared_credit: {
        Args: { _shared_user_id: string }
        Returns: number
      }
      get_effective_whatsapp_user_id: {
        Args: { _user_id: string }
        Returns: string
      }
      get_users_info: {
        Args: { _ids: string[] }
        Returns: {
          email: string
          name: string
          user_id: string
        }[]
      }
      remove_shared_credentials: {
        Args: { _shared_user_id: string }
        Returns: undefined
      }
      search_users_by_email: {
        Args: { _email: string }
        Returns: {
          email: string
          name: string
          user_id: string
        }[]
      }
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
