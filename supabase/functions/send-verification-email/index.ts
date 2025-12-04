// send-verification-email/index.ts (with rate limiting)
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "OPTIONS, POST"
};

interface VerificationRequest {
  email: string;
  type: "login" | "signup";
  user_id?: string;
}

function generateCode(): string {
  // Generate 8-digit code for better security
  return Math.floor(10000000 + Math.random() * 90000000).toString();
}

// Rate limiting: max 5 requests per email per 15 minutes
async function checkRateLimit(supabase: any, email: string): Promise<{ allowed: boolean; remaining: number }> {
  const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from("verification_codes")
    .select("id")
    .eq("email", email)
    .gte("created_at", fifteenMinutesAgo);

  if (error) {
    console.error("Rate limit check error:", error);
    return { allowed: true, remaining: 5 }; // Allow on error to not block legitimate users
  }

  const count = data?.length || 0;
  const maxRequests = 5;
  
  return {
    allowed: count < maxRequests,
    remaining: Math.max(0, maxRequests - count)
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => null);
    if (!body) return new Response(JSON.stringify({ error: "Invalid JSON body" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { email, type, user_id } = body as VerificationRequest;
    if (!email || !type) return new Response(JSON.stringify({ error: "Email and type are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return new Response(JSON.stringify({ error: "Invalid email format" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Envs
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
      return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (!RESEND_API_KEY) {
      console.error("Missing RESEND_API_KEY");
      return new Response(JSON.stringify({ error: "Server configuration error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Check rate limit
    const rateLimit = await checkRateLimit(supabase, email);
    if (!rateLimit.allowed) {
      console.log(`Rate limit exceeded for email: ${email}`);
      return new Response(JSON.stringify({ 
        error: "Trop de tentatives. Veuillez réessayer dans 15 minutes.",
        retryAfter: 900 // 15 minutes in seconds
      }), { 
        status: 429, 
        headers: { 
          ...corsHeaders, 
          "Content-Type": "application/json",
          "Retry-After": "900"
        } 
      });
    }

    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Delete old unverified codes for this email (cleanup)
    try {
      await supabase.from("verification_codes").delete().eq("email", email).eq("verified", false);
    } catch (e) {
      console.warn("Warning: could not delete old codes:", String(e));
    }

    // Insert new code using service role (bypasses RLS)
    let insertedRow: any = null;
    try {
      const { data, error } = await supabase
        .from("verification_codes")
        .insert({ email, code, type, user_id: user_id || null, expires_at: expiresAt, verified: false })
        .select();
      if (error) {
        console.error("Insert verification code error:", error);
        return new Response(JSON.stringify({ error: "Failed to create verification code" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      insertedRow = data?.[0] ?? null;
    } catch (err) {
      console.error("Exception inserting code:", err);
      return new Response(JSON.stringify({ error: "Failed to create verification code" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Build HTML email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: linear-gradient(135deg, #07174a 0%, #0f2b5b 100%); color: #ffffff;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h1 style="color: #7dd3fc; font-size: 28px; margin: 0;">CHEATPLACE-STUDIO</h1>
          <p style="color: #9fb8d9; margin-top: 6px;">Vérification de sécurité</p>
        </div>

        <div style="background: rgba(255,255,255,0.03); border-radius: 12px; padding: 24px; text-align: center; border: 1px solid rgba(125,211,252,0.08);">
          <p style="color: #cfefff; margin-bottom: 18px;">
            ${type === 'login' ? "Voici votre code pour vous connecter :" : "Voici votre code pour finaliser votre inscription :"}
          </p>

          <div style="display:inline-block; background: rgba(0,0,0,0.35); border-radius: 8px; padding: 16px 26px; margin: 18px 0;">
            <span style="font-size:32px; font-weight:700; letter-spacing:4px; color:#7dd3fc;">${code}</span>
          </div>

          <p style="color: #9fb8d9; font-size: 13px; margin-top: 12px;">Ce code expire dans 10 minutes.</p>
        </div>

        <div style="text-align:center; margin-top: 20px; color:#98bcd6; font-size:12px;">
          <p>Si vous n'avez pas demandé ce code, ignorez cet e-mail.</p>
        </div>
      </div>
    `;

    // Send email via Resend
    try {
      const resp = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "CHEATPLACE <onboarding@resend.dev>",
          to: [email],
          subject: `Votre code de vérification • CHEATPLACE`,
          html: emailHtml,
        }),
      });

      if (!resp.ok) {
        const errorBody = await resp.text();
        console.error("Resend error:", resp.status, errorBody);
        // Clean up the code if email failed
        try { await supabase.from("verification_codes").delete().eq("id", insertedRow?.id); } catch(e){/*ignore*/}
        return new Response(JSON.stringify({ error: "Failed to send email" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      console.log("Verification email sent successfully to:", email);
    } catch (err) {
      console.error("Fetch to Resend failed:", String(err));
      try { await supabase.from("verification_codes").delete().eq("id", insertedRow?.id); } catch(e){/*ignore*/}
      return new Response(JSON.stringify({ error: "Failed to contact email provider" }), { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Success - don't expose internal details
    return new Response(JSON.stringify({ success: true, message: "Verification code sent" }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (error: any) {
    console.error("Unhandled error in send-verification-email:", error);
    return new Response(JSON.stringify({ error: "Internal server error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
};

serve(handler);