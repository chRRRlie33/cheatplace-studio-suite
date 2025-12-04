// verify-code/index.ts (with rate limiting and attempt tracking)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VerifyRequest {
  email: string;
  code: string;
  type: "login" | "signup";
}

// Track failed attempts - max 5 per email per 15 minutes
async function checkAndTrackAttempts(supabase: any, email: string): Promise<{ allowed: boolean; attemptsLeft: number }> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  
  // Count recent failed attempts (codes that were created but not verified and are now expired)
  const { data: recentCodes, error } = await supabase
    .from("verification_codes")
    .select("id, verified, expires_at")
    .eq("email", email)
    .gte("created_at", fifteenMinutesAgo);

  if (error) {
    console.error("Attempt check error:", error);
    return { allowed: true, attemptsLeft: 5 };
  }

  // Count only verification attempts (non-verified codes)
  const attempts = recentCodes?.filter((c: any) => !c.verified).length || 0;
  const maxAttempts = 5;
  
  return {
    allowed: attempts < maxAttempts,
    attemptsLeft: Math.max(0, maxAttempts - attempts)
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body) return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { email, code, type } = body as VerifyRequest;
    if (!email || !code || !type) return new Response(JSON.stringify({ error: "Email, code and type are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Validate code format (8 digits)
    if (!/^\d{6,8}$/.test(code)) {
      return new Response(JSON.stringify({ error: "Invalid code format", valid: false }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing supabase envs");
      return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check rate limit for verification attempts
    const attemptCheck = await checkAndTrackAttempts(supabase, email);
    if (!attemptCheck.allowed) {
      console.log(`Too many verification attempts for email: ${email}`);
      return new Response(JSON.stringify({ 
        error: "Trop de tentatives. Veuillez réessayer dans 15 minutes.",
        valid: false,
        retryAfter: 900
      }), { 
        status: 429, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "Retry-After": "900"
        } 
      });
    }

    // Find valid, non-expired, non-verified code
    const nowIso = new Date().toISOString();
    const { data: verificationData, error: fetchError } = await supabase
      .from("verification_codes")
      .select("*")
      .eq("email", email)
      .eq("code", code)
      .eq("type", type)
      .eq("verified", false)
      .gte("expires_at", nowIso)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching verification code:", fetchError);
      return new Response(JSON.stringify({ error: "Failed to verify code", valid: false }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!verificationData) {
      console.log(`Invalid or expired code attempt for email: ${email}`);
      return new Response(JSON.stringify({ 
        error: "Code invalide ou expiré", 
        valid: false,
        attemptsLeft: attemptCheck.attemptsLeft - 1
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Mark code as verified
    const { error: updErr } = await supabase
      .from("verification_codes")
      .update({ verified: true })
      .eq("id", verificationData.id);

    if (updErr) {
      console.error("Error marking code verified:", updErr);
      return new Response(JSON.stringify({ error: "Failed to update verification status", valid: false }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Clean up old codes for this email
    try {
      await supabase
        .from("verification_codes")
        .delete()
        .eq("email", email)
        .neq("id", verificationData.id);
    } catch (e) {
      // Non-critical, ignore
    }

    console.log(`Code verified successfully for email: ${email}`);
    return new Response(JSON.stringify({ valid: true, message: "Code verified successfully" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Error in verify-code function:", error);
    return new Response(JSON.stringify({ error: "Internal server error", valid: false }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
};

serve(handler);