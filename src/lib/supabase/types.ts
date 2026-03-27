// Manually defined types matching the inv_* schema.
// Replace with `supabase gen types typescript` output when available.

export type Database = {
  public: {
    Tables: {
      inv_categories: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          slug: string;
          parent_id: string | null;
          sort_order: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          slug: string;
          parent_id?: string | null;
          sort_order?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          org_id?: string;
          name?: string;
          slug?: string;
          parent_id?: string | null;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [];
      };
      inv_suppliers: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          contact: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
          notes: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          contact?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          notes?: string | null;
        };
        Update: {
          name?: string;
          contact?: string | null;
          email?: string | null;
          phone?: string | null;
          address?: string | null;
          notes?: string | null;
        };
        Relationships: [];
      };
      inv_locations: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          type: "warehouse" | "store" | "bin" | "virtual";
          address: string | null;
          is_default: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          type: "warehouse" | "store" | "bin" | "virtual";
          address?: string | null;
          is_default?: boolean;
        };
        Update: {
          name?: string;
          type?: "warehouse" | "store" | "bin" | "virtual";
          address?: string | null;
          is_default?: boolean;
        };
        Relationships: [];
      };
      inv_products: {
        Row: {
          id: string;
          org_id: string;
          sku: string;
          name: string;
          description: string | null;
          category_id: string | null;
          supplier_id: string | null;
          barcode: string | null;
          barcode_type: "ean13" | "upc" | "code128" | "qr" | "custom" | null;
          unit: string;
          cost_price: number | null;
          sell_price: number | null;
          images: string[];
          tags: string[];
          status: "active" | "draft" | "archived";
          low_stock_threshold: number;
          metadata: Record<string, unknown>;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          sku: string;
          name: string;
          description?: string | null;
          category_id?: string | null;
          supplier_id?: string | null;
          barcode?: string | null;
          barcode_type?: "ean13" | "upc" | "code128" | "qr" | "custom" | null;
          unit?: string;
          cost_price?: number | null;
          sell_price?: number | null;
          images?: string[];
          tags?: string[];
          status?: "active" | "draft" | "archived";
          low_stock_threshold?: number;
          metadata?: Record<string, unknown>;
        };
        Update: {
          sku?: string;
          name?: string;
          description?: string | null;
          category_id?: string | null;
          supplier_id?: string | null;
          barcode?: string | null;
          barcode_type?: "ean13" | "upc" | "code128" | "qr" | "custom" | null;
          unit?: string;
          cost_price?: number | null;
          sell_price?: number | null;
          images?: string[];
          tags?: string[];
          status?: "active" | "draft" | "archived";
          low_stock_threshold?: number;
          metadata?: Record<string, unknown>;
        };
        Relationships: [];
      };
      inv_product_variants: {
        Row: {
          id: string;
          product_id: string;
          org_id: string;
          sku: string;
          name: string;
          barcode: string | null;
          attributes: Record<string, string>;
          cost_price: number | null;
          sell_price: number | null;
          images: string[];
          status: "active" | "archived";
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          product_id: string;
          org_id: string;
          sku: string;
          name: string;
          barcode?: string | null;
          attributes?: Record<string, string>;
          cost_price?: number | null;
          sell_price?: number | null;
          images?: string[];
          status?: "active" | "archived";
        };
        Update: {
          sku?: string;
          name?: string;
          barcode?: string | null;
          attributes?: Record<string, string>;
          cost_price?: number | null;
          sell_price?: number | null;
          images?: string[];
          status?: "active" | "archived";
        };
        Relationships: [];
      };
      inv_stock: {
        Row: {
          id: string;
          org_id: string;
          product_id: string;
          variant_id: string | null;
          location_id: string;
          quantity: number;
          reserved: number;
          updated_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          product_id: string;
          variant_id?: string | null;
          location_id: string;
          quantity?: number;
          reserved?: number;
        };
        Update: {
          quantity?: number;
          reserved?: number;
        };
        Relationships: [];
      };
      inv_movements: {
        Row: {
          id: string;
          org_id: string;
          product_id: string;
          variant_id: string | null;
          location_id: string;
          type: "receive" | "sale" | "adjustment" | "transfer_in" | "transfer_out" | "return" | "damaged" | "reserved" | "unreserved";
          quantity: number;
          reference: string | null;
          notes: string | null;
          performed_by: string | null;
          api_key_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          product_id: string;
          variant_id?: string | null;
          location_id: string;
          type: "receive" | "sale" | "adjustment" | "transfer_in" | "transfer_out" | "return" | "damaged" | "reserved" | "unreserved";
          quantity: number;
          reference?: string | null;
          notes?: string | null;
          performed_by?: string | null;
          api_key_id?: string | null;
        };
        Update: {
          [key: string]: never;
        };
        Relationships: [];
      };
      inv_api_keys: {
        Row: {
          id: string;
          org_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          permissions: string[];
          rate_limit: number;
          last_used: string | null;
          expires_at: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          org_id: string;
          name: string;
          key_hash: string;
          key_prefix: string;
          permissions?: string[];
          rate_limit?: number;
          expires_at?: string | null;
        };
        Update: {
          name?: string;
          permissions?: string[];
          rate_limit?: number;
          last_used?: string | null;
          expires_at?: string | null;
          is_active?: boolean;
        };
        Relationships: [];
      };
    };
    Functions: {
      inv_adjust_stock: {
        Args: {
          p_org_id: string;
          p_product_id: string;
          p_variant_id: string | null;
          p_location_id: string;
          p_type: string;
          p_quantity: number;
          p_reference?: string | null;
          p_notes?: string | null;
          p_performed_by?: string | null;
          p_api_key_id?: string | null;
        };
        Returns: string;
      };
    };
    Views: Record<string, never>;
    Enums: Record<string, never>;
  };
};

// Convenience type aliases
export type Category = Database["public"]["Tables"]["inv_categories"]["Row"];
export type Supplier = Database["public"]["Tables"]["inv_suppliers"]["Row"];
export type Location = Database["public"]["Tables"]["inv_locations"]["Row"];
export type Product = Database["public"]["Tables"]["inv_products"]["Row"];
export type ProductVariant = Database["public"]["Tables"]["inv_product_variants"]["Row"];
export type Stock = Database["public"]["Tables"]["inv_stock"]["Row"];
export type Movement = Database["public"]["Tables"]["inv_movements"]["Row"];
export type ApiKey = Database["public"]["Tables"]["inv_api_keys"]["Row"];
