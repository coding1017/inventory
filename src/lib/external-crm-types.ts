/**
 * External-CRM REST contract types.
 *
 * These are the request/response shapes for /api/v1/external-crm/*.
 * Copy this file verbatim into the consumer codebase (fieldcrm) to get
 * type-safe access to the inventory service. The file has zero runtime
 * imports and no Next.js / Supabase dependencies — pure type defs.
 *
 * Envelope (every endpoint):
 *   { data: T | null, meta: Meta | null, error: ApiError | null }
 *
 * On success: data is populated, error is null.
 * On failure: error is populated, data is null, HTTP status >= 400.
 */

// ── Envelope ────────────────────────────────────────────────────────────────

export type ApiError = {
  code: ErrorCode;
  message: string;
};

export type Envelope<T> = {
  data: T | null;
  meta: Record<string, unknown> | null;
  error: ApiError | null;
};

export type ErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "ORG_MISMATCH"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "INVALID_JSON"
  | "PRODUCT_NOT_FOUND"
  | "RESERVATION_NOT_FOUND"
  | "RESERVATION_NOT_ACTIVE"
  | "INSUFFICIENT_STOCK"
  | "QUERY_ERROR"
  | "ADJUST_ERROR";

// ── Product lookup ──────────────────────────────────────────────────────────

export type ProductLookupResponse = {
  product: {
    id: string;
    org_id: string;
    sku: string;
    name: string;
    description: string | null;
    barcode: string | null;
    barcode_type: "ean13" | "upc" | "code128" | "qr" | "custom" | null;
    unit: string;
    cost_price: number | null;
    sell_price: number | null;
    images: string[];
    tags: string[];
    status: "active" | "draft" | "archived";
    category_id: string | null;
    supplier_id: string | null;
  };
  /** All non-archived variants for this product. */
  variants: Array<{
    id: string;
    sku: string;
    name: string;
    barcode: string | null;
    attributes: Record<string, string>;
    cost_price: number | null;
    sell_price: number | null;
  }>;
  /**
   * Per-location stock for the product (and variants, if any). If the
   * caller passed `?location_id=…`, this array contains at most one row
   * per (variant_id) for that location.
   */
  stock: StockSnapshot[];
};

export type StockSnapshot = {
  product_id: string;
  variant_id: string | null;
  location_id: string;
  location_name: string;
  /** Stock available to reserve. Reservations already subtracted. */
  quantity: number;
  /** Currently held by open reservations. Informational. */
  reserved: number;
  /** Convenience: physical on-hand = quantity + reserved. */
  on_hand: number;
};

// ── Reservations ────────────────────────────────────────────────────────────

export type CreateReservationRequest = {
  product_id: string;
  variant_id?: string | null;
  location_id: string;
  quantity: number;
  /** Consumer's external reference (e.g. quote_id). Surfaces in the audit log. */
  reference?: string | null;
  /**
   * Consumer-supplied idempotency key, unique per org. If a reservation
   * with this key already exists, the existing reservation is returned
   * without re-running the reserve. Recommended for any non-trivial
   * client that may retry on network errors.
   */
  idempotency_key?: string | null;
  /**
   * Auto-release deadline. If omitted, the reservation does not expire.
   * Format: ISO 8601 timestamp (e.g. "2026-06-13T18:00:00Z").
   */
  expires_at?: string | null;
  notes?: string | null;
};

export type Reservation = {
  id: string;
  org_id: string;
  product_id: string;
  variant_id: string | null;
  location_id: string;
  quantity: number;
  status: "active" | "committed" | "released" | "expired";
  reference: string | null;
  idempotency_key: string | null;
  notes: string | null;
  reserve_movement_id: string | null;
  commit_unreserve_movement_id: string | null;
  commit_sale_movement_id: string | null;
  release_movement_id: string | null;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  committed_at: string | null;
  released_at: string | null;
};

export type CommitReservationRequest = {
  /** Optional — overrides the reservation's original `reference` on the sale movement. */
  reference?: string | null;
  notes?: string | null;
};

export type ReleaseReservationRequest = {
  notes?: string | null;
};

// ── Stock query ─────────────────────────────────────────────────────────────

export type StockQueryResponse = {
  stock: StockSnapshot[];
};
