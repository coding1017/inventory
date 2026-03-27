import { createAdminClient } from "@/lib/supabase/admin";
import { NextResponse } from "next/server";

async function hashKey(key: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(key);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type AuthResult = {
  orgId: string;
  keyId: string;
  permissions: string[];
};

export async function verifyApiKey(
  request: Request,
  requiredPermission?: string
): Promise<AuthResult | NextResponse> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return NextResponse.json(
      { data: null, error: { code: "UNAUTHORIZED", message: "Missing API key" } },
      { status: 401 }
    );
  }

  const rawKey = authHeader.slice(7);
  if (!rawKey.startsWith("inv_")) {
    return NextResponse.json(
      { data: null, error: { code: "UNAUTHORIZED", message: "Invalid API key format" } },
      { status: 401 }
    );
  }

  const keyHash = await hashKey(rawKey);
  const supabase = createAdminClient();

  const { data: keyRecord } = await supabase
    .from("inv_api_keys")
    .select("*")
    .eq("key_hash", keyHash)
    .eq("is_active", true)
    .single();

  if (!keyRecord) {
    return NextResponse.json(
      { data: null, error: { code: "UNAUTHORIZED", message: "Invalid or revoked API key" } },
      { status: 401 }
    );
  }

  // Check expiry
  if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
    return NextResponse.json(
      { data: null, error: { code: "UNAUTHORIZED", message: "API key expired" } },
      { status: 401 }
    );
  }

  // Check permissions
  if (requiredPermission && !keyRecord.permissions.includes(requiredPermission)) {
    return NextResponse.json(
      {
        data: null,
        error: {
          code: "FORBIDDEN",
          message: `Missing required permission: ${requiredPermission}`,
        },
      },
      { status: 403 }
    );
  }

  // Update last_used (fire-and-forget)
  supabase
    .from("inv_api_keys")
    .update({ last_used: new Date().toISOString() })
    .eq("id", keyRecord.id)
    .then(() => {});

  return {
    orgId: keyRecord.org_id,
    keyId: keyRecord.id,
    permissions: keyRecord.permissions,
  };
}

export function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
}

export function apiResponse(data: unknown, meta?: unknown, status = 200) {
  return NextResponse.json(
    { data, meta: meta ?? null, error: null },
    { status, headers: corsHeaders() }
  );
}

export function apiError(
  code: string,
  message: string,
  status = 400
) {
  return NextResponse.json(
    { data: null, meta: null, error: { code, message } },
    { status, headers: corsHeaders() }
  );
}
