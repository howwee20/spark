import { serve } from "https://deno.land/std@0.208.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Missing required env vars SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type Tier = "Tier1" | "Tier2" | "Tier3";

function computeTier(carma: number): Tier {
  if (carma >= 500) return "Tier3";
  if (carma >= 100) return "Tier2";
  return "Tier1";
}

async function sha256(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const payload = await req.json();
    const { phone_hash, device_id, delta, reason } = payload ?? {};

    if (!device_id || typeof device_id !== "string") {
      return new Response(JSON.stringify({ error: "device_id is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (typeof delta !== "number" || Number.isNaN(delta)) {
      return new Response(JSON.stringify({ error: "delta must be a number" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    if (!reason || typeof reason !== "string") {
      return new Response(JSON.stringify({ error: "reason is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const keyColumn = phone_hash ? "phone_hash" : "device_hash";
    const identityHash = phone_hash
      ? String(phone_hash)
      : await sha256(`device_id:${device_id}`);

    const { data: existingUser, error: fetchError } = await supabase
      .from("users_public")
      .select("id, carma, tier")
      .eq(keyColumn, identityHash)
      .maybeSingle();

    if (fetchError) {
      console.error("fetch user", fetchError);
      return new Response(JSON.stringify({ error: "Failed to fetch user" }), {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    let user = existingUser;

    if (!user) {
      const insertPayload: Record<string, unknown> = {
        carma: 0,
        tier: "Tier1",
        phone_hash: phone_hash ? identityHash : null,
        device_hash: phone_hash ? null : identityHash,
      };

      const { data: inserted, error: insertError } = await supabase
        .from("users_public")
        .insert(insertPayload)
        .select("id, carma, tier")
        .single();

      if (insertError) {
        console.error("insert user", insertError);
        return new Response(JSON.stringify({ error: "Failed to create user" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      user = inserted;
    }

    const currentCarma = typeof user.carma === "number" ? user.carma : 0;
    const nextCarma = currentCarma + delta;
    const nextTier = computeTier(nextCarma);

    if (delta !== 0) {
      const { error: txError } = await supabase
        .from("carma_transactions")
        .insert({ user_id: user.id, delta, reason });

      if (txError) {
        console.error("insert transaction", txError);
        return new Response(JSON.stringify({ error: "Failed to record transaction" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }
    }

    if (delta !== 0 || nextTier !== user.tier || nextCarma !== currentCarma) {
      const { data: updated, error: updateError } = await supabase
        .from("users_public")
        .update({ carma: nextCarma, tier: nextTier })
        .eq("id", user.id)
        .select("carma, tier")
        .single();

      if (updateError) {
        console.error("update user", updateError);
        return new Response(JSON.stringify({ error: "Failed to update user" }), {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      }

      return new Response(JSON.stringify(updated), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    return new Response(
      JSON.stringify({ carma: currentCarma, tier: user.tier ?? computeTier(currentCarma) }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (err) {
    console.error("apply_carma", err);
    return new Response(JSON.stringify({ error: "Unexpected error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});
