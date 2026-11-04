// Minimal hand-written types for the two tables this backend uses.
// Regenerate from a real schema with: supabase gen types typescript --linked

export type Database = {
  public: {
    Tables: {
      castings: {
        Row: {
          id: string;
          title: string;
          category: string;
          city: string;
          status: string;
          pay_min: number | null;
          pay_max: number | null;
          deadline: string | null;
          description: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          category?: string;
          city?: string;
          status?: string;
          pay_min?: number | null;
          pay_max?: number | null;
          deadline?: string | null;
          description?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["castings"]["Insert"]>;
        Relationships: [];
      };
      leads: {
        Row: {
          id: string;
          email: string;
          kind: string;
          message: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          kind: string;
          message?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["leads"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
