/**
 * Internal webhook-publish helper.
 *
 * Call from any route handler that mutates state and should notify
 * registered consumers. Wraps the Postgres `inv_publish_event` function,
 * which atomically writes the event row + fans out delivery rows to
 * subscribers.
 *
 * publishEvent is fire-and-forget from the caller's perspective: if it
 * fails, the source mutation has already happened — we don't unwind.
 * Errors are logged + swallowed.
 *
 * For the delivery side of the loop, see the cron-driven route handler
 * at /api/v1/external-crm/webhooks/deliver (admin-keyed).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";

export const WEBHOOK_EVENTS = {
  RESERVATION_CREATED: "reservation.created",
  RESERVATION_COMMITTED: "reservation.committed",
  RESERVATION_RELEASED: "reservation.released",
  STOCK_LOW: "stock.low_stock",
  STOCK_OUT: "stock.out_of_stock",
} as const;

export type WebhookEventName =
  (typeof WEBHOOK_EVENTS)[keyof typeof WEBHOOK_EVENTS];

export async function publishEvent(
  supabase: SupabaseClient<Database>,
  args: {
    orgId: string;
    event: WebhookEventName;
    payload: Record<string, unknown>;
    source?: string;
  },
): Promise<string | null> {
  try {
    const { data, error } = await supabase.rpc("inv_publish_event", {
      p_org_id: args.orgId,
      p_event: args.event,
      p_payload: args.payload,
      p_source: args.source ?? "route_handler",
    });
    if (error) {
      console.error("[webhook-publish] inv_publish_event failed", error);
      return null;
    }
    return (data as string) ?? null;
  } catch (err) {
    console.error("[webhook-publish] unexpected error", err);
    return null;
  }
}
